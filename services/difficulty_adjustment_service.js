const { getDifficultyForShare, targetToNBits } = require('./nbits_service');

const minerData = {};

const TARGET_SHARE_TIME = 30;
const ROLLING_WINDOW_SIZE = 5;
const BURST_WINDOW_SIZE = 3;
const BURST_THRESHOLD = 10;
const MAX_ADJUSTMENT_FACTOR = 2.0;
const MIN_ADJUSTMENT_FACTOR = 0.5;
const SMOOTHING_FACTOR = 0.3;
const BURST_AGGRESSION = 0.7;

const initializeMinerData = () => {
    return {
        lastShareTimestamp: Date.now(),
        shareIssuedTimestamp: Date.now(),
        rollingSubmissionTimes: [],
        invalidShareCount: 0,
        lastAdjustmentTime: 0
    };
};

const adjustDifficulty = async (minerId, ws, blockNBits) => {
    const blockDifficulty = getDifficultyForShare(blockNBits);
    const now = Date.now();

    if (!minerData[minerId]) {
        minerData[minerId] = initializeMinerData();
        minerData[minerId].lastShareTimestamp = now;
        return;
    }

    const data = minerData[minerId];
    const elapsedTime = (now - data.lastShareTimestamp) / 1000;
    data.lastShareTimestamp = now;
    data.lastAdjustmentTime = now;

    if (data.rollingSubmissionTimes.length >= ROLLING_WINDOW_SIZE) {
        data.rollingSubmissionTimes.shift();
    }
    data.rollingSubmissionTimes.push(elapsedTime);

    let currentDifficulty = ws.difficulty || 1.0;
    
    const recentTimes = data.rollingSubmissionTimes.slice(-BURST_WINDOW_SIZE);
    const recentAvg = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
    
    if (recentTimes.length >= BURST_WINDOW_SIZE && recentAvg < BURST_THRESHOLD) {
        let burstRatio = TARGET_SHARE_TIME / recentAvg;
        burstRatio = Math.min(burstRatio, 5.0);
        let adjustmentFactor = 1 + (burstRatio - 1) * BURST_AGGRESSION;
        currentDifficulty = currentDifficulty * adjustmentFactor;
    } else {
        const avgElapsedTime = data.rollingSubmissionTimes.reduce((a, b) => a + b, 0) / data.rollingSubmissionTimes.length;
        let targetRatio = TARGET_SHARE_TIME / avgElapsedTime;
        targetRatio = Math.max(MIN_ADJUSTMENT_FACTOR, Math.min(MAX_ADJUSTMENT_FACTOR, targetRatio));
        let adjustmentFactor = 1 + (targetRatio - 1) * SMOOTHING_FACTOR;
        currentDifficulty = currentDifficulty * adjustmentFactor;
    }

    currentDifficulty = Math.min(currentDifficulty, blockDifficulty);
    currentDifficulty = Math.max(currentDifficulty, 1);

    ws.difficulty = currentDifficulty;
};

const trackShareIssued = (minerId) => {
    if (!minerData[minerId]) {
        minerData[minerId] = initializeMinerData();
    }
    minerData[minerId].shareIssuedTimestamp = Date.now();
};

const periodicDifficultyCheckForUser = (ws, sendJobCallback, blockNBits) => {
    if (!blockNBits) return;
    if (ws.readyState !== ws.OPEN) return;
    
    const blockDifficulty = getDifficultyForShare(blockNBits);
    const now = Date.now();

    if (!ws.lastSubmitTime) {
        ws.lastSubmitTime = now;
        return;
    }

    const timeSinceLastSubmit = (now - ws.lastSubmitTime) / 1000;

    if (timeSinceLastSubmit < TARGET_SHARE_TIME) {
        return;
    }

    let currentDifficulty = ws.difficulty || 1.0;
    const overdueRatio = timeSinceLastSubmit / TARGET_SHARE_TIME;
    let adjustmentFactor = 1 / overdueRatio;
    adjustmentFactor = Math.max(adjustmentFactor, MIN_ADJUSTMENT_FACTOR);
    adjustmentFactor = 1 + (adjustmentFactor - 1) * SMOOTHING_FACTOR;
    
    currentDifficulty = currentDifficulty * adjustmentFactor;
    currentDifficulty = Math.min(currentDifficulty, blockDifficulty);
    currentDifficulty = Math.max(currentDifficulty, 1);
    
    ws.difficulty = currentDifficulty;
    ws.lastSubmitTime = now;

    if (ws.minerId && minerData[ws.minerId]) {
        minerData[ws.minerId].lastAdjustmentTime = now;
    }

    sendJobCallback(ws);
};

const minerLeft = (minerId) => {
    delete minerData[minerId];
};

const trackInvalidShare = (minerId) => {
    if (!minerData[minerId]) {
        minerData[minerId] = initializeMinerData();
    }
    minerData[minerId].invalidShareCount++;
    return minerData[minerId].invalidShareCount;
};

const resetInvalidShareCount = (minerId) => {
    if (minerData[minerId]) {
        minerData[minerId].invalidShareCount = 0;
    }
};

module.exports = { adjustDifficulty, minerLeft, trackShareIssued, periodicDifficultyCheckForUser, trackInvalidShare, resetInvalidShareCount };
