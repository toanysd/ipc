/**
 * ANTI-THEFT CLIENT — PeerJS Cloud + Local Server
 * 
 * Cơ chế hoạt động:
 * 1. Mở local HTTP server (port 39127) — phục vụ client.html + API hệ thống
 * 2. Mở hidden browser → client.html — kết nối PeerJS Cloud
 * 3. Dashboard từ BẤT KỲ mạng nào gọi đến PeerJS ID → điều khiển
 * 
 * Tính năng:
 * - Screenshot (PowerShell)
 * - Lock workstation
 * - Alarm sound
 * - Device info (hostname, IP, battery...)
 * - Webcam (qua browser getUserMedia)
 */

const http = require('http');
const { execSync, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const CONFIG_FILE = path.join(SCRIPT_DIR, 'config.json');
const HTML_FILE = path.join(SCRIPT_DIR, 'client.html');
const LOG_FILE = path.join(SCRIPT_DIR, 'client.log');
const LOCAL_PORT = 39127;

let CONFIG = { deviceId: '', serverUrl: '' };

// === LOGGING ===
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const logContent = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf-8') : '';
    const lines = logContent.split('\n');
    if (lines.length > 500) fs.writeFileSync(LOG_FILE, lines.slice(-300).join('\n'));
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

// === CONFIG ===
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try { CONFIG = { ...CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) }; } catch {}
  }
  if (!CONFIG.deviceId) {
    CONFIG.deviceId = `at-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 2)); } catch {}
  }
  log(`Device ID: ${CONFIG.deviceId}`);
}

// === SYSTEM INFO ===
function getSystemInfo() {
  const nets = os.networkInterfaces();
  let ip = '127.0.0.1';
  for (const name in nets) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
    }
  }
  let battery = null;
  try {
    const bat = execSync('powershell -Command "(Get-WmiObject Win32_Battery).EstimatedChargeRemaining"',
      { timeout: 5000, encoding: 'utf-8' }).trim();
    if (bat) battery = parseInt(bat);
  } catch {}

  return {
    deviceId: CONFIG.deviceId, hostname: os.hostname(), ip,
    platform: `${os.platform()} ${os.release()}`,
    uptime: Math.floor(os.uptime()), battery,
    cpus: os.cpus().length,
    totalMem: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    freeMem: Math.round(os.freemem() / 1024 / 1024),
  };
}

// === SCREENSHOT ===
function captureScreen() {
  log('Capturing screenshot...');
  const outFile = path.join(SCRIPT_DIR, 'temp_screen.jpg');
  const ps = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
$b=New-Object System.Drawing.Bitmap($s.Width,$s.Height);
$g=[System.Drawing.Graphics]::FromImage($b);
$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size);
$g.Dispose();
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'};
$p=New-Object System.Drawing.Imaging.EncoderParameters(1);
$p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,50);
$b.Save('${outFile.replace(/\\/g, '\\\\')}', $enc, $p);
$b.Dispose();
`;
  try {
    execSync(`powershell -ExecutionPolicy Bypass -Command "${ps.replace(/\r?\n/g, ' ')}"`, { timeout: 15000 });
    if (fs.existsSync(outFile)) {
      const base64 = fs.readFileSync(outFile).toString('base64');
      fs.unlinkSync(outFile);
      log(`Screenshot OK: ${Math.round(base64.length / 1024)}KB`);
      return base64;
    }
  } catch (e) { log(`Screenshot failed: ${e.message}`); }
  return null;
}



// === LOCAL HTTP SERVER ===
function startLocalServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${LOCAL_PORT}`);

    // Serve client.html
    if (url.pathname === '/' || url.pathname === '/client.html') {
      if (fs.existsSync(HTML_FILE)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(HTML_FILE, 'utf-8'));
      } else {
        res.writeHead(404); res.end('client.html not found');
      }
      return;
    }

    // API: device info
    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSystemInfo()));
      return;
    }

    // API: screenshot
    if (url.pathname === '/api/screenshot') {
      const img = captureScreen();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: !!img, image: img }));
      return;
    }

    // API: config
    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(CONFIG));
      return;
    }

    res.writeHead(404); res.end('Not found');
  });

  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    log(`Local server on http://127.0.0.1:${LOCAL_PORT}`);
  });

  server.on('error', (e) => {
    log(`Server error: ${e.message}. Retrying in 5s...`);
    setTimeout(() => startLocalServer(), 5000);
  });
}

// === OPEN HIDDEN BROWSER ===
function openHiddenBrowser() {
  log('Opening hidden browser for PeerJS & WebRTC...');
  const vbsFile = path.join(SCRIPT_DIR, 'temp_browser.vbs');
  const edgeArgs = `--app=http://127.0.0.1:${LOCAL_PORT}/client.html --window-position=-32000,-32000 --window-size=10,10 --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`;
  const vbs = `Set ws = CreateObject("WScript.Shell")\nws.Run "msedge.exe ${edgeArgs}", 0, False`;

  try {
    fs.writeFileSync(vbsFile, vbs);
    exec(`wscript "${vbsFile}"`, (err) => {
      if (err) {
        exec(`start /min "" "http://127.0.0.1:${LOCAL_PORT}/client.html"`, { shell: true });
      }
      setTimeout(() => { try { fs.unlinkSync(vbsFile); } catch {} }, 5000);
    });
    log('Hidden browser launched successfully');
  } catch (e) {
    log(`Browser launch failed: ${e.message}`);
    exec(`start /min "" "http://127.0.0.1:${LOCAL_PORT}/client.html"`, { shell: true });
  }
}

// === HTTP HEARTBEAT — Auto-register with IPC server ===
function sendHeartbeat() {
  if (!CONFIG.serverUrl) return;
  const info = getSystemInfo();
  const data = JSON.stringify(info);
  try {
    const url = new URL('/api/antitheft/heartbeat', CONFIG.serverUrl);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000,
    };
    const req = (isHttps ? require('https') : http).request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => log(`Heartbeat OK (Status ${res.statusCode}) → ${CONFIG.serverUrl}`));
    });
    req.on('error', (err) => {
      log(`Heartbeat error to ${CONFIG.serverUrl}: ${err.message}`);
    });
    req.on('timeout', () => {
      log(`Heartbeat timeout to ${CONFIG.serverUrl}`);
      req.destroy();
    });
    req.write(data);
    req.end();
  } catch (err) {
    log(`Heartbeat URL error: ${err.message}`);
  }
}

// === MAIN ===
function main() {
  log('========================================');
  log('ANTI-THEFT CLIENT STARTING');
  log('========================================');
  loadConfig();
  startLocalServer();

  // Wait for server to start, then open browser
  setTimeout(() => openHiddenBrowser(), 2000);

  // Send heartbeat to register with IPC server
  if (CONFIG.serverUrl) {
    setTimeout(() => sendHeartbeat(), 3000);
    setInterval(() => sendHeartbeat(), 15000);
    log(`Heartbeat enabled → ${CONFIG.serverUrl} (every 15s)`);
  } else {
    log('No serverUrl specified. PeerJS Cloud mode only.');
  }

  log('Client running. Ctrl+C to stop.');
}

main();
