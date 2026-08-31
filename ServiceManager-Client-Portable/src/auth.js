const crypto = require('crypto');
const config = require('./config');
const path = require('path');

// Electron app được resolve lazy để tránh lỗi khi load ngoài main process
function getConfigPath() {
    try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'config.json');
    } catch(e) {
        const os = require('os');
        return path.join(os.homedir(), '.servicemanager', 'config.json');
    }
}

let activeTokens = new Map();

function verifyPin(pin) {
    const conf = config.load(getConfigPath());
    // Fallback về PIN mặc định nếu chưa đặt — người dùng được nhắc đổi qua UI
    const expected = (conf.pin && conf.pin.length > 0) ? conf.pin : config.DEFAULT_PIN;
    return pin === expected;
}

function generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    activeTokens.set(token, expiresAt);
    return token;
}

function validateToken(token) {
    if (!token || !activeTokens.has(token)) return false;
    const expiresAt = activeTokens.get(token);
    if (Date.now() > expiresAt) {
        activeTokens.delete(token);
        return false;
    }
    return true;
}

// Dọn token hết hạn mỗi giờ
setInterval(() => {
    const now = Date.now();
    for (const [token, exp] of activeTokens.entries()) {
        if (now > exp) activeTokens.delete(token);
    }
}, 60 * 60 * 1000);

module.exports = { verifyPin, generateToken, validateToken };
