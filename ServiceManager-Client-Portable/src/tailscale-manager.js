/**
 * Tailscale Manager
 * - Kiểm tra Tailscale đã cài chưa
 * - Tự tải & cài silent nếu chưa có (Windows)
 * - up --accept-routes --authkey=<key> hoặc interactive login
 * - Lấy IP Tailscale (100.x.x.x)
 * - Lưu IP vào Supabase
 *
 * Auth key lấy từ: https://login.tailscale.com/admin/settings/keys
 * Để zero-config, lưu authkey vào config.json { tailscale_authkey: "tskey-auth-..." }
 * Nếu không có key, mở trình duyệt để đăng nhập.
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const os      = require('os');
const { execSync, exec, spawn } = require('child_process');

const TS_INSTALLER_URL = 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.exe';
const TS_INSTALLER_PATH = path.join(os.tmpdir(), 'tailscale-setup.exe');

let tailscaleIp = null;
let running = false;

// ─── Kiểm tra Tailscale đã cài ─────────────────────────────────────────────
function isTailscaleInstalled() {
  const paths = [
    'C:\\Program Files\\Tailscale\\tailscale.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
  ];
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch(e) {}
  }
  try {
    const out = execSync('where tailscale', { encoding: 'utf8', windowsHide: true });
    const p = out.trim().split('\n')[0];
    if (p && fs.existsSync(p)) return p;
  } catch(e) {}
  return null;
}

// ─── Tải installer ──────────────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[tailscale] Downloading installer: ${url}`);
    const file = fs.createWriteStream(dest);
    const get = (u) => https.get(u, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    });
    get(url);
  });
}

// ─── Cài Tailscale silent ───────────────────────────────────────────────────
async function installTailscale() {
  try {
    if (!fs.existsSync(TS_INSTALLER_PATH)) {
      await downloadFile(TS_INSTALLER_URL, TS_INSTALLER_PATH);
    }
    console.log('[tailscale] Installing silently (requires admin)...');
    execSync(`"${TS_INSTALLER_PATH}" /S`, { windowsHide: true, timeout: 120000 });
    console.log('[tailscale] Installed.');
    return true;
  } catch(e) {
    console.error('[tailscale] Install failed:', e.message);
    return false;
  }
}

// ─── Lấy Tailscale CLI path ─────────────────────────────────────────────────
function getTailscaleCLI() {
  return isTailscaleInstalled() || 'tailscale';
}

// ─── Lấy IP Tailscale hiện tại ─────────────────────────────────────────────
function getTailscaleIp() {
  try {
    const cli = getTailscaleCLI();
    const out = execSync(`"${cli}" ip -4`, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const ip  = out.trim().split('\n')[0];
    if (ip && ip.startsWith('100.')) return ip;
  } catch(e) {}
  return null;
}

// ─── Kiểm tra đã đăng nhập chưa ─────────────────────────────────────────────
function isLoggedIn() {
  try {
    const cli = getTailscaleCLI();
    const out = execSync(`"${cli}" status --json`, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const obj = JSON.parse(out);
    return obj.BackendState === 'Running' || obj.BackendState === 'Starting';
  } catch(e) { return false; }
}

// ─── Login bằng authkey hoặc mở browser ────────────────────────────────────
function loginWithKey(authKey) {
  return new Promise((resolve) => {
    const cli = getTailscaleCLI();
    const args = ['up', '--authkey', authKey, '--accept-routes', '--reset'];
    console.log('[tailscale] Logging in with authkey...');
    exec(`"${cli}" ${args.join(' ')}`, { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) { console.error('[tailscale] Login error:', err.message); resolve(false); }
      else { console.log('[tailscale] Login OK'); resolve(true); }
    });
  });
}

function loginInteractive() {
  return new Promise((resolve) => {
    const cli = getTailscaleCLI();
    console.log('[tailscale] Opening browser for interactive login...');
    // tailscale up sẽ in ra URL để mở trong browser
    const child = spawn(cli, ['up', '--accept-routes'], { windowsHide: false });
    child.stdout.on('data', d => console.log('[tailscale]', d.toString()));
    child.stderr.on('data', d => {
      const text = d.toString();
      console.log('[tailscale]', text);
      // Mở URL nếu có
      const m = text.match(/https:\/\/login\.tailscale\.com\/\S+/);
      if (m) {
        exec(`start "" "${m[0]}"`, { windowsHide: true });
      }
    });
    child.on('exit', (code) => resolve(code === 0));
    setTimeout(() => { try { child.kill(); } catch(e) {} resolve(false); }, 120000);
  });
}

/**
 * Khởi động Tailscale:
 * 1. Kiểm tra đã cài chưa — tự cài nếu cần
 * 2. Login bằng authkey (nếu có) hoặc interactive
 * 3. Lấy IP 100.x.x.x
 *
 * @param {object} opts
 * @param {string} [opts.authKey]   - tskey-auth-... từ config
 * @param {function} [opts.onIp]   - callback khi có IP
 * @returns {Promise<string|null>}  IP Tailscale hoặc null
 */
async function start(opts = {}) {
  if (running) return tailscaleIp;
  running = true;

  console.log('[tailscale] Starting...');

  // 1. Đảm bảo đã cài
  let cliPath = isTailscaleInstalled();
  if (!cliPath) {
    console.log('[tailscale] Not installed. Installing...');
    const ok = await installTailscale();
    if (!ok) { running = false; return null; }
    // Đợi service khởi động
    await sleep(5000);
    cliPath = isTailscaleInstalled();
    if (!cliPath) { console.error('[tailscale] Still not found after install.'); running = false; return null; }
  }

  // 2. Login
  if (!isLoggedIn()) {
    if (opts.authKey) {
      const ok = await loginWithKey(opts.authKey);
      if (!ok) {
        console.warn('[tailscale] authKey login failed, trying interactive...');
        await loginInteractive();
      }
    } else {
      await loginInteractive();
    }
    await sleep(3000);
  } else {
    console.log('[tailscale] Already logged in.');
  }

  // 3. Lấy IP (retry 5 lần)
  for (let i = 0; i < 5; i++) {
    tailscaleIp = getTailscaleIp();
    if (tailscaleIp) break;
    await sleep(3000);
  }

  if (tailscaleIp) {
    console.log('[tailscale] ✅ IP:', tailscaleIp);
    if (opts.onIp) opts.onIp(tailscaleIp);
  } else {
    console.warn('[tailscale] Could not get IP.');
  }

  return tailscaleIp;
}

function stop() {
  running = false;
  console.log('[tailscale] Stopped (service still running in background).');
}

function getIp()      { return tailscaleIp || getTailscaleIp(); }
function isActive()   { return running && !!tailscaleIp; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { start, stop, getIp, isActive, isTailscaleInstalled, getTailscaleIp };
