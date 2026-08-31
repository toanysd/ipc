const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const auth = require('./auth');

const app = express();
app.use(express.json());

// Một instance server duy nhất (tránh gọi start() nhiều lần)
let serverInstance = null;

function start(port, dashboardPath) {
    return new Promise((resolve, reject) => {
        if (serverInstance) {
            console.log('[server] Already running.');
            return resolve(serverInstance);
        }

        // Tạo thư mục dashboard nếu chưa có
        if (!fs.existsSync(dashboardPath)) {
            fs.mkdirSync(dashboardPath, { recursive: true });
        }

        app.use(express.static(dashboardPath));

        // ── API: Login ──
        app.post('/api/login', (req, res) => {
            const { pin } = req.body || {};
            if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });
            if (auth.verifyPin(pin)) {
                res.json({ success: true, token: auth.generateToken() });
            } else {
                res.status(401).json({ success: false, message: 'Invalid PIN' });
            }
        });

        // ── Middleware xác thực token ──
        const requireAuth = (req, res, next) => {
            const token = req.headers['authorization']?.replace('Bearer ', '');
            if (auth.validateToken(token)) return next();
            res.status(401).json({ success: false, message: 'Unauthorized' });
        };

        // ── API: Status ──
        app.get('/api/status', requireAuth, (req, res) => {
            res.json({
                success: true,
                status: 'running',
                hostname: os.hostname(),
                uptime: os.uptime(),
                platform: os.platform(),
                arch: os.arch(),
                freeMemory: os.freemem(),
                totalMemory: os.totalmem()
            });
        });

        // ── API: UPnP status (dùng file trung gian từ client) ──
        app.get('/api/upnp', requireAuth, (req, res) => {
            const statusPath = path.join(os.tmpdir(), 'sm_upnp_status.json');
            let upnpStatus = { enabled: false, externalIp: null, mappings: [] };
            if (fs.existsSync(statusPath)) {
                try { upnpStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch(e) {}
            }
            res.json({ success: true, upnp: upnpStatus });
        });

        // ── API: Đổi PIN (yêu cầu token hợp lệ) ──
        app.post('/api/change-pin', requireAuth, (req, res) => {
            const { newPin } = req.body || {};
            if (!newPin || newPin.length < 4) {
                return res.status(400).json({ success: false, message: 'PIN phải tối thiểu 4 ký tự' });
            }
            try {
                const config = require('./config');
                const { app: eApp } = require('electron');
                const cfgPath = path.join(eApp.getPath('userData'), 'config.json');
                config.save(cfgPath, { pin: newPin });
                res.json({ success: true });
            } catch(e) {
                res.status(500).json({ success: false, message: e.message });
            }
        });

        // ── SPA fallback ──
        app.get('*', (req, res) => {
            const indexHtml = path.join(dashboardPath, 'index.html');
            if (fs.existsSync(indexHtml)) {
                res.sendFile(indexHtml);
            } else {
                res.status(404).send('Dashboard not found');
            }
        });

        // Bind 127.0.0.1 — chỉ truy cập nội bộ từ Electron window, tránh lộ ra mạng
        const server = app.listen(port, '127.0.0.1', () => {
            console.log(`[server] Running at http://127.0.0.1:${port}`);
            serverInstance = server;
            resolve(server);
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function stop() {
    if (serverInstance) {
        serverInstance.close();
        serverInstance = null;
    }
}

module.exports = { start, stop };
