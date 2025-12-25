const BN = require('bn.js');
const { nBitsToTarget } = require('./nbits_service');

function extractBlockHexToNBits(blockData) {
    const { blockhex, nbits } = blockData;
    const nbitsLE = nbits.match(/../g).reverse().join('');
    const nbitsIndex = blockhex.indexOf(nbitsLE);

    if (nbitsIndex === -1) {
        throw new Error('nbits value not found in blockhex');
    }

    return blockhex.slice(0, nbitsIndex + nbitsLE.length);
}

function adjustTargetForDifficulty(difficulty, networkNBits) {
    const baseTarget = new BN('1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16);
    const networkTarget = nBitsToTarget(parseInt(networkNBits, 16));
    
    let adjustedTarget = baseTarget.div(new BN(Math.round(difficulty)));
    if (adjustedTarget.gt(baseTarget)) {
        adjustedTarget = baseTarget;
    }
    
    if (adjustedTarget.lt(networkTarget)) {
        adjustedTarget = networkTarget;
    }

    return adjustedTarget.toString(16).padStart(64, '0');
}

const generateJob = (ws, block_data, networkNBits) => {
    const jobId = Math.floor(Math.random() * 1000000).toString();
    const adjustedTarget = adjustTargetForDifficulty(ws.difficulty, networkNBits);
    return {
        jobId,
        data: block_data,
        target: adjustedTarget };
};

module.exports = { generateJob, extractBlockHexToNBits };
