process.title = 'shaicoin_mining_pool'
global.totalMiners = 0
global.debugLogging = process.argv.includes('--debug')

const express = require('express');
const rateLimit = require('express-rate-limit');
const { startMiningService, shutdownMiningService, beginShutdown } = require('./services/mining_service');
const { shutdownShaicoinService, getRecentBlocks } = require('./services/shaicoin_service');
const { calculatePoolHashrate, getMinerBalance, getRecentShares, shutdownDB } = require('./services/db_service');
const { withdraw_threshold, fee_percentage_outof1000, pool_port, web_port, pool_mining_address, pool_connection } = require('./config.json')
const app = express();
const PORT = process.env.PORT || web_port;

app.set('trust proxy', true);
app.use(express.static('public'));

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

const bannedIps = new Map();
const BAN_DURATION = 10 * 60 * 1000;

app.use((req, res, next) => {
    const clientIp = req.headers['cf-connecting-ip'] || req.ip;

    const banExpireTime = bannedIps.get(clientIp);
    if (banExpireTime && Date.now() < banExpireTime) {
        return res.status(403).json({ error: 'Just chill for a moment.' });
    }

    if (banExpireTime && Date.now() >= banExpireTime) {
        bannedIps.delete(clientIp);
    }

    next();
});

app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
    handler: (req, res) => {
        const clientIp = req.headers['cf-connecting-ip'] || req.ip;
        bannedIps.set(clientIp, Date.now() + BAN_DURATION);
        return res.status(429).json({ error: 'Just chill for a moment.' });
    }
}));

app.get('/pool-stats', async (req, res) => {
    try {
        const totalHashrate = await calculatePoolHashrate();
        const poolConnection = pool_connection ? `${pool_connection}` : 'Unset';
        const poolStats = {
            totalHashrate: `${(totalHashrate).toFixed(2)} H/s`,
            connectedMiners: global.totalMiners,
            minimumPayout: `${(withdraw_threshold / 100000000).toFixed(8)} SHA`,
            pool_fee: (fee_percentage_outof1000 / 1000) * 100,
            poolMiningAddress: pool_mining_address,
            poolConnection: poolConnection
        };
        res.json(poolStats);
    } catch (error) {
        console.error('Error calculating pool hashrate:', error);
        res.status(500).json({ error: 'Error calculating pool hashrate' });
    }
});

app.get('/miner', async (req, res) => {
    try {
        const address = req.query.address;
        if (address) {
            const hashRate = await calculatePoolHashrate(address);
            res.json({
                hashrate: `${(hashRate).toFixed(2)} H/s`,
                currentReward: `${(await getMinerBalance(address) / 100000000).toFixed(8)} SHA`
            });
        } else {
            res.status(404).send();
        }
    } catch (error) {
        res.status(404).send();
    }
});

app.get('/recent-shares', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const address = req.query.address;
        const shares = await getRecentShares(limit, address);
        res.json(shares);
    } catch (error) {
        console.error('Error retrieving recent shares:', error);
        res.status(500).json({ error: 'Error retrieving recent shares' });
    }
});

app.get('/recent-blocks', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 200);
        const blocks = await getRecentBlocks(limit);
        res.json(blocks);
    } catch (error) {
        console.error('Error retrieving recent blocks:', error);
        res.status(500).json({ error: 'Error retrieving recent blocks' });
    }
});

let httpServer = null;
let isShuttingDown = false;

httpServer = app.listen(PORT, async () => {
    console.log(`Web server is running on http://localhost:${PORT}`);
    if (global.debugLogging) {
        console.log('[DEBUG] Debug logging enabled');
    }
    await startMiningService(pool_port);
});

const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    beginShutdown();
    
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    shutdownShaicoinService();
    shutdownMiningService();
    
    if (httpServer) {
        httpServer.close(() => {
            console.log('HTTP server closed.');
        });
    }
    
    await shutdownDB();
    
    console.log('Graceful shutdown complete.');
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
  
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
  