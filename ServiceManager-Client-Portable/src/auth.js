const crypto = require('crypto');
const config = require('./config');
const path = require('path');
const { app } = require('electron');

let activeTokens = new Map();

function verifyPin(pin) {
    const conf = config.load(path.join(app.getPath('userData'), 'config.json'));
    const expectedPin = conf.pin || '1621';
    return pin === expectedPin;
}

function generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    activeTokens.set(token, expiresAt);
    return token;
}

function validateToken(token) {
    if (!token || !activeTokens.has(token)) {
        return false;
    }
    
    const expiresAt = activeTokens.get(token);
    if (Date.now() > expiresAt) {
        activeTokens.delete(token);
        return false;
    }
    
    return true;
}

// Optional cleanup routine for expired tokens
setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of activeTokens.entries()) {
        if (now > expiresAt) {
            activeTokens.delete(token);
        }
    }
}, 60 * 60 * 1000); // Check every hour

module.exports = {
    verifyPin,
    generateToken,
    validateToken
};
