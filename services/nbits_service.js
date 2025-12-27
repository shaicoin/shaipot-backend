const BN = require('bn.js');

const maxTarget = new BN('07ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16);

const _targetToNBits = (target) => {
    const targetHex = target.toString(16).padStart(64, '0');
    target = new BN(targetHex, 16);

    let nSize = Math.ceil(target.byteLength());
    let nCompact = 0;

    if (nSize <= 3) {
        nCompact = target.toNumber() << 8 * (3 - nSize);
    } else {
        let bn = target.ushrn(8 * (nSize - 3));
        nCompact = bn.toNumber();
    }

    if (nCompact & 0x00800000) {
        nCompact >>= 8;
        nSize++;
    }

    nCompact |= (nSize << 24);
    nCompact |= (target.isNeg() ? 0x00800000 : 0);

    return nCompact;
}

const _nBitsToTarget = (nBits) => {
    let nSize = nBits >> 24;
    let nWord = nBits & 0x007fffff;

    let target = new BN(0);

    if (nSize <= 3) {
        nWord >>= 8 * (3 - nSize);
        target = new BN(nWord);
    } else {
        target = new BN(nWord);
        target = target.ushln(8 * (nSize - 3));
    }

    const targetHex = target.toString(16).padStart(64, '0');
    target = new BN(targetHex, 16);

    return target;
}

module.exports = {
    targetToNBits: (target) => {
        return _targetToNBits(target)
    },

    nBitsToTarget: (nBits) => {
        return _nBitsToTarget(nBits)
    },

    getDifficultyForShare: (shareNBits) => {
        const shareTarget = _nBitsToTarget(shareNBits);
        const difficulty = maxTarget.div(shareTarget) * 8;
        return Number(difficulty.toString());
    }
}