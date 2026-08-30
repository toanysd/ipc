/**
 * Service Manager - Auto Network Discovery & Camera Setup Module
 * 
 * Runs automatically on client startup:
 * 1. Detect which WiFi network we're on
 * 2. Scan for cameras on the local subnet
 * 3. Auto-configure go2rtc with discovered cameras
 * 4. Try UPnP port forwarding (with aggressive retry)
 * 5. Store all results in Supabase for dashboard access
 * 6. Monitor network changes and re-run discovery
 */

const os = require('os');
const net = require('net');
const https = require('https');

// ─── State ──────────────────────────────────────────────────────────────────
let lastNetworkId = null;       // "ssid@gateway" fingerprint
let discoveredCameras = [];     // Array of { ip, type, label, openPorts, rtspPath }
let autoSetupComplete = false;
let networkWatchInterval = null;
let upnpRetryCount = 0;
const MAX_UPNP_RETRIES = 5;
const UPNP_RETRY_DELAY_MS = 10000;

// External references (injected via init())
let upnpManager = null;
let go2rtcManager = null;
let supabaseRequest = null;
let deviceId = null;

// ─── Network Fingerprint ───────────────────────────────────────────────────
function getNetworkFingerprint() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Use IP prefix + netmask as fingerprint
        const parts = iface.address.split('.');
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        return { id: `${subnet}@${iface.netmask}`, ip: iface.address, subnet, netmask: iface.netmask };
      }
    }
  }
  return null;
}

// ─── Port Scanner ───────────────────────────────────────────────────────────
function checkPort(ip, port, timeout = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    let isOpen = false;
    socket.on('connect', () => { isOpen = true; socket.destroy(); });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(isOpen));
    socket.connect(port, ip);
  });
}

// ─── Camera Scanner ─────────────────────────────────────────────────────────
async function scanForCameras(subnet, myIp) {
  console.log(`[auto-net] Scanning subnet ${subnet}.0/24 for cameras...`);
  
  const IPs = [];
  for (let i = 1; i < 255; i++) {
    const ip = `${subnet}.${i}`;
    if (ip === myIp) continue;
    IPs.push(ip);
  }
  
  // Camera-specific ports
  const cameraPorts = [554, 2020, 34567, 8899, 8000];
  const concurrency = 80;
  let idx = 0;
  const found = {};

  async function worker() {
    while (idx < IPs.length) {
      const ip = IPs[idx++];
      for (const port of cameraPorts) {
        const open = await checkPort(ip, port, 300);
        if (open) {
          if (!found[ip]) found[ip] = { ip, openPorts: [] };
          found[ip].openPorts.push(port);
        }
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);

  // Classify
  const cameras = [];
  for (const d of Object.values(found)) {
    let type = 'unknown';
    let label = 'Thiết bị mạng';
    let rtspPath = '/stream1';
    let rtspPort = 554;
    let isCamera = false;

    if (d.openPorts.includes(2020) || (d.openPorts.includes(554) && !d.openPorts.includes(34567))) {
      type = 'tapo';
      label = 'TP-Link Tapo Camera';
      rtspPath = '/stream1';
      isCamera = true;
    } else if (d.openPorts.includes(34567)) {
      type = 'icsee';
      label = 'ICSee / Xiongmai Camera';
      rtspPath = '/cam/realmonitor?channel=1&subtype=0';
      isCamera = true;
    } else if (d.openPorts.includes(8000) || d.openPorts.includes(554)) {
      type = 'generic';
      label = 'Camera IP (Generic RTSP)';
      rtspPath = '/stream1';
      isCamera = true;
    }

    if (isCamera) {
      cameras.push({
        ip: d.ip,
        type,
        label,
        openPorts: d.openPorts,
        rtspPort,
        rtspPath
      });
    }
  }

  console.log(`[auto-net] Found ${cameras.length} camera(s): ${cameras.map(c => `${c.ip} (${c.type})`).join(', ') || 'none'}`);
  return cameras;
}

// ─── Public IP Fetch ────────────────────────────────────────────────────────
function fetchPublicIp() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
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

// ─── go2rtc Auto-Configure ──────────────────────────────────────────────────
async function configureGo2rtc(cameras, savedCredentials) {
  if (!go2rtcManager) {
    console.log('[auto-net] go2rtc manager not available, skipping stream setup');
    return [];
  }

  // Wait for go2rtc to be ready
  let ready = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:1984/api/streams', { timeout: 2000 }, (res) => {
          res.resume();
          res.on('end', () => resolve(true));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      ready = true;
      break;
    } catch(e) {
      console.log(`[auto-net] Waiting for go2rtc to be ready... (attempt ${attempt + 1}/10)`);
      await sleep(2000);
    }
  }

  if (!ready) {
    console.log('[auto-net] go2rtc not reachable after 10 attempts, skipping stream setup');
    return [];
  }

  const configuredStreams = [];

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const streamName = cameras.length === 1 ? 'camera' : `camera_${i + 1}`;
    
    // Build RTSP URL using saved credentials if available
    const creds = savedCredentials || {};
    const user = creds.user || '';
    const pass = creds.pass || '';
    const auth = (user && pass) ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
    const rtspUrl = `rtsp://${auth}${cam.ip}:${cam.rtspPort}${cam.rtspPath}`;

    try {
      // Clear old config first
      try { await go2rtcManager.removeStream(streamName); } catch(e) {}
      
      await go2rtcManager.addStream(streamName, rtspUrl);
      console.log(`[auto-net] Configured go2rtc stream "${streamName}" -> ${cam.ip}:${cam.rtspPort}`);
      
      configuredStreams.push({
        streamName,
        cameraIp: cam.ip,
        cameraType: cam.type,
        rtspUrl: rtspUrl.replace(/:[^:@]*@/, ':***@'), // Mask password in logs
        rtspPort: cam.rtspPort
      });
    } catch(e) {
      console.log(`[auto-net] Failed to configure stream for ${cam.ip}: ${e.message}`);
    }
  }

  return configuredStreams;
}

// ─── UPnP Auto-Forward ──────────────────────────────────────────────────────
async function tryUPnPForward(cameras, externalIp) {
  if (!upnpManager) {
    console.log('[auto-net] UPnP manager not available');
    return { success: false, reason: 'UPnP module not loaded' };
  }

  // Wait for UPnP to be fully initialized (may take time for SSDP discovery)
  let upnpReady = upnpManager.isAvailable();
  if (!upnpReady) {
    console.log('[auto-net] UPnP not yet available, trying to start...');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await upnpManager.start();
      } catch(e) {
        console.log(`[auto-net] UPnP start attempt ${attempt + 1} failed: ${e.message}`);
      }
      upnpReady = upnpManager.isAvailable();
      if (upnpReady) break;
      console.log(`[auto-net] UPnP not ready yet, waiting 3s... (attempt ${attempt + 1}/3)`);
      await sleep(3000);
    }
  }

  if (!upnpManager.isAvailable()) {
    console.log('[auto-net] UPnP not available on this router after retries');
    return { success: false, reason: 'Router does not support UPnP or UPnP is disabled' };
  }

  console.log('[auto-net] ✅ UPnP is available! Proceeding with port forwarding...');

  const results = [];
  let baseExternalPort = 10554;

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const extPort = baseExternalPort + i;
    
    try {
      const ok = await upnpManager.forwardCameraPort(cam.ip, cam.rtspPort, extPort, `AutoCam ${cam.type} ${cam.ip}`);
      console.log(`[auto-net] UPnP forward: ${extPort} -> ${cam.ip}:${cam.rtspPort} = ${ok ? 'SUCCESS' : 'FAILED'}`);
      
      results.push({
        cameraIp: cam.ip,
        externalPort: extPort,
        internalPort: cam.rtspPort,
        success: ok,
        remoteUrl: ok && externalIp ? `rtsp://${externalIp}:${extPort}${cam.rtspPath}` : null
      });
    } catch(e) {
      console.log(`[auto-net] UPnP forward error for ${cam.ip}: ${e.message}`);
      results.push({
        cameraIp: cam.ip,
        externalPort: extPort,
        internalPort: cam.rtspPort,
        success: false,
        error: e.message
      });
    }
  }

  return { 
    success: results.some(r => r.success), 
    results,
    mappings: upnpManager.getMappings()
  };
}

// ─── UPnP Retry with Backoff ────────────────────────────────────────────────
async function retryUPnP(cameras, externalIp) {
  upnpRetryCount = 0;
  
  async function attempt() {
    if (upnpRetryCount >= MAX_UPNP_RETRIES) {
      console.log(`[auto-net] UPnP: Max retries (${MAX_UPNP_RETRIES}) reached. Port forwarding not available.`);
      console.log('[auto-net] Camera viewing will use P2P relay through laptop (requires laptop to be ON).');
      return null;
    }

    upnpRetryCount++;
    console.log(`[auto-net] UPnP attempt ${upnpRetryCount}/${MAX_UPNP_RETRIES}...`);
    
    const result = await tryUPnPForward(cameras, externalIp);
    
    if (result.success) {
      console.log('[auto-net] ✅ UPnP port forwarding succeeded!');
      return result;
    }

    // Retry with exponential backoff
    const delay = UPNP_RETRY_DELAY_MS * upnpRetryCount;
    console.log(`[auto-net] UPnP failed, retrying in ${delay / 1000}s...`);
    await sleep(delay);
    return attempt();
  }

  return attempt();
}

// ─── Supabase State Sync ────────────────────────────────────────────────────
async function syncToSupabase(networkInfo, cameras, streams, upnpResult, externalIp) {
  if (!supabaseRequest || !deviceId) return;

  // Store basic info that always works (columns that exist)
  const basicPayload = {
    external_ip: externalIp || null,
    last_seen: new Date().toISOString()
  };

  // Set camera_ip to the first discovered camera
  if (cameras.length > 0) {
    basicPayload.camera_ip = cameras[0].ip;
    basicPayload.camera_rtsp_port = cameras[0].rtspPort || 554;
  }

  try {
    await supabaseRequest(`/rest/v1/sm_devices?device_id=eq.${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(basicPayload)
    });
    console.log('[auto-net] Synced basic network info to Supabase');
  } catch(e) {
    console.log(`[auto-net] Failed to sync basic info: ${e.message}`);
  }

  // Try to store full auto_network data (column may not exist yet)
  const autoNetworkData = {
    network_id: networkInfo?.id || null,
    local_ip: networkInfo?.ip || null,
    subnet: networkInfo?.subnet || null,
    external_ip: externalIp || null,
    discovered_cameras: cameras.map(c => ({
      ip: c.ip, type: c.type, label: c.label,
      ports: c.openPorts, rtsp_port: c.rtspPort, rtsp_path: c.rtspPath
    })),
    configured_streams: streams,
    upnp_available: upnpResult?.success || false,
    upnp_forwards: upnpResult?.results || [],
    port_mappings: upnpResult?.mappings || [],
    auto_setup_at: new Date().toISOString()
  };

  try {
    await supabaseRequest(`/rest/v1/sm_devices?device_id=eq.${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ auto_network: autoNetworkData })
    });
    console.log('[auto-net] Synced full auto-network data to Supabase');
  } catch(e) {
    // Column may not exist — that's OK, the system still works via P2P
    console.log(`[auto-net] Note: auto_network column not available in Supabase (optional). Run migration SQL to enable.`);
  }
}

// ─── Main Auto-Setup Flow ───────────────────────────────────────────────────
async function runAutoSetup(savedCredentials) {
  console.log('[auto-net] ═══════════════════════════════════════════════');
  console.log('[auto-net] Starting automatic network discovery & setup...');
  console.log('[auto-net] ═══════════════════════════════════════════════');

  // Step 1: Detect network
  const network = getNetworkFingerprint();
  if (!network) {
    console.log('[auto-net] No active network connection detected. Will retry when connected.');
    return { success: false, reason: 'No network' };
  }
  console.log(`[auto-net] 🌐 Network: ${network.ip} (subnet: ${network.subnet}.0/24)`);

  // Step 2: Get public IP
  const externalIp = await fetchPublicIp();
  console.log(`[auto-net] 🌍 Public IP: ${externalIp || 'unavailable'}`);

  // Step 3: Scan for cameras
  const cameras = await scanForCameras(network.subnet, network.ip);
  discoveredCameras = cameras;

  if (cameras.length === 0) {
    console.log('[auto-net] No cameras found on this network. Setup complete (no cameras).');
    await syncToSupabase(network, [], [], null, externalIp);
    return { success: true, cameras: [], streams: [], upnp: null, externalIp };
  }

  // Step 4: Configure go2rtc with discovered cameras
  const streams = await configureGo2rtc(cameras, savedCredentials);

  // Step 5: Try UPnP port forwarding (with retry)
  const upnpResult = await retryUPnP(cameras, externalIp);

  // Step 6: Sync state to Supabase
  await syncToSupabase(network, cameras, streams, upnpResult, externalIp);

  // Step 7: Update fingerprint
  lastNetworkId = network.id;
  autoSetupComplete = true;

  console.log('[auto-net] ═══════════════════════════════════════════════');
  console.log('[auto-net] ✅ Auto-setup complete!');
  console.log(`[auto-net]   Cameras found: ${cameras.length}`);
  console.log(`[auto-net]   Streams configured: ${streams.length}`);
  console.log(`[auto-net]   UPnP port forward: ${upnpResult?.success ? 'YES' : 'NO (using P2P relay)'}`);
  if (upnpResult?.results) {
    for (const r of upnpResult.results) {
      if (r.success && r.remoteUrl) {
        console.log(`[auto-net]   📺 Remote URL: ${r.remoteUrl}`);
      }
    }
  }
  console.log('[auto-net] ═══════════════════════════════════════════════');

  return {
    success: true,
    network,
    externalIp,
    cameras,
    streams,
    upnp: upnpResult
  };
}

// ─── Network Change Monitor ─────────────────────────────────────────────────
function startNetworkWatcher(savedCredentials) {
  if (networkWatchInterval) {
    clearInterval(networkWatchInterval);
  }

  // Check every 30 seconds if the network has changed
  networkWatchInterval = setInterval(async () => {
    const network = getNetworkFingerprint();
    const newId = network?.id || null;
    
    if (newId && newId !== lastNetworkId) {
      console.log(`[auto-net] 🔄 Network change detected! Old: ${lastNetworkId}, New: ${newId}`);
      lastNetworkId = newId;
      autoSetupComplete = false;
      
      // Wait a moment for the network to stabilize
      await sleep(5000);
      
      await runAutoSetup(savedCredentials);
    }
  }, 30000);

  console.log('[auto-net] Network change watcher started (checking every 30s)');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize and start the auto-network system.
 * Call this once during client startup.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.upnpMgr - UPnP manager instance
 * @param {Object} deps.go2rtcMgr - go2rtc manager instance  
 * @param {Function} deps.supabaseReq - Supabase request function
 * @param {string} deps.devId - This device's ID
 * @param {Object} [deps.credentials] - Saved camera credentials { user, pass }
 */
async function init(deps) {
  upnpManager = deps.upnpMgr || null;
  go2rtcManager = deps.go2rtcMgr || null;
  supabaseRequest = deps.supabaseReq || null;
  deviceId = deps.devId || null;

  const credentials = deps.credentials || null;

  console.log('[auto-net] Initializing auto-network system...');
  
  // Initial delay to let WiFi and other services stabilize
  await sleep(3000);

  // Run initial auto-setup
  const result = await runAutoSetup(credentials);

  // Start watching for network changes
  startNetworkWatcher(credentials);

  return result;
}

/**
 * Get current auto-network status (for dashboard queries)
 */
function getStatus() {
  return {
    setupComplete: autoSetupComplete,
    lastNetworkId,
    cameras: discoveredCameras,
    upnpAvailable: upnpManager?.isAvailable() || false,
    externalIp: upnpManager?.getExternalIp() || null,
    mappings: upnpManager?.getMappings() || []
  };
}

/**
 * Force re-scan the current network
 */
async function rescan(credentials) {
  lastNetworkId = null;
  autoSetupComplete = false;
  return runAutoSetup(credentials);
}

/**
 * Stop the network watcher
 */
function stop() {
  if (networkWatchInterval) {
    clearInterval(networkWatchInterval);
    networkWatchInterval = null;
  }
  console.log('[auto-net] Auto-network system stopped');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  init,
  getStatus,
  rescan,
  stop,
  getNetworkFingerprint,
  fetchPublicIp
};
