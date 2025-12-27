const { getDifficultyForShare, targetToNBits } = require('./nbits_service');

const minerData = {};

const TARGET_SHARE_TIME = 69;
const ROLLING_WINDOW_SIZE = 15;
const PROACTIVE_FAST_THRESHOLD = 40;

const PID_KP = 0.1;
const PID_KI = 0.01;
const PID_KD = 0.05;

const initializeMinerData = () => {
    return {
        lastShareTimestamp: Date.now(),
        shareIssuedTimestamp: Date.now(),
        pidState: {
            integral: 0,
            lastError: 0
        },
        rollingSubmissionTimes: [],
        invalidShareCount: 0,
        lastProactiveAdjust: Date.now()
    };
};

const adjustDifficulty = async (minerId, ws, blockNBits) => {
    const blockDifficulty = getDifficultyForShare(blockNBits);
    const now = Date.now();

    if (!minerData[minerId]) {
        minerData[minerId] = initializeMinerData();
        return;
    }

    const data = minerData[minerId];
    const elapsedTime = (now - data.lastShareTimestamp) / 1000;

    data.lastShareTimestamp = now;

    if (data.rollingSubmissionTimes.length >= ROLLING_WINDOW_SIZE) {
        data.rollingSubmissionTimes.shift();
    }
    data.rollingSubmissionTimes.push(elapsedTime);

    const avgElapsedTime = data.rollingSubmissionTimes.reduce((a, b) => a + b, 0) / data.rollingSubmissionTimes.length;

    const error = avgElapsedTime - TARGET_SHARE_TIME;

    data.pidState.integral += error;

    data.pidState.integral = Math.max(-100, Math.min(100, data.pidState.integral));

    const derivative = error - data.pidState.lastError;
    data.pidState.lastError = error;

    const pidOutput = (PID_KP * error) + (PID_KI * data.pidState.integral) + (PID_KD * derivative);

    let currentDifficulty = ws.difficulty || 1.0;
    currentDifficulty = currentDifficulty * (1 - pidOutput);

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
    }

    const timeSinceLastSubmit = (now - ws.lastSubmitTime) / 1000;
    let needsNewJob = false;
    let currentDifficulty = ws.difficulty || 1.0;

    if (timeSinceLastSubmit >= TARGET_SHARE_TIME) {
        const overdueRatio = timeSinceLastSubmit / TARGET_SHARE_TIME;
        const adjustmentFactor = Math.max(1 / overdueRatio, 0.1);
        currentDifficulty = currentDifficulty * adjustmentFactor;
        needsNewJob = true;
    } else if (ws.minerId && minerData[ws.minerId]) {
        const data = minerData[ws.minerId];
        if (data.rollingSubmissionTimes.length >= 3) {
            const avgTime = data.rollingSubmissionTimes.reduce((a, b) => a + b, 0) / data.rollingSubmissionTimes.length;
            
            if (avgTime < PROACTIVE_FAST_THRESHOLD) {
                const adjustmentFactor = Math.min(TARGET_SHARE_TIME / avgTime, 3);
                currentDifficulty = currentDifficulty * adjustmentFactor;
                needsNewJob = true;
            } else if (avgTime > TARGET_SHARE_TIME * 1.5) {
                const adjustmentFactor = Math.max(TARGET_SHARE_TIME / avgTime, 0.25);
                currentDifficulty = currentDifficulty * adjustmentFactor;
                needsNewJob = true;
            }
        }
    }

    if (needsNewJob) {
        currentDifficulty = Math.min(currentDifficulty, blockDifficulty);
        currentDifficulty = Math.max(currentDifficulty, 1);
        ws.difficulty = currentDifficulty;
        sendJobCallback(ws);
    }
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
