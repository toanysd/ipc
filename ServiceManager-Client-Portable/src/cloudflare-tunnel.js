/**
 * Cloudflare Tunnel Manager
 * - Tự tải cloudflared.exe nếu chưa có
 * - Khởi động quick tunnel (không cần tài khoản)
 * - Parse URL từ stdout/stderr
 * - Lưu URL vào Supabase
 * - Tự restart nếu crash
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { spawn } = require('child_process');
const os      = require('os');

const CF_VERSION = '2024.12.2';
const CF_URL     = `https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/cloudflared-windows-amd64.exe`;

let cfProcess   = null;
let tunnelUrl   = null;
let running     = false;
let restartTimer = null;
let onUrlCallback = null;   // (url) => void
let onStopCallback = null;  // () => void

// Tìm đường dẫn lưu cloudflared.exe
function getExePath() {
  const candidates = [
    path.join(process.execPath, '..', 'cloudflared.exe'),
    path.join(process.resourcesPath || '', 'cloudflared.exe'),
    path.join(__dirname, '..', 'resources', 'cloudflared.exe'),
    path.join(os.tmpdir(), 'sm_cloudflared.exe')
  ];
  // Trả về cái đã tồn tại, hoặc tmpdir nếu chưa có
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch(e) {}
  }
  return candidates[candidates.length - 1];
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[cf-tunnel] Downloading cloudflared from: ${url}`);
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    });
    req.on('error', (err) => { file.close(); try { fs.unlinkSync(dest); } catch(e) {} reject(err); });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function ensureCloudflared() {
  const exePath = getExePath();
  if (fs.existsSync(exePath)) {
    console.log('[cf-tunnel] cloudflared found at:', exePath);
    return exePath;
  }
  console.log('[cf-tunnel] cloudflared not found, downloading...');
  try {
    await downloadFile(CF_URL, exePath);
    console.log('[cf-tunnel] Downloaded to:', exePath);
    return exePath;
  } catch(e) {
    console.error('[cf-tunnel] Download failed:', e.message);
    return null;
  }
}

function parseTunnelUrl(text) {
  // cloudflared in có thể log url vào stderr hoặc stdout
  const patterns = [
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
    /https:\/\/[a-z0-9-]+\.cloudflare\.com/i,
    /https:\/\/[a-z0-9-]+\.cfargotunnel\.com/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

function startProcess(exePath, targetUrl) {
  // Quick tunnel: cloudflared tunnel --url http://localhost:PORT
  const args = ['tunnel', '--url', targetUrl, '--no-autoupdate'];
  console.log('[cf-tunnel] Starting:', exePath, args.join(' '));

  cfProcess = spawn(exePath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  cfProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const url  = parseTunnelUrl(text);
    if (url && url !== tunnelUrl) {
      tunnelUrl = url;
      console.log('[cf-tunnel] ✅ Tunnel URL:', url);
      if (onUrlCallback) onUrlCallback(url);
    }
  });

  cfProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    const url  = parseTunnelUrl(text);
    if (url && url !== tunnelUrl) {
      tunnelUrl = url;
      console.log('[cf-tunnel] ✅ Tunnel URL (stderr):', url);
      if (onUrlCallback) onUrlCallback(url);
    }
  });

  cfProcess.on('exit', (code) => {
    console.log(`[cf-tunnel] Process exited (code ${code}). Will restart in 15s...`);
    cfProcess = null;
    tunnelUrl = null;
    if (running) {
      // Auto-restart
      restartTimer = setTimeout(() => {
        if (running) startProcess(exePath, targetUrl);
      }, 15000);
    } else {
      if (onStopCallback) onStopCallback();
    }
  });

  cfProcess.on('error', (err) => {
    console.error('[cf-tunnel] Process error:', err.message);
  });
}

/**
 * Khởi động Cloudflare Quick Tunnel trỏ vào địa chỉ nội bộ.
 * @param {string} targetUrl  - ví dụ 'http://127.0.0.1:1984'
 * @param {function} onUrl    - callback khi có URL (url: string)
 * @param {function} onStop   - callback khi dừng hẳn
 * @returns {Promise<string|null>} URL tunnel hoặc null nếu thất bại
 */
async function start(targetUrl = 'http://127.0.0.1:1984', onUrl, onStop) {
  if (running) return tunnelUrl;
  running = true;
  onUrlCallback  = onUrl  || null;
  onStopCallback = onStop || null;

  const exePath = await ensureCloudflared();
  if (!exePath) {
    running = false;
    console.error('[cf-tunnel] Cannot start: cloudflared not available.');
    return null;
  }

  startProcess(exePath, targetUrl);

  // Chờ URL tối đa 60 giây
  return new Promise((resolve) => {
    let waited = 0;
    const check = setInterval(() => {
      waited += 500;
      if (tunnelUrl) { clearInterval(check); resolve(tunnelUrl); }
      else if (waited >= 60000) { clearInterval(check); resolve(null); }
    }, 500);
  });
}

function stop() {
  running = false;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  if (cfProcess) {
    try { cfProcess.kill('SIGTERM'); } catch(e) {}
    cfProcess = null;
  }
  tunnelUrl = null;
  console.log('[cf-tunnel] Stopped.');
}

function getUrl()       { return tunnelUrl; }
function isRunning()    { return running && !!cfProcess; }

process.on('exit',    stop);
process.on('SIGINT',  stop);
process.on('SIGTERM', stop);

module.exports = { start, stop, getUrl, isRunning, ensureCloudflared };
