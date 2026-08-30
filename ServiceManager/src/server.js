const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const auth = require('./auth');

const app = express();

app.use(express.json());

function start(port, dashboardPath) {
    return new Promise((resolve, reject) => {
        // Check if dashboardPath exists, create if not to avoid express static errors
        if (!fs.existsSync(dashboardPath)) {
            fs.mkdirSync(dashboardPath, { recursive: true });
        }

        app.use(express.static(dashboardPath));

        app.post('/api/login', (req, res) => {
            const { pin } = req.body;
            if (auth.verifyPin(pin)) {
                const token = auth.generateToken();
                res.json({ success: true, token });
            } else {
                res.status(401).json({ success: false, message: 'Invalid PIN' });
            }
        });

        // Middleware to verify token for subsequent API calls
        const requireAuth = (req, res, next) => {
            const token = req.headers['authorization']?.replace('Bearer ', '');
            if (auth.validateToken(token)) {
                next();
            } else {
                res.status(401).json({ success: false, message: 'Unauthorized' });
            }
        };

        app.get('/api/status', requireAuth, (req, res) => {
            res.json({
                success: true,
                status: 'running',
                hostname: os.hostname(),
                uptime: os.uptime(),
                platform: os.platform()
            });
        });

        app.get('/api/upnp', requireAuth, (req, res) => {
            // Read UPnP status from status file if it exists, otherwise return mock/default
            const statusPath = path.join(os.tmpdir(), 'upnp_status.json');
            let upnpStatus = { enabled: false, externalIp: null, mappings: [] };
            
            if (fs.existsSync(statusPath)) {
                try {
                    upnpStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                } catch (e) {
                    // Ignore error, use default
                }
            }
            
            res.json({
                success: true,
                upnp: upnpStatus
            });
        });

        // Fallback for SPA routing if needed
        app.get('*', (req, res) => {
            const indexHtml = path.join(dashboardPath, 'index.html');
            if (fs.existsSync(indexHtml)) {
                res.sendFile(indexHtml);
            } else {
                res.status(404).send('Dashboard not found');
            }
        });

        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`Server started on port ${port}`);
            resolve(server);
        }).on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = { start };
