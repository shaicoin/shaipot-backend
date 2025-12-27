const WebSocket = require('ws');
const { adjustDifficulty, minerLeft, trackShareIssued, periodicDifficultyCheck, trackInvalidShare, resetInvalidShareCount } = require('./difficulty_adjustment_service');
const { generateJob, extractBlockHexToNBits } = require('./share_construction_service');
const { initDB, banIp, isIpBanned, saveShare } = require('./db_service');
const shaicoin_service = require('./shaicoin_service')
const addon = require('../build/Release/addon');

var current_raw_block = null
var block_data = null
var gwss = null
var difficultyCheckInterval = null
var balanceInterval = null
var isShuttingDown = false

const MAX_MESSAGE_SIZE = 10000

const closeConnection = (ws, reason = 'Bye.') => {
    if (isShuttingDown) {
        ws.close(1001, 'Server shutting down');
    } else {
        ws.close(1008, reason);
    }
};

const getIpAddress = (ws) => {
    try {
        const forwardedFor = ws.upgradeReq?.headers['x-forwarded-for'];
    
        if (forwardedFor) {
            const ip = forwardedFor.split(',')[0].trim();
            return ip;
        }
        
        const ip = ws._socket.remoteAddress;
        return ip.replace(/^::ffff:/, '');
    } catch {
        return null
    }
};


function isHexOrAlphabet(str) {
    return /^[0-9a-fA-FA-Za-z]+$/.test(str);
}

const sendJobToWS = (ws) => {
    if (ws.readyState === ws.OPEN && block_data && current_raw_block) {
        const job = generateJob(ws, block_data, current_raw_block.nbits);
        
        ws.currentJob = {
            jobId: job.jobId,
            data: job.data,
            target: job.target
        };
        
        if (ws.minerId) {
            trackShareIssued(ws.minerId);
        }
        ws.send(JSON.stringify({
            type: 'job',
            job_id: job.jobId,
            data: job.data,
            target: job.target,
        }));
    }
}

const distributeJobs = () => {
    if(block_data == null) {
        return
    }

    gwss.clients.forEach((ws) => {
        sendJobToWS(ws)
    });
};

const handleShareSubmission = async (data, ws) => {
    if (isShuttingDown) {
        return;
    }
    
    const { miner_id, nonce, job_id, path: minerPath } = data;

    if (!ws.minerId) {
        try {
            var isValid = await shaicoin_service.validateAddress(miner_id);
            if(isValid) {
                ws.minerId = miner_id;
            } else {
                closeConnection(ws);
                return;
            }
        } catch {
            if (isShuttingDown) return;
            closeConnection(ws);
            return;
        }
    }

    if (!ws.currentJob || String(ws.currentJob.jobId) !== String(job_id)) {
        ws.send(JSON.stringify({ type: 'rejected', message: 'Job ID mismatch' }));
        return;
    }

    const matchingJob = ws.currentJob;

    try {
        var isAFrog = false
        const result = await addon.validateShareAsync(
            matchingJob.data,
            nonce,
            minerPath,
            matchingJob.target,
            current_raw_block.expanded,
            current_raw_block.blockhex
        );

        switch(result.type) {
            case 'block_found':
                await shaicoin_service.submitBlock(result.blockHexUpdated);
                await saveShare(miner_id, {
                    target: result.target,
                    nonce: result.nonce,
                    hash: result.hash,
                    path: result.path
                });
                resetInvalidShareCount(miner_id);
                ws.send(JSON.stringify({ type: 'accepted' }));
                break;

            case 'share_accepted':
                await saveShare(miner_id, {
                    target: result.target,
                    nonce: result.nonce,
                    hash: result.hash,
                    path: result.path
                });
                resetInvalidShareCount(miner_id);
                ws.send(JSON.stringify({ type: 'accepted' }));
                break;

            case 'share_rejected':
                const invalidCount = trackInvalidShare(miner_id);
                ws.send(JSON.stringify({ type: 'rejected' }));
                if (invalidCount >= 8) {
                    closeConnection(ws);
                }
                break;

            case 'error':
                isAFrog = true
                return;
        }

        ws.lastSubmitTime = Date.now();
        await adjustDifficulty(miner_id, ws, `0x${current_raw_block.nbits}`);

        sendJobToWS(ws);
    } catch (error) {
        if (isShuttingDown) return;
        console.error('Error processing share:', error);
        ws.send(JSON.stringify({ type: 'rejected' }));
    }
};

const banAndDisconnectIp = async (ws) => {
    try {
        const ipAddress = getIpAddress(ws);
        if(ipAddress) {
            await banIp(ipAddress);
            gwss.clients.forEach((client) => {
                if (getIpAddress(client) === ipAddress) {
                    closeConnection(client);
                }
            });
        }
    } catch (error) {
        console.error(`Error banning and disconnecting IP ${ipAddress}:`, error);
    }
};

function isHexOrAlphabet(str) {
    return /^[0-9a-fA-FA-Za-z]+$/.test(str);
}

const startMiningService = async (port) => {
    await initDB();

    gwss = new WebSocket.Server({ port, maxPayload: MAX_MESSAGE_SIZE });
    
    gwss.on('connection', async (ws, req) => {
        const ipAddress = getIpAddress(ws);
        
        if (ipAddress == null) {
            closeConnection(ws);
            return;
        }

        if (await isIpBanned(ipAddress)) {
            closeConnection(ws);
            return;
        }

        ws.difficulty = 1;

        // Try to extract initial difficulty from URL path
        // Format: /target (e.g., /033)
        if (req && req.url && req.url.length > 1) {
            try {
                // Remove leading slash and potential query parameters
                const path = req.url.split('?')[0].substring(1);
                
                // Check if the path is a valid hex string (target prefix)
                if (isHexOrAlphabet(path)) {
                    const BN = require('bn.js');
                    const targetPrefix = path.toLowerCase();
                    
                    // Pad to 64 chars (256 bits)
                    let paddedTargetStr = targetPrefix.padEnd(64, '0');
                    
                    // Max target allowed is 1f00... (easiest allowed)
                    // If user provides something larger (e.g. 2f...), cap it at 1f...
                    const maxTargetStr = '1f'.padEnd(64, '0');
                    const maxTargetBN = new BN(maxTargetStr, 16);
                    let userTargetBN = new BN(paddedTargetStr, 16);

                    if (userTargetBN.gt(maxTargetBN)) {
                        userTargetBN = maxTargetBN;
                    }

                    // Calculate difficulty = BaseTarget / UserTarget
                    // BaseTarget is FFFF... (full range)
                    const diff1Target = new BN('1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16);
                    
                    let newDiff = diff1Target.div(userTargetBN).toNumber();
                    if (newDiff < 1) newDiff = 1;

                    ws.difficulty = newDiff;
                    console.log(`[MiningService] Set initial difficulty to ${newDiff} from URL target ${path}`);
                }
            } catch (e) {
                console.error('Error parsing URL for initial difficulty:', e);
            }
        }

        if (block_data && current_raw_block) {
            sendJobToWS(ws)
        }
        global.totalMiners += 1;

        ws.on('message', async (message) => {
            if (message.length > MAX_MESSAGE_SIZE) {
                closeConnection(ws, 'Message too large');
                return;
            }
        
            try {
                const data = JSON.parse(message);
                if (data.type === 'submit') {
                    if (!isHexOrAlphabet(data.miner_id)) {
                        closeConnection(ws, 'Invalid data format');
                        return;
                    }
                    if (!isHexOrAlphabet(data.nonce)) {
                        closeConnection(ws, 'Invalid data format');
                        return;
                    }
                    if (!isHexOrAlphabet(data.job_id)) {
                        closeConnection(ws, 'Invalid data format');
                        return;
                    }
                    if (!isHexOrAlphabet(data.path)) {
                        closeConnection(ws, 'Invalid data format');
                        return;
                    }                    
                    await handleShareSubmission(data, ws);
                }
            } catch (err) {
                closeConnection(ws, 'Invalid JSON');
            }
        });

        ws.on('close', () => {
            if(ws.minerId) {
                minerLeft(ws.minerId)
            }
            ws.currentJob = null;
            ws.difficulty = null;
            global.totalMiners -= 1;
            ws.removeAllListeners('message');
        });
    });

    global.rawDawginIt = (error, rawBlock) => {
        if(error == null) {
            current_raw_block = rawBlock
            block_data = extractBlockHexToNBits(current_raw_block)
            distributeJobs()
        }
    }
    
    difficultyCheckInterval = setInterval(() => {
        if (current_raw_block) {
            periodicDifficultyCheck(gwss, sendJobToWS, `0x${current_raw_block.nbits}`);
        }
    }, 10000);

    await shaicoin_service.sendBalanceToMiners()
    balanceInterval = setInterval(shaicoin_service.sendBalanceToMiners, 30 * 60 * 1000);

    await shaicoin_service.getBlockTemplate()
    console.log(`Mining service started on port ${port}`);
};

const shutdownMiningService = () => {
    console.log('Shutting down mining service...');
    isShuttingDown = true;
    
    if (difficultyCheckInterval) {
        clearInterval(difficultyCheckInterval);
        difficultyCheckInterval = null;
    }
    
    if (balanceInterval) {
        clearInterval(balanceInterval);
        balanceInterval = null;
    }
    
    if (gwss) {
        gwss.close();
        gwss = null;
    }
    
    console.log('Mining service shutdown complete.');
};

const beginShutdown = () => {
    isShuttingDown = true;
};

module.exports = {
    startMiningService,
    shutdownMiningService,
    beginShutdown
};
