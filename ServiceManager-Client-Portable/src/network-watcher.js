/**
 * Network Watcher
 * Phát hiện khi:
 *   - Máy kết nối vào mạng mới (IP thay đổi)
 *   - Máy mất kết nối
 *   - Máy nguyên giấc (resume from sleep)
 *
 * Khi phát hiện → emit 'network-changed' → tunnel-manager restart tunnel
 *
 * Không dùng native module, chỉ dùng os.networkInterfaces() polling.
 */

const os           = require('os');
const EventEmitter = require('events');

const POLL_INTERVAL_MS   = 10_000;  // kiểm tra mỗi 10 giây
const SUSPEND_THRESHOLD  = 30_000;  // >30 giây giữa 2 tick => wakeup

class NetworkWatcher extends EventEmitter {
  constructor() {
    super();
    this._lastIp       = null;
    this._lastTick     = Date.now();
    this._timer        = null;
    this._online       = true;
  }

  start() {
    this._lastIp   = this._getCurrentIp();
    this._lastTick = Date.now();
    this._timer    = setInterval(() => this._check(), POLL_INTERVAL_MS);
    console.log('[net-watcher] Started. Current IP:', this._lastIp || 'none');
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _getCurrentIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const ifc of nets[name]) {
        if (ifc.family === 'IPv4' && !ifc.internal) return ifc.address;
      }
    }
    return null;
  }

  _check() {
    const now     = Date.now();
    const elapsed = now - this._lastTick;
    this._lastTick = now;

    // Phát hiện wakeup từ nguyên giấc
    if (elapsed > SUSPEND_THRESHOLD + POLL_INTERVAL_MS) {
      console.log('[net-watcher] ⚡ System wakeup detected. Restarting tunnels...');
      this.emit('network-changed', { reason: 'wakeup', ip: this._getCurrentIp() });
      this._lastIp = this._getCurrentIp();
      return;
    }

    const currentIp = this._getCurrentIp();

    if (!currentIp && this._online) {
      // Mất mạng
      this._online = false;
      console.log('[net-watcher] ❌ Network lost.');
      this.emit('network-lost');
    } else if (currentIp && (!this._online || currentIp !== this._lastIp)) {
      // Có mạng mới hoặc IP thay đổi
      const reason = !this._online ? 'reconnected' : 'ip-changed';
      this._online  = true;
      this._lastIp  = currentIp;
      console.log(`[net-watcher] ✅ Network ${reason}: ${currentIp}`);
      // Đợi 3 giây cho DHCP ổn định rồi mới restart tunnel
      setTimeout(() => this.emit('network-changed', { reason, ip: currentIp }), 3000);
    }
  }
}

module.exports = new NetworkWatcher();
