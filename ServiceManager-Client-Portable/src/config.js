const fs = require('fs');
const path = require('path');

/**
 * PIN mặc định khi chưa thiết lập.
 * Người dùng nên đổi ngay sau lần chạy đầu tiên qua trang Cài đặt.
 * KHÔNG được hardcode PIN cố định ở nơi khác.
 */
const DEFAULT_PIN = '1621';

function getDefault() {
    return {
        role: null,
        pin: DEFAULT_PIN,
        cameras: [],
        supabaseUrl: '',
        supabaseKey: ''
    };
}

function load(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(data);
            return { ...getDefault(), ...parsed };
        }
    } catch (e) {
        console.error('[config] Failed to load config:', e.message);
    }
    return getDefault();
}

function save(configPath, data) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const existing = load(configPath);
        const merged = { ...existing, ...data };
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[config] Failed to save config:', e.message);
        return false;
    }
}

module.exports = { load, save, getDefault, DEFAULT_PIN };
