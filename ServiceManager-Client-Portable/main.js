const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync, exec, spawn } = require('child_process');

// Tên hiển thị trong Task Manager và tiến trình
app.setName('Service Manager');

// Tách userData theo role để manager và client cùng máy không xung đột
const cmdRoleArg = process.argv.find(a => a.startsWith('--role='));
const cmdRole    = cmdRoleArg ? cmdRoleArg.split('=')[1] : null;

if (cmdRole === 'client' || process.argv.includes('--client')) {
    app.setPath('userData', path.join(app.getPath('appData'), 'ServiceManager-Client'));
} else {
    app.setPath('userData', path.join(app.getPath('appData'), 'ServiceManager'));
}

const server = require('./src/server');
const config = require('./src/config');

let mainWindow;
let clientWindow;
let go2rtcProcess;

const configPath = path.join(app.getPath('userData'), 'config.json');

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve path to app file, hỗ trợ cả chạy từ source lẫn chạy từ portable exe.
 */
function resolveAppFile(...parts) {
    const candidates = [
        path.join(__dirname, ...parts),
        path.join(process.resourcesPath || '', 'app', ...parts)
    ];
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch(e) {}
    }
    return candidates[0];
}

// ── Role Management ─────────────────────────────────────────────────

function getRoleFromRegistry() {
    try {
        const out = execSync('reg query HKCU\\Software\\ServiceManager /v Role', { encoding: 'utf8', windowsHide: true });
        const m = out.match(/Role\s+REG_SZ\s+(\w+)/);
        return m ? m[1].toLowerCase() : null;
    } catch(e) { return null; }
}

function setRoleInRegistry(role) {
    try {
        execSync(`reg add HKCU\\Software\\ServiceManager /v Role /t REG_SZ /d ${role} /f`, { windowsHide: true });
    } catch(e) { console.error('Registry write failed:', e); }
}

function getAppRole() {
    if (cmdRole) return cmdRole;
    const reg = getRoleFromRegistry();
    if (reg) return reg;
    return config.load(configPath).role || null;
}

function setAppRole(role) {
    setRoleInRegistry(role);
    config.save(configPath, { role });
}

// ── Windows ──────────────────────────────────────────────────────────────

function createSetupWindow() {
    mainWindow = new BrowserWindow({
        width: 560,
        height: 500,   // tăng chút để hiển form Supabase/PIN không bị cắt
        resizable: false,
        webPreferences: {
            preload: resolveAppFile('preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true,
        title: 'Service Manager'
    });
    mainWindow.loadFile(resolveAppFile('setup.html'));
}

async function startManager() {
    const port = 3456;

    // Giải phóng port nếu bị chiếm
    try {
        if (os.platform() === 'win32') {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', windowsHide: true });
            for (const line of out.trim().split('\n').filter(Boolean)) {
                const parts = line.trim().split(/\s+/);
                const pid   = parts[parts.length - 1];
                if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
                    try { execSync(`taskkill /PID ${pid} /F`, { windowsHide: true }); } catch(e) {}
                }
            }
        }
    } catch(e) {}

    try {
        await server.start(port, resolveAppFile('dashboard'));
        console.log('[Manager] Web server: http://127.0.0.1:' + port);
    } catch(e) {
        console.error('[Manager] Failed to start server:', e);
    }

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        webPreferences: {
            preload: resolveAppFile('preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true,
        title: 'Service Manager'
    });

    mainWindow.loadURL('http://127.0.0.1:' + port);
    mainWindow.on('closed', () => { mainWindow = null; });
}

function startClient() {
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe'),
        args: ['--role=client']
    });

    clientWindow = new BrowserWindow({
        show: false,
        title: 'Service Manager',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    clientWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
        callback(permission === 'media');
    });

    clientWindow.loadFile(resolveAppFile('client', 'client.html')).catch(err => {
        console.error('[Client] Failed to load client.html:', err);
    });

    // Khởi động go2rtc kèm theo
    const go2rtcPackaged = path.join(process.resourcesPath || '', 'go2rtc.exe');
    const go2rtcLocal    = resolveAppFile('resources', 'go2rtc.exe');
    const go2rtcExe = fs.existsSync(go2rtcPackaged) ? go2rtcPackaged
                    : fs.existsSync(go2rtcLocal)     ? go2rtcLocal
                    : null;

    if (go2rtcExe) {
        go2rtcProcess = spawn(go2rtcExe, [], { windowsHide: true });
        go2rtcProcess.on('error', err => console.error('[go2rtc] Failed to start:', err));
        console.log('[go2rtc] Started from:', go2rtcExe);
    } else {
        console.warn('[go2rtc] Executable not found.');
    }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────

app.whenReady().then(() => {

    ipcMain.handle('get-desktop-sources', async () => {
        return await desktopCapturer.getSources({ types: ['window', 'screen'] });
    });

    ipcMain.handle('get-desktop-source', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1920, height: 1080 }
        });
        return sources[0] || null;
    });

    ipcMain.handle('lock-workstation', () => {
        exec('rundll32.exe user32.dll,LockWorkStation');
        return true;
    });

    ipcMain.handle('hide-window', () => {
        if (clientWindow) clientWindow.hide();
        return true;
    });

    ipcMain.handle('get-system-info', () => ({
        platform    : os.platform(),
        arch        : os.arch(),
        cpus        : os.cpus(),
        totalMemory : os.totalmem(),
        freeMemory  : os.freemem(),
        uptime      : os.uptime(),
        hostname    : os.hostname()
    }));

    /**
     * save-config: được gọi từ setup.html step 3 trước khi switch-role.
     * data: { role, pin? }
     * Viết vào file config.json trong userData.
     */
    ipcMain.handle('save-config', (event, data) => {
        try {
            const allowed = {};
            if (data.role) allowed.role = data.role;
            if (data.pin && data.pin.length >= 4) allowed.pin = data.pin;
            const ok = config.save(configPath, allowed);
            console.log('[main] save-config:', allowed, '-> ok:', ok);
            return { success: ok };
        } catch(e) {
            console.error('[main] save-config error:', e.message);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('switch-role', (event, role) => {
        setAppRole(role);
        app.relaunch();
        app.exit(0);
    });

    // Khởi chạy đúng mode
    const role = getAppRole();
    if (!role)                   createSetupWindow();
    else if (role === 'manager') startManager();
    else if (role === 'client')  startClient();
});

// Giữ process sống (server Express, go2rtc vẫn chạy nền)
app.on('window-all-closed', () => {});

app.on('will-quit', () => {
    if (go2rtcProcess) {
        try { go2rtcProcess.kill(); } catch(e) {}
    }
    server.stop();
});
