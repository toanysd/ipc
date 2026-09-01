/**
 * Startup Migration
 * Chạy tự động 1 lần duy nhất khi client khởi động.
 * Thêm các cột cần thiết vào sm_devices qua Supabase REST API.
 * Không cần quyền service_role — dùng anon key + RLS (owner có thể alter own rows).
 * Nếu cần ALTER TABLE thật sự, dùng Supabase Management API với service_role key.
 *
 * Chiến lược an toàn: thử PATCH với các cột mới — nếu Supabase báo lỗi 'column not found'
 * thì log cảnh báo nhưng không crash app.
 * SQL thật sự phải chạy bởi admin trong Supabase Dashboard (file setup-supabase-columns.sql).
 *
 * Để tự động hon:
 * Nếu có service_role key trong config.json (tailscale_authkey được lưu đó),
 * sử dụng Supabase Management API để chạy SQL migration thật.
 */

const MIGRATION_VERSION = '2';  // tăng khi thêm migration mới
const STORAGE_KEY = 'sm_migration_version';

/**
 * Kiểm tra & chạy migration tự động.
 * @param {function} supabaseRequest  - async (endpoint, opts) => result  (anon key)
 * @param {string}   supabaseUrl      - https://xxx.supabase.co
 * @param {string}   supabaseKey      - anon key hoặc service_role key
 * @param {string}   deviceId
 */
async function runMigrations(supabaseRequest, supabaseUrl, supabaseKey, deviceId) {
  if (!supabaseUrl || !supabaseKey) return;

  const done = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch(e) { return null; } })();
  if (done === MIGRATION_VERSION) return;  // đã chạy rồi

  console.log('[migration] Running startup migrations v' + MIGRATION_VERSION + '...');

  // ── Chiến lược 1: thử PATCH với các cột mới
  // Nếu cột chưa tồn tại, Supabase sẽ trả lỗi "column not found" — ta bắt lỗi và cảnh báo.
  const testPatch = await supabaseRequest(`/rest/v1/sm_devices?device_id=eq.${deviceId}`, {
    method: 'PATCH',
    body  : JSON.stringify({ tunnel_url: null, tailscale_ip: null })
  });

  if (testPatch !== null) {
    // Cột tồn tại, migration OK
    console.log('[migration] ✅ Columns tunnel_url, tailscale_ip already exist.');
    try { localStorage.setItem(STORAGE_KEY, MIGRATION_VERSION); } catch(e) {}
    return;
  }

  // ── Chiến lược 2: thử Management API nếu có service_role key
  // Service role key có thể lưu trong config.json { supabase_service_key: "..." }
  let serviceKey = null;
  try {
    const cfgPath = require('path').join(
      require('os').homedir(), 'AppData', 'Roaming', 'ServiceManager-Client', 'config.json'
    );
    const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
    serviceKey = cfg.supabase_service_key || null;
  } catch(e) {}

  if (serviceKey) {
    // Trích project ref từ URL: https://[ref].supabase.co
    const refMatch = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
    const projectRef = refMatch ? refMatch[1] : null;

    if (projectRef) {
      const sql = `
        ALTER TABLE sm_devices ADD COLUMN IF NOT EXISTS tunnel_url   text;
        ALTER TABLE sm_devices ADD COLUMN IF NOT EXISTS tailscale_ip text;
      `.trim();

      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method : 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type' : 'application/json'
          },
          body: JSON.stringify({ query: sql })
        });
        if (res.ok) {
          console.log('[migration] ✅ Columns created via Management API.');
          try { localStorage.setItem(STORAGE_KEY, MIGRATION_VERSION); } catch(e) {}
          return;
        } else {
          const err = await res.text();
          console.warn('[migration] Management API error:', err);
        }
      } catch(e) {
        console.warn('[migration] Management API fetch error:', e.message);
      }
    }
  }

  // ── Fallback: hiển thị hướng dẫn trong console
  console.warn([
    '[migration] ⚠️ Cột chưa tồn tại trong Supabase.',
    'Chạy SQL này trong Supabase Dashboard → SQL Editor:',
    '',
    '  ALTER TABLE sm_devices ADD COLUMN IF NOT EXISTS tunnel_url   text;',
    '  ALTER TABLE sm_devices ADD COLUMN IF NOT EXISTS tailscale_ip text;',
    '',
    'Hoặc thêm vào config.json:',
    '  { "supabase_service_key": "eyJ..." }',
    'Dể migration tự chạy lần sau.'
  ].join('\n'));
}

module.exports = { runMigrations };
