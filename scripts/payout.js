const { MongoClient } = require('mongodb');
const axios = require('axios');
const config = require('../config.json');

const BATCH_SIZE = 50;
const RPC_TIMEOUT = 120000;

async function rpcCall(method, params = [], wallet = null) {
    const url = wallet ? `/wallet/${wallet}` : '/';
    const requestBody = {
        jsonrpc: '1.0',
        method: method,
        params: params
    };

    try {
        const response = await axios.post(config.rpc_url + url, requestBody, {
            auth: {
                username: config.rpc_username,
                password: config.rpc_password
            },
            timeout: RPC_TIMEOUT
        });
        
        if (response.data.error) {
            throw new Error(`${method}: ${response.data.error.message}`);
        }
        
        return response.data.result;
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error) {
            throw new Error(`${method}: ${error.response.data.error.message}`);
        }
        throw new Error(`${method}: ${error.message}`);
    }
}

async function validateAddress(address) {
    try {
        const result = await rpcCall('validateaddress', [address]);
        return result.isvalid;
    } catch (error) {
        return false;
    }
}
const MIN_PAYOUT_SATOSHIS = 0.001 * 100000000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let db;
let client;

function satoshisToBitcoin(satoshis) {
    const satoshiBigInt = BigInt(satoshis);
    const divisor = BigInt(1e8);
    const integerPart = satoshiBigInt / divisor;
    const decimalPart = satoshiBigInt % divisor;
    let decimalPartStr = decimalPart.toString().padStart(8, '0');
    decimalPartStr = decimalPartStr.replace(/0+$/, '') || '0';
    return `${integerPart.toString()}.${decimalPartStr}`;
}

async function getFeeRateInBtcPerKb(confirmationTarget = 6, wallet = null) {
    const MIN_FEE_RATE_BTC_KB = 0.0001;
    try {
        const feeEstimate = await rpcCall('estimatesmartfee', [confirmationTarget], wallet);
        console.log(`  estimatesmartfee result: ${JSON.stringify(feeEstimate)}`);
        if (feeEstimate && feeEstimate.feerate) {
            const finalRate = Math.max(feeEstimate.feerate, MIN_FEE_RATE_BTC_KB);
            console.log(`  Using fee rate: ${finalRate} BTC/kB`);
            return finalRate;
        }
        console.log(`  No fee estimate, using minimum: ${MIN_FEE_RATE_BTC_KB} BTC/kB`);
        return MIN_FEE_RATE_BTC_KB;
    } catch (error) {
        console.log(`  Fee estimation failed: ${error.message}, using minimum: ${MIN_FEE_RATE_BTC_KB} BTC/kB`);
        return MIN_FEE_RATE_BTC_KB;
    }
}

async function createAndSendTransaction(outputsMap, wallet = null, confirmationTarget = 6) {
    const formattedOutputs = {};
    for (const [address, amount] of outputsMap) {
        if (formattedOutputs[address]) {
            console.log(`  WARNING: Duplicate in map: ${address}`);
        }
        formattedOutputs[address] = satoshisToBitcoin(amount);
    }
    
    const keys = Object.keys(formattedOutputs);
    console.log(`  Outputs: ${keys.length} unique addresses`);

    console.log('  Creating raw tx...');
    const rawTx = await rpcCall('createrawtransaction', [[], formattedOutputs], wallet);
    
    console.log('  Getting fee rate...');
    const feeRateBtcPerKb = await getFeeRateInBtcPerKb(confirmationTarget, wallet);

    const options = {
        feeRate: feeRateBtcPerKb,
        replaceable: false
    };

    console.log('  Funding tx...');
    const fundedTx = await rpcCall('fundrawtransaction', [rawTx, options], wallet);
    
    console.log('  Signing tx...');
    const signedTx = await rpcCall('signrawtransactionwithwallet', [fundedTx.hex], wallet);
    
    console.log('  Broadcasting tx...');
    const txId = await rpcCall('sendrawtransaction', [signedTx.hex], wallet);

    return txId;
}

const payoutAllBalances = async () => {
    try {
        console.log('Connecting to database...');
        const uri = 'mongodb://localhost:27017';
        const dbName = 'mining_pool';
        
        client = new MongoClient(uri);
        await client.connect();
        db = client.db(dbName);
        const minersCollection = db.collection('miners');
        
        console.log('Fetching miners...');
        const allMiners = await minersCollection.find({ balance: { $gt: 0 } }).toArray();
        console.log(`Found ${allMiners.length} miners with balance > 0`);
        
        if (allMiners.length === 0) {
            console.log('No miners to pay out.');
            await client.close();
            process.exit(0);
            return;
        }
        
        const consolidatedBalances = new Map();
        for (const miner of allMiners) {
            const normalizedId = miner.minerId.toLowerCase().trim();
            const existing = consolidatedBalances.get(normalizedId) || BigInt(0);
            consolidatedBalances.set(normalizedId, existing + BigInt(Math.floor(miner.balance)));
        }
        console.log(`Consolidated to ${consolidatedBalances.size} unique addresses`);
        
        const validOutputs = new Map();
        let skippedLowBalance = 0;
        let skippedInvalidAddress = 0;
        
        const entries = Array.from(consolidatedBalances.entries());
        for (let i = 0; i < entries.length; i++) {
            const [address, balance] = entries[i];
            
            if (i % 20 === 0) {
                console.log(`Validating ${i + 1}/${entries.length}...`);
            }
            
            if (balance < BigInt(MIN_PAYOUT_SATOSHIS)) {
                skippedLowBalance++;
                continue;
            }
            
            const isValid = await validateAddress(address);
            if (!isValid) {
                skippedInvalidAddress++;
                continue;
            }
            
            validOutputs.set(address, balance);
            
            if (i % 50 === 0 && i > 0) {
                await sleep(100);
            }
        }
        
        console.log(`Valid outputs: ${validOutputs.size}`);
        console.log(`Skipped (low balance): ${skippedLowBalance}`);
        console.log(`Skipped (invalid address): ${skippedInvalidAddress}`);
        
        if (validOutputs.size === 0) {
            console.log('No valid outputs to pay.');
            await client.close();
            process.exit(0);
            return;
        }
        
        const outputsArray = Array.from(validOutputs.entries());
        const totalBatches = Math.ceil(outputsArray.length / BATCH_SIZE);
        console.log(`\nProcessing ${outputsArray.length} payouts in ${totalBatches} batch(es) of up to ${BATCH_SIZE}...`);
        
        let successfulPayouts = 0;
        const failedBatches = [];
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const start = batchNum * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, outputsArray.length);
            const batchOutputs = new Map(outputsArray.slice(start, end));
            const batchAddresses = Array.from(batchOutputs.keys());
            
            console.log(`\nBatch ${batchNum + 1}/${totalBatches}: ${batchOutputs.size} outputs`);
            
            console.log(`  Zeroing balances for batch ${batchNum + 1}...`);
            for (const address of batchAddresses) {
                await minersCollection.updateMany(
                    { minerId: address },
                    { $set: { balance: 0 } }
                );
            }
            
            try {
                const txId = await createAndSendTransaction(batchOutputs);
                console.log(`Batch ${batchNum + 1} success! TxID: ${txId}`);
                successfulPayouts += batchAddresses.length;
                
                if (batchNum < totalBatches - 1) {
                    console.log('Waiting 2s before next batch...');
                    await sleep(2000);
                }
            } catch (error) {
                console.error(`Batch ${batchNum + 1} failed: ${error.message}`);
                console.log(`  Restoring balances for failed batch...`);
                for (const [address, amount] of batchOutputs) {
                    await minersCollection.updateMany(
                        { minerId: address },
                        { $inc: { balance: Number(amount) } }
                    );
                }
                failedBatches.push(batchNum + 1);
            }
        }
        
        console.log('\n=== Summary ===');
        console.log(`Successful payouts: ${successfulPayouts}`);
        console.log(`Failed batches: ${failedBatches.length > 0 ? failedBatches.join(', ') : 'None'}`);
        
        await client.close();
        process.exit(failedBatches.length > 0 ? 1 : 0);
    } catch (error) {
        console.error('Error in payout process:', error);
        if (client) await client.close();
        process.exit(1);
    }
};

console.log('Starting payout...');
payoutAllBalances();
