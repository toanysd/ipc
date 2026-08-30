/**
 * Service Manager - UPnP Manager Module
 * Manages automatic UPnP port forwarding for Electron main process.
 * Communicates with the local router to open ports and handle camera forwarding.
 */

let natUpnp = null;
try {
  natUpnp = require('nat-upnp-2');
} catch (err) {
  console.log(`[upnp] nat-upnp-2 is not installed or failed to load: ${err.message}`);
}

// Module State
let client = null;
let cachedExternalIp = null;
let upnpAvailable = false;
let renewalTimer = null;

// Default port mappings for Service Manager
const DEFAULT_PORT_MAPPINGS = [
  {
    publicPort: 4200,
    privatePort: 4200,
    targetIp: null,
    description: 'Service Manager Web',
    ttl: 3600,
    protocol: 'TCP',
    isCamera: false
  },
  {
    publicPort: 1984,
    privatePort: 1984,
    targetIp: null,
    description: 'Service Manager API',
    ttl: 3600,
    protocol: 'TCP',
    isCamera: false
  },
  {
    publicPort: 8555,
    privatePort: 8555,
    targetIp: null,
    description: 'Service Manager WebRTC',
    ttl: 3600,
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

/**
 * Helper to check if an IPv4 address belongs to a CGNAT or private IP range
 * CGNAT range: 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
 * Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * @param {string} ip
 * @returns {boolean}
 */
function isCGNAT(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 100.64.0.0/10 (Carrier-Grade NAT: 100.64.0.0 - 100.127.255.255)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
    return true;
  }

  // 10.0.0.0/8 (Private Class A / ISP NAT: 10.0.0.0 - 10.255.255.255)
  if (parts[0] === 10) {
    return true;
  }

  // 172.16.0.0/12 (Private Class B: 172.16.0.0 - 172.31.255.255)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  // 192.168.0.0/16 (Private Class C: 192.168.0.0 - 192.168.255.255)
  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  return false;
}

/**
 * Helper to execute client.portMapping with Promise wrapper
 * @param {Object} mapping
 * @returns {Promise<void>}
 */
function mapPort(mapping) {
  return new Promise((resolve, reject) => {
    if (!client) {
      return reject(new Error('UPnP client is not initialized'));
    }

    const options = {
      public: mapping.publicPort,
      private: mapping.targetIp
        ? { host: mapping.targetIp, port: mapping.privatePort }
        : mapping.privatePort,
      ttl: mapping.ttl || 3600,
      description: mapping.description || 'Service Manager',
      protocol: mapping.protocol || 'TCP'
    };

    client.portMapping(options, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Helper to execute client.portUnmapping with Promise wrapper
 * @param {number} publicPort
 * @param {string} protocol
 * @returns {Promise<void>}
 */
function unmapPort(publicPort, protocol = 'TCP') {
  return new Promise((resolve, reject) => {
    if (!client) {
      return resolve();
    }

    const options = {
      public: publicPort,
      protocol: protocol
    };

    client.portUnmapping(options, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Helper to fetch external IP with Promise wrapper
 * @returns {Promise<string>}
 */
function fetchExternalIp() {
  return new Promise((resolve, reject) => {
    if (!client) {
      return reject(new Error('UPnP client is not initialized'));
    }

    client.externalIp((err, ip) => {
      if (err) return reject(err);
      resolve(ip);
    });
  });
}

/**
 * Apply all active mappings to the router
 */
async function applyAllMappings() {
  for (const [port, mapping] of activeMappings.entries()) {
    try {
      await mapPort(mapping);
      const target = mapping.targetIp ? `${mapping.targetIp}:${mapping.privatePort}` : `${mapping.privatePort}`;
      console.log(`[upnp] Mapped port ${mapping.publicPort} -> ${target} (${mapping.description})`);
    } catch (err) {
      console.log(`[upnp] Warning: Failed to map port ${mapping.publicPort} (${mapping.description}): ${err.message}`);
    }
  }
}

/**
 * Starts UPnP port forwarding service:
 * - Discovers gateway
 * - Retrieves external IP and checks for CGNAT
 * - Maps default application ports (4200, 1984, 8555) with 3600s TTL
 * - Sets up automatic renewal interval every 30 minutes
 * @returns {Promise<boolean>}
 */
async function start() {
  try {
    if (!natUpnp) {
      console.log('[upnp] nat-upnp-2 is not available. Port forwarding disabled.');
      upnpAvailable = false;
      return false;
    }

    if (!client) {
      try {
        client = natUpnp.createClient({ timeout: 10000 });
      } catch (err) {
        console.log(`[upnp] Failed to create UPnP client: ${err.message}`);
        upnpAvailable = false;
        return false;
      }
    }

    console.log('[upnp] Starting UPnP port forwarding service...');

    // Fetch router external IP
    try {
      const ip = await fetchExternalIp();
      cachedExternalIp = ip;
      upnpAvailable = true;
      console.log(`[upnp] Router external IP: ${ip}`);

      if (isCGNAT(ip)) {
        console.log('[upnp] CGNAT detected - direct port forwarding will not work from outside');
      }
    } catch (err) {
      upnpAvailable = false;
      console.log(`[upnp] Warning: UPnP gateway discovery failed or not supported on this network: ${err.message}`);
    }

    // Apply all port mappings
    await applyAllMappings();

    // Setup renewal interval every 30 minutes (1800000 ms)
    if (renewalTimer) {
      clearInterval(renewalTimer);
      renewalTimer = null;
    }

    renewalTimer = setInterval(async () => {
      console.log('[upnp] Renewing port mappings...');
      try {
        // Refresh external IP
        try {
          const ip = await fetchExternalIp();
          cachedExternalIp = ip;
          upnpAvailable = true;
          if (isCGNAT(ip)) {
            console.log('[upnp] CGNAT detected - direct port forwarding will not work from outside');
          }
        } catch (ipErr) {
          console.log(`[upnp] Warning: Failed to refresh external IP during renewal: ${ipErr.message}`);
        }

        await applyAllMappings();
      } catch (err) {
        console.log(`[upnp] Warning: Error during port mapping renewal: ${err.message}`);
      }
    }, 30 * 60 * 1000);

    return upnpAvailable;
  } catch (err) {
    console.log(`[upnp] Unexpected error in start(): ${err.message}`);
    return false;
  }
}

/**
 * Stops UPnP port forwarding service:
 * - Clears renewal interval
 * - Unmaps all active port mappings from the router
 * - Closes UPnP client
 * @returns {Promise<boolean>}
 */
async function stop() {
  try {
    console.log('[upnp] Stopping UPnP manager and removing port mappings...');

    if (renewalTimer) {
      clearInterval(renewalTimer);
      renewalTimer = null;
    }

    if (client) {
      for (const [port, mapping] of activeMappings.entries()) {
        try {
          await unmapPort(mapping.publicPort, mapping.protocol || 'TCP');
          console.log(`[upnp] Removed port mapping for port ${mapping.publicPort} (${mapping.description})`);
        } catch (err) {
          console.log(`[upnp] Warning: Failed to unmap port ${mapping.publicPort}: ${err.message}`);
        }
      }

      try {
        if (typeof client.close === 'function') {
          client.close();
        }
      } catch (err) {
        console.log(`[upnp] Warning: Error closing UPnP client: ${err.message}`);
      }
      client = null;
    }

    upnpAvailable = false;
    console.log('[upnp] UPnP manager stopped');
    return true;
  } catch (err) {
    console.log(`[upnp] Unexpected error in stop(): ${err.message}`);
    return false;
  }
}

/**
 * Returns the cached external/public IP address
 * @returns {string | null}
 */
function getExternalIp() {
  return cachedExternalIp;
}

/**
 * Returns the current port mappings array
 * @returns {Array<Object>}
 */
function getMappings() {
  return Array.from(activeMappings.values()).map(m => ({ ...m }));
}

/**
 * Returns boolean indicating if UPnP is available on the router
 * @returns {boolean}
 */
function isAvailable() {
  return upnpAvailable;
}

/**
 * Creates a direct port forward from external port to a camera's internal IP:port
 * Allows direct access to the camera even when the host laptop/PC is off
 * @param {string} cameraIp - Internal IP address of the camera
 * @param {number|string} cameraPort - Internal port of the camera
 * @param {number|string} externalPort - Public port on router
 * @param {string} [description] - Mapping description
 * @returns {Promise<boolean>}
 */
async function forwardCameraPort(cameraIp, cameraPort, externalPort, description) {
  try {
    const extPort = Number(externalPort);
    const intPort = Number(cameraPort);
    const desc = description || `Camera ${cameraIp}:${intPort}`;

    if (!cameraIp || isNaN(extPort) || isNaN(intPort)) {
      console.log(`[upnp] Invalid parameters for forwardCameraPort: cameraIp=${cameraIp}, cameraPort=${cameraPort}, externalPort=${externalPort}`);
      return false;
    }

    const mapping = {
      publicPort: extPort,
      privatePort: intPort,
      targetIp: cameraIp,
      description: desc,
      ttl: 3600,
      protocol: 'TCP',
      isCamera: true
    };

    activeMappings.set(extPort, mapping);

    if (!natUpnp) {
      console.log(`[upnp] nat-upnp-2 is not available; recorded camera mapping for port ${extPort}`);
      return false;
    }

    if (!client) {
      try {
        client = natUpnp.createClient({ timeout: 10000 });
      } catch (err) {
        console.log(`[upnp] Failed to initialize UPnP client: ${err.message}`);
        return false;
      }
    }

    await mapPort(mapping);
    console.log(`[upnp] Camera port forward established: External ${extPort} -> ${cameraIp}:${intPort} (${desc})`);
    return true;
  } catch (err) {
    console.log(`[upnp] Warning: Failed to forward camera port ${externalPort} -> ${cameraIp}:${cameraPort}: ${err.message}`);
    return false;
  }
}

/**
 * Removes a camera port forward
 * @param {number|string} externalPort
 * @returns {Promise<boolean>}
 */
async function removeCameraForward(externalPort) {
  try {
    const extPort = Number(externalPort);
    if (isNaN(extPort)) {
      console.log(`[upnp] Invalid external port for removeCameraForward: ${externalPort}`);
      return false;
    }

    const mapping = activeMappings.get(extPort);
    activeMappings.delete(extPort);

    if (client) {
      try {
        await unmapPort(extPort, (mapping && mapping.protocol) || 'TCP');
        console.log(`[upnp] Camera port forward removed for external port ${extPort}`);
      } catch (err) {
        console.log(`[upnp] Warning: Failed to unmap camera port ${extPort} on router: ${err.message}`);
      }
    } else {
      console.log(`[upnp] Removed camera forward for external port ${extPort}`);
    }

    return true;
  } catch (err) {
    console.log(`[upnp] Warning: Error in removeCameraForward for port ${externalPort}: ${err.message}`);
    return false;
  }
}

// Clean up port mappings on process termination signals
process.on('SIGINT', () => {
  stop().catch(() => {});
});

process.on('SIGTERM', () => {
  stop().catch(() => {});
});

module.exports = {
  start,
  stop,
  getExternalIp,
  getMappings,
  isAvailable,
  forwardCameraPort,
  removeCameraForward
};
