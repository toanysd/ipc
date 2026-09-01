/**
 * Service Manager - UPnP Manager Module
 * Manages automatic UPnP port forwarding for Electron main process.
 * Communicates with the local router to open ports and handle camera forwarding.
 *
 * TTL = 86400s (24h) — giảm số lần renew, giữ rule lâu hơn khi máy tắt tạm.
 * Renewal interval = 6h (21600000ms) — gia hạn trước khi hết hạn.
 */

let natUpnp = null;
try {
  natUpnp = require('nat-upnp-2');
} catch (err) {
  console.log(`[sm-upnp] nat-upnp-2 is not installed or failed to load: ${err.message}`);
}

// Module State
let client = null;
let cachedExternalIp = null;
let upnpAvailable = false;
let renewalTimer = null;

const TTL = 86400;               // 24 giờ (giây)
const RENEWAL_INTERVAL_MS = 6 * 60 * 60 * 1000;  // Renew mỗi 6h

// Default port mappings for Service Manager
const DEFAULT_PORT_MAPPINGS = [
  {
    publicPort: 1984,
    privatePort: 1984,
    targetIp: null,
    description: 'Service Manager API',
    ttl: TTL,
    protocol: 'TCP',
    isCamera: false
  },
  {
    publicPort: 8555,
    privatePort: 8555,
    targetIp: null,
    description: 'Service Manager WebRTC',
    ttl: TTL,
    protocol: 'TCP',
    isCamera: false
  }
];

// Active mappings store (key: publicPort, value: mapping object)
const activeMappings = new Map();

// Initialize active mappings with defaults
for (const mapping of DEFAULT_PORT_MAPPINGS) {
  activeMappings.set(mapping.publicPort, { ...mapping });
}

function isCGNAT(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function mapPort(mapping) {
  return new Promise((resolve, reject) => {
    if (!client) return reject(new Error('UPnP client is not initialized'));
    const options = {
      public: mapping.publicPort,
      private: mapping.targetIp
        ? { host: mapping.targetIp, port: mapping.privatePort }
        : mapping.privatePort,
      ttl: mapping.ttl || TTL,
      description: mapping.description || 'Service Manager',
      protocol: mapping.protocol || 'TCP'
    };
    client.portMapping(options, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function unmapPort(publicPort, protocol = 'TCP') {
  return new Promise((resolve, reject) => {
    if (!client) return resolve();
    client.portUnmapping({ public: publicPort, protocol }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

const https = require('https');

function fetchPublicIpFromWeb() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ip) return resolve(json.ip.trim());
        } catch(e) {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

function fetchExternalIp() {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const fallbackTimer = setTimeout(() => {
      fetchPublicIpFromWeb().then(ip => {
        if (!resolved && ip) { resolved = true; resolve(ip); }
      }).catch(() => {});
    }, 1500);

    if (client) {
      client.externalIp((err, ip) => {
        if (!resolved) {
          if (!err && ip && !isCGNAT(ip)) {
            clearTimeout(fallbackTimer);
            resolved = true;
            return resolve(ip);
          }
          fetchPublicIpFromWeb().then(webIp => {
            if (!resolved) { resolved = true; resolve(webIp || ip); }
          }).catch(() => {
            if (!resolved) { resolved = true; ip ? resolve(ip) : reject(err || new Error('Failed to resolve IP')); }
          });
        }
      });
    } else {
      fetchPublicIpFromWeb().then(ip => {
        if (!resolved) { resolved = true; resolve(ip); }
      }).catch(err => {
        if (!resolved) { resolved = true; reject(err); }
      });
    }
  });
}

async function applyAllMappings() {
  for (const [port, mapping] of activeMappings.entries()) {
    try {
      await mapPort(mapping);
      const target = mapping.targetIp ? `${mapping.targetIp}:${mapping.privatePort}` : `${mapping.privatePort}`;
      console.log(`[sm-upnp] Mapped port ${mapping.publicPort} -> ${target} TTL=${mapping.ttl || TTL}s (${mapping.description})`);
    } catch (err) {
      console.log(`[sm-upnp] Warning: Failed to map port ${mapping.publicPort}: ${err.message}`);
    }
  }
}

/**
 * Starts UPnP port forwarding service.
 * TTL = 86400s (24h). Renews every 6h.
 */
async function start() {
  try {
    if (!natUpnp) {
      console.log('[sm-upnp] nat-upnp-2 is not available. Port forwarding disabled.');
      upnpAvailable = false;
      return false;
    }

    if (!client) {
      try {
        client = natUpnp.createClient({ timeout: 10000 });
      } catch (err) {
        console.log(`[sm-upnp] Failed to create UPnP client: ${err.message}`);
        upnpAvailable = false;
        return false;
      }
    }

    console.log('[sm-upnp] Starting UPnP port forwarding service (TTL=86400s)...');

    try {
      const ip = await fetchExternalIp();
      cachedExternalIp = ip;
      upnpAvailable = true;
      console.log(`[sm-upnp] Router external IP: ${ip}`);
      if (isCGNAT(ip)) {
        console.log('[sm-upnp] CGNAT detected - direct port forwarding will not work from outside');
      }
    } catch (err) {
      upnpAvailable = false;
      console.log(`[sm-upnp] Warning: UPnP gateway discovery failed: ${err.message}`);
    }

    await applyAllMappings();

    if (renewalTimer) { clearInterval(renewalTimer); renewalTimer = null; }

    renewalTimer = setInterval(async () => {
      console.log('[sm-upnp] Renewing port mappings (6h interval)...');
      try {
        try {
          const ip = await fetchExternalIp();
          cachedExternalIp = ip;
          upnpAvailable = true;
        } catch (ipErr) {
          console.log(`[sm-upnp] Warning: Failed to refresh external IP: ${ipErr.message}`);
        }
        await applyAllMappings();
      } catch (err) {
        console.log(`[sm-upnp] Warning: Error during renewal: ${err.message}`);
      }
    }, RENEWAL_INTERVAL_MS);

    return upnpAvailable;
  } catch (err) {
    console.log(`[sm-upnp] Unexpected error in start(): ${err.message}`);
    return false;
  }
}

async function stop() {
  try {
    console.log('[sm-upnp] Stopping UPnP manager and removing port mappings...');
    if (renewalTimer) { clearInterval(renewalTimer); renewalTimer = null; }
    if (client) {
      for (const [port, mapping] of activeMappings.entries()) {
        try {
          await unmapPort(mapping.publicPort, mapping.protocol || 'TCP');
          console.log(`[sm-upnp] Removed port mapping for port ${mapping.publicPort}`);
        } catch (err) {
          console.log(`[sm-upnp] Warning: Failed to unmap port ${mapping.publicPort}: ${err.message}`);
        }
      }
      try { if (typeof client.close === 'function') client.close(); } catch(e) {}
      client = null;
    }
    upnpAvailable = false;
    console.log('[sm-upnp] UPnP manager stopped');
    return true;
  } catch (err) {
    console.log(`[sm-upnp] Unexpected error in stop(): ${err.message}`);
    return false;
  }
}

function getExternalIp() { return cachedExternalIp; }
function getMappings() { return Array.from(activeMappings.values()).map(m => ({ ...m })); }
function isAvailable() { return upnpAvailable; }

/**
 * Creates a direct port forward: external port -> camera internal IP:port
 * TTL = 86400s so rule persists ~24h even if laptop is temporarily off.
 */
async function forwardCameraPort(cameraIp, cameraPort, externalPort, description) {
  try {
    const extPort = Number(externalPort);
    const intPort = Number(cameraPort);
    const desc = description || `Camera ${cameraIp}:${intPort}`;

    if (!cameraIp || isNaN(extPort) || isNaN(intPort)) {
      console.log(`[sm-upnp] Invalid parameters for forwardCameraPort`);
      return false;
    }

    const mapping = {
      publicPort: extPort,
      privatePort: intPort,
      targetIp: cameraIp,
      description: desc,
      ttl: TTL,
      protocol: 'TCP',
      isCamera: true
    };

    activeMappings.set(extPort, mapping);

    if (!natUpnp) {
      console.log(`[sm-upnp] nat-upnp-2 not available; recorded camera mapping for port ${extPort}`);
      return false;
    }

    if (!client) {
      try { client = natUpnp.createClient({ timeout: 10000 }); }
      catch (err) { console.log(`[sm-upnp] Failed to init UPnP client: ${err.message}`); return false; }
    }

    await mapPort(mapping);
    console.log(`[sm-upnp] Camera port forward: External ${extPort} -> ${cameraIp}:${intPort} TTL=86400s`);
    return true;
  } catch (err) {
    console.log(`[sm-upnp] Warning: Failed to forward camera port: ${err.message}`);
    return false;
  }
}

async function removeCameraForward(externalPort) {
  try {
    const extPort = Number(externalPort);
    if (isNaN(extPort)) return false;
    const mapping = activeMappings.get(extPort);
    activeMappings.delete(extPort);
    if (client) {
      try {
        await unmapPort(extPort, (mapping && mapping.protocol) || 'TCP');
        console.log(`[sm-upnp] Camera port forward removed: ${extPort}`);
      } catch (err) {
        console.log(`[sm-upnp] Warning: Failed to unmap camera port ${extPort}: ${err.message}`);
      }
    }
    return true;
  } catch (err) {
    console.log(`[sm-upnp] Warning: Error in removeCameraForward: ${err.message}`);
    return false;
  }
}

process.on('SIGINT',  () => { stop().catch(() => {}); });
process.on('SIGTERM', () => { stop().catch(() => {}); });

async function openCustomPort(publicPort, privatePort, targetIp, protocol = 'TCP', description = '') {
  return await forwardCameraPort(targetIp, privatePort, publicPort, description || `Forward ${publicPort}->${targetIp}:${privatePort}`);
}

async function closePort(publicPort, protocol = 'TCP') {
  return await removeCameraForward(publicPort);
}

module.exports = {
  start,
  stop,
  getExternalIp,
  getMappings,
  isAvailable,
  forwardCameraPort,
  removeCameraForward,
  openCustomPort,
  closePort,
  TTL
};
