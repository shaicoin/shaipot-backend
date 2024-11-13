const BN = require('bn.js');
const crypto = require('crypto');
const addon = require('../build/Release/addon');

function extractBlockHexToNBits(blockData) {
    const { blockhex, nbits } = blockData;
    const nbitsLE = nbits.match(/../g).reverse().join('');
    const nbitsIndex = blockhex.indexOf(nbitsLE);

    if (nbitsIndex === -1) {
        throw new Error('nbits value not found in blockhex');
    }

    return blockhex.slice(0, nbitsIndex + nbitsLE.length);
}

function adjustTargetForDifficulty(difficulty) {
    const maxTarget = new BN('000007fffff00000000000000000000000000000000000000000000000000000', 16);
    const adjustedTarget = maxTarget.div(new BN(Math.round(difficulty)));
    if (adjustedTarget.gt(maxTarget)) {
        return maxTarget.toString(16).padStart(64, '0');
    }

    return adjustedTarget.toString(16).padStart(64, '0');
}

const generateJob = (ws, block_data) => {
    const jobId = Math.floor(Math.random() * 1000000).toString();
    const adjustedTarget = adjustTargetForDifficulty(ws.difficulty);
    return {
        jobId,
        data: block_data,
        target: adjustedTarget };
};

function verifyHamiltonianCycle(graph, path) {
    const USHRT_MAX = 65535;

    let path_size = path.indexOf(USHRT_MAX);
    if (path_size === -1) {
        path_size = path.length;
    }

    const n = graph.length;

    if (path_size !== n) {
        return false;
    }

    const verticesInPath = new Set(path.slice(0, path_size));
    if (verticesInPath.size !== n) {
        return false;
    }

    for (let i = 1; i < n; ++i) {
        if (!graph[path[i - 1]][path[i]]) {
            return false;
        }
    }

    if (!graph[path[n - 1]][path[0]]) {
        return false;
    }

    return true;
}

function getGridSize(hash) {
    const minGridSize = 2000;
    const maxGridSize = 2008;
    const grid_size_segment = hash.slice(0, 8);
    const grid_size = parseInt(grid_size_segment, 16);
    const grid_size_final = minGridSize + (grid_size % (maxGridSize - minGridSize));

    return grid_size_final > maxGridSize ? maxGridSize : grid_size_final;
}

function constructShare(blockData, nonce, path) {
    if(blockData.length > 10000) {
        throw new Error('Invalid data');
    }
    const USHRT_MAX = 65535;
    const NUM_NODES = 2008;
    const pathBuffer = Buffer.from(path, 'hex');
    const pathArray = [];

    for (let i = 0; i < pathBuffer.length; i += 2) {
        const val = pathBuffer.readUInt16LE(i);
        if(val === USHRT_MAX) {
            continue;
        }
        pathArray.push(val);
    }

    const ushrtMaxArray = new Array(NUM_NODES).fill(USHRT_MAX);

    const dataToHash = Buffer.concat([
        Buffer.from(blockData, 'hex'),
        Buffer.from(nonce, 'hex'),
        Buffer.from(ushrtMaxArray.map(num => num.toString(16).padStart(4, '0')).join(''), 'hex'),
    ]);

    const hash1 = crypto.createHash('sha256').update(dataToHash).digest().reverse().toString('hex');
    const gridSize = getGridSize(hash1);
    const graph = addon.generateGraph(hash1, gridSize);
    const isValidCycle = verifyHamiltonianCycle(graph, pathArray);

    if (!isValidCycle) {
        throw new Error('Invalid Hamiltonian cycle');
    }

    const finalDataToHash = Buffer.concat([
        Buffer.from(blockData, 'hex'),
        Buffer.from(nonce, 'hex'),
        Buffer.from(path, 'hex'),
    ]);
    const hash2 = crypto.createHash('sha256').update(finalDataToHash).digest();

    return {
        hash: hash2.reverse().toString('hex'),
        data: `${blockData}${nonce}${path}`
    }
}

module.exports = { generateJob, constructShare, extractBlockHexToNBits };
