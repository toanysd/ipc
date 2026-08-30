const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, exec, spawn } = require('child_process');

// Detect role early from command line args (--role=client or --role=manager)
const cmdRoleArg = process.argv.find(a => a.startsWith('--role='));
const cmdRole = cmdRoleArg ? cmdRoleArg.split('=')[1] : null;

// Separate userData per role to allow manager+client on same machine
if (cmdRole === 'client' || process.argv.includes('--client')) {
    app.setPath('userData', path.join(app.getPath('appData'), 'ServiceManager-Client'));
}

const server = require('./src/server');
const config = require('./src/config');

let mainWindow;
let clientWindow;
let go2rtcProcess;

const configPath = path.join(app.getPath('userData'), 'config.json');

function getRoleFromRegistry() {
    try {
        const output = execSync('reg query HKCU\\Software\\ServiceManager /v Role', { encoding: 'utf8', windowsHide: true });
        const match = output.match(/Role\s+REG_SZ\s+(\w+)/);
        if (match && match[1]) {
            return match[1].toLowerCase();
        }
    } catch (e) {
        // Not found or error
    }
    return null;
}

function setRoleInRegistry(role) {
    try {
        execSync(`reg add HKCU\\Software\\ServiceManager /v Role /t REG_SZ /d ${role} /f`, { windowsHide: true });
    } catch (e) {
        console.error('Failed to set role in registry', e);
    }
}

function getAppRole() {
    // Command line arg takes priority
    if (cmdRole) return cmdRole;
    
    const regRole = getRoleFromRegistry();
    if (regRole) return regRole;

    const conf = config.load(configPath);
    return conf.role;
}

function setAppRole(role) {
    setRoleInRegistry(role);
    const conf = config.load(configPath);
    conf.role = role;
    config.save(configPath, conf);
}

function createSetupWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true
    });
    mainWindow.loadFile('setup.html');
}

async function startManager() {
    // Kill existing process on port 3456 (if not self)
    try {
        const port = 3456;
        if (os.platform() === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', windowsHide: true });
            const lines = output.trim().split('\n');
            if (lines.length > 0 && lines[0]) {
                const parts = lines[0].trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
                    execSync(`taskkill /PID ${pid} /F`, { windowsHide: true });
                }
            }
        }
    } catch (e) {
        // It's ok if nothing is running
    }

    try {
        await server.start(3456, path.join(__dirname, 'dashboard'));
        console.log('[Manager] Web server running at http://localhost:3456');
    } catch (e) {
        console.error('Failed to start server:', e);
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadURL('http://localhost:3456');
    
    // When manager window is closed, keep server running or handle gracefully
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startClient() {
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe')
    });

    clientWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Auto-grant media permissions
    clientWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });

    clientWindow.loadFile(path.join(__dirname, 'client', 'client.html')).catch(() => {
        console.error('Failed to load client.html');
    });

    // Start go2rtc
    const go2rtcPath = path.join(process.resourcesPath, 'go2rtc.exe');
    const localGo2rtc = path.join(__dirname, 'resources', 'go2rtc.exe');
    
    const exeToRun = fs.existsSync(go2rtcPath) ? go2rtcPath : (fs.existsSync(localGo2rtc) ? localGo2rtc : null);
    
    if (exeToRun) {
        go2rtcProcess = spawn(exeToRun, [], { windowsHide: true });
        go2rtcProcess.on('error', (err) => {
            console.error('Failed to start go2rtc', err);
        });
    }
}

app.whenReady().then(() => {
    ipcMain.handle('get-desktop-sources', async () => {
        return await desktopCapturer.getSources({ types: ['window', 'screen'] });
    });

    ipcMain.handle('get-desktop-source', async () => {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
        return sources[0] || null;
    });

    ipcMain.handle('lock-workstation', () => {
        exec('rundll32.exe user32.dll,LockWorkStation');
        return true;
    });

    ipcMain.handle('get-system-info', () => {
        return {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime(),
            hostname: os.hostname()
        };
    });

    ipcMain.handle('switch-role', (event, role) => {
        setAppRole(role);
        app.relaunch();
        app.exit(0);
    });

    const role = getAppRole();

    if (!role) {
        createSetupWindow();
    } else if (role === 'manager') {
        startManager();
    } else if (role === 'client') {
        startClient();
    }
});

// Do not quit when window is closed so web server stays alive for browser access
app.on('window-all-closed', () => {
    // Keep running
});

app.on('will-quit', () => {
    if (go2rtcProcess) {
        try { go2rtcProcess.kill(); } catch(e) {}
    }
});
