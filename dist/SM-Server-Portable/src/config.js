const fs = require('fs');
const path = require('path');

function getDefault() {
    return {
        role: null,
        pin: '1621',
        cameras: []
    };
}

function load(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return { ...getDefault(), ...JSON.parse(data) };
        }
    } catch (e) {
        console.error('Failed to load config', e);
    }
    return getDefault();
}

function save(configPath, data) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Merge with existing to avoid overwriting other settings if partial data passed
        const existing = load(configPath);
        const merged = { ...existing, ...data };
        
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Failed to save config', e);
        return false;
    }
}

module.exports = {
    load,
    save,
    getDefault
};
