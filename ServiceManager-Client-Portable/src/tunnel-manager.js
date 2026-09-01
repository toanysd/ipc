/**
 * Tunnel Manager — Orchestrator
 *
 * Chiến lược:
 *   1. Thử Cloudflare Tunnel (không cần tài khoản, không cần admin)
 *   2. Nếu thất bại → thử Tailscale (cần admin lần đầu để cài)
 *   3. Cả hai đều chạy song song nếu được
 *   4. Sync URL/IP vào Supabase (sm_devices.tunnel_url, tailscale_ip)
 *   5. Retry tự động mỗi 5 phút nếu chưa có kết nối
 *
 * Khi có kết nối:
 *   - go2rtc accessible qua Cloudflare: https://xxx.trycloudflare.com
 *   - Camera RTSP accessible qua Tailscale: rtsp://100.x.x.x:10554/...
 */

const cfTunnel    = require('./cloudflare-tunnel');
const tailscale   = require('./tailscale-manager');

const RETRY_INTERVAL_MS = 5 * 60 * 1000;  // 5 phút

let supabaseRequest = null;
let deviceId        = null;
let config          = {};   // { tailscale_authkey? }

let cfUrl        = null;
let tsIp         = null;
let retryTimer   = null;
let initialized  = false;

// ─── Sync lên Supabase ──────────────────────────────────────────────────────
async function syncToSupabase() {
  if (!supabaseRequest || !deviceId) return;
  const payload = {};
  if (cfUrl)  payload.tunnel_url    = cfUrl;
  if (tsIp)   payload.tailscale_ip  = tsIp;
  if (!cfUrl && !tsIp) return;

  try {
    await supabaseRequest(`/rest/v1/sm_devices?device_id=eq.${deviceId}`, {
      method: 'PATCH',
      body  : JSON.stringify(payload)
    });
    console.log('[tunnel-mgr] Synced to Supabase:', payload);
  } catch(e) {
    console.warn('[tunnel-mgr] Supabase sync failed:', e.message);
  }
}

// ─── Cloudflare ─────────────────────────────────────────────────────────────
async function startCloudflare() {
  if (cfTunnel.isRunning()) return cfTunnel.getUrl();
  console.log('[tunnel-mgr] Starting Cloudflare Tunnel...');
  try {
    const url = await cfTunnel.start(
      'http://127.0.0.1:1984',
      async (url) => {
        cfUrl = url;
        console.log('[tunnel-mgr] CF URL updated:', url);
        await syncToSupabase();
      },
      () => {
        cfUrl = null;
        console.log('[tunnel-mgr] CF tunnel stopped.');
      }
    );
    if (url) cfUrl = url;
    return url;
  } catch(e) {
    console.error('[tunnel-mgr] CF start error:', e.message);
    return null;
  }
}

// ─── Tailscale ───────────────────────────────────────────────────────────────
async function startTailscale() {
  if (tailscale.isActive()) return tailscale.getIp();
  console.log('[tunnel-mgr] Starting Tailscale...');
  try {
    const ip = await tailscale.start({
      authKey: config.tailscale_authkey || null,
      onIp: async (ip) => {
        tsIp = ip;
        console.log('[tunnel-mgr] Tailscale IP updated:', ip);
        await syncToSupabase();
      }
    });
    if (ip) tsIp = ip;
    return ip;
  } catch(e) {
    console.error('[tunnel-mgr] Tailscale start error:', e.message);
    return null;
  }
}

// ─── Main init ───────────────────────────────────────────────────────────────
/**
 * Khởi động tất cả tunnel.
 * @param {object} deps
 * @param {function} deps.supabaseReq  - async (endpoint, opts) => result
 * @param {string}   deps.devId        - device ID
 * @param {object}   [deps.config]     - { tailscale_authkey? }
 */
async function init(deps) {
  supabaseRequest = deps.supabaseReq  || null;
  deviceId        = deps.devId        || null;
  config          = deps.config       || {};

  console.log('[tunnel-mgr] ═══════════════════════════════════');
  console.log('[tunnel-mgr] Initializing tunnel manager...');
  console.log('[tunnel-mgr] Target: Japan ISP / DS-Lite / CGNAT safe');
  console.log('[tunnel-mgr] ═══════════════════════════════════');

  initialized = true;

  // Chạy song song, không chờ nhau
  const [cfResult, tsResult] = await Promise.allSettled([
    startCloudflare(),
    startTailscale()
  ]);

  cfUrl = cfResult.status === 'fulfilled' ? cfResult.value : null;
  tsIp  = tsResult.status === 'fulfilled' ? tsResult.value : null;

  await syncToSupabase();

  console.log('[tunnel-mgr] ───────────────────────────────────');
  console.log('[tunnel-mgr] Cloudflare URL :', cfUrl  || 'FAILED');
  console.log('[tunnel-mgr] Tailscale IP   :', tsIp   || 'FAILED');
  console.log('[tunnel-mgr] ───────────────────────────────────');

  // Setup retry cho cái nào thất bại
  scheduleRetry();

  return { cfUrl, tsIp };
}

function scheduleRetry() {
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = setInterval(async () => {
    let updated = false;
    if (!cfUrl) {
      const url = await startCloudflare();
      if (url) { cfUrl = url; updated = true; }
    }
    if (!tsIp) {
      const ip = await startTailscale();
      if (ip) { tsIp = ip; updated = true; }
    }
    if (updated) await syncToSupabase();
  }, RETRY_INTERVAL_MS);
}

function stop() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  cfTunnel.stop();
  tailscale.stop();
  cfUrl = null; tsIp = null;
  console.log('[tunnel-mgr] Stopped.');
}

function getStatus() {
  return {
    cloudflare: { running: cfTunnel.isRunning(), url: cfUrl },
    tailscale : { running: tailscale.isActive(), ip: tsIp },
    ready     : !!(cfUrl || tsIp)
  };
}

process.on('exit',    stop);
process.on('SIGINT',  stop);
process.on('SIGTERM', stop);

module.exports = { init, stop, getStatus };
