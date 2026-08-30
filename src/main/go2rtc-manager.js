const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const MAX_RETRIES = 5;
const RESTART_DELAY_MS = 3000;
const STABLE_RUN_THRESHOLD_MS = 15000;
const API_BASE_URL = 'http://127.0.0.1:1984';

let go2rtcProcess = null;
let retryCount = 0;
let isManuallyStopped = false;
let restartTimeout = null;
let stableTimer = null;
let lastConfigDir = null;

/**
 * Finds the go2rtc binary by checking production, development, and PATH locations in order.
 * @returns {string} Path or command name for go2rtc binary
 */
function findBinary() {
  const binaryName = process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';

  // 1. Electron extraResources (production)
  if (process.resourcesPath) {
    const prodPathExe = path.join(process.resourcesPath, 'go2rtc.exe');
    if (fs.existsSync(prodPathExe)) {
      console.log(`[go2rtc] Found binary in resourcesPath: ${prodPathExe}`);
      return prodPathExe;
    }
    const prodPathPlatform = path.join(process.resourcesPath, binaryName);
    if (fs.existsSync(prodPathPlatform)) {
      console.log(`[go2rtc] Found binary in resourcesPath: ${prodPathPlatform}`);
      return prodPathPlatform;
    }
  }

  // 2. Development path (root/resources/go2rtc.exe)
  const devPathExe = path.join(__dirname, '..', '..', 'resources', 'go2rtc.exe');
  if (fs.existsSync(devPathExe)) {
    console.log(`[go2rtc] Found binary in dev resources: ${devPathExe}`);
    return devPathExe;
  }
  const devPathPlatform = path.join(__dirname, '..', '..', 'resources', binaryName);
  if (fs.existsSync(devPathPlatform)) {
    console.log(`[go2rtc] Found binary in dev resources: ${devPathPlatform}`);
    return devPathPlatform;
  }

  // 3. Fallback: Search system PATH
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);
  for (const dir of pathDirs) {
    if (!dir) continue;
    const fullPathExe = path.join(dir, 'go2rtc.exe');
    if (fs.existsSync(fullPathExe)) {
      console.log(`[go2rtc] Found binary in PATH: ${fullPathExe}`);
      return fullPathExe;
    }
    const fullPathPlatform = path.join(dir, binaryName);
    if (fs.existsSync(fullPathPlatform)) {
      console.log(`[go2rtc] Found binary in PATH: ${fullPathPlatform}`);
      return fullPathPlatform;
    }
  }

  console.log(`[go2rtc] Binary not found on disk, falling back to command name "${binaryName}"`);
  return binaryName;
}

/**
 * Resolves the configuration directory, defaulting to Electron userData or os.tmpdir().
 * @param {string} [customConfigDir] Optional custom configuration directory path
 * @returns {string} Config directory path
 */
function getConfigDir(customConfigDir) {
  if (customConfigDir) {
    return customConfigDir;
  }
  try {
    const electron = require('electron');
    const electronApp = (typeof electron === 'object' && electron !== null)
      ? (electron.app || (electron.remote && electron.remote.app))
      : null;
    if (electronApp && typeof electronApp.getPath === 'function') {
      return electronApp.getPath('userData');
    }
  } catch (e) {
    // Electron not available
  }
  return path.join(os.tmpdir(), 'go2rtc');
}

/**
 * Generates and ensures the go2rtc.yaml config file exists in the specified directory.
 * @param {string} configDir Directory to place go2rtc.yaml
 * @returns {string} Full path to go2rtc.yaml
 */
function ensureConfigFile(configDir) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = path.join(configDir, 'go2rtc.yaml');
    if (!fs.existsSync(configPath)) {
      const defaultYaml = `api:
  listen: ":1984"
webrtc:
  listen: ":8555"
  candidates:
    - stun:stun.l.google.com:19302
streams:
`;
      fs.writeFileSync(configPath, defaultYaml, 'utf-8');
      console.log(`[go2rtc] Created config file at ${configPath}`);
    } else {
      try {
        let content = fs.readFileSync(configPath, 'utf-8');
        if (/^streams:\s*\{\}\s*$/m.test(content)) {
          content = content.replace(/^streams:\s*\{\}\s*$/m, 'streams:\n');
          fs.writeFileSync(configPath, content, 'utf-8');
        }
      } catch (e) {
        // Ignore normalization errors on existing files
      }
    }
    return configPath;
  } catch (err) {
    console.error(`[go2rtc] Failed to ensure config file: ${err.message}`);
    throw err;
  }
}

/**
 * Helper to make HTTP requests to the go2rtc REST API using Node.js built-in http module.
 * @param {string} method HTTP method (GET, POST, PUT, DELETE)
 * @param {string} endpoint Path and query string
 * @param {string|Buffer|object} [body] Optional request body
 * @param {object} [headers] Optional HTTP headers
 * @returns {Promise<any>} Parsed response data
 */
function apiRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE_URL);
    const reqHeaders = { ...headers };

    let payload = null;
    if (body !== null && body !== undefined) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        payload = body;
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'text/plain; charset=utf-8';
        }
      } else if (typeof body === 'object') {
        payload = JSON.stringify(body);
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    } else {
      if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
        reqHeaders['Content-Length'] = 0;
      }
    }

    const options = {
      hostname: url.hostname,
      port: url.port || 1984,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (e) {
            resolve(responseData);
          }
        } else {
          const err = new Error(`HTTP request failed with status ${res.statusCode}: ${responseData || res.statusMessage}`);
          err.statusCode = res.statusCode;
          err.response = responseData;
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('HTTP request timeout to go2rtc API'));
    });

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Starts the go2rtc process.
 * @param {string} [configDir] Optional directory for go2rtc.yaml
 * @returns {import('child_process').ChildProcess|null}
 */
function start(configDir) {
  if (isRunning()) {
    console.log('[go2rtc] Process is already running');
    return go2rtcProcess;
  }

  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  isManuallyStopped = false;
  lastConfigDir = configDir;

  try {
    const dir = getConfigDir(configDir);
    const configPath = ensureConfigFile(dir);
    const binaryPath = findBinary();

    console.log(`[go2rtc] Starting go2rtc from ${binaryPath} with config ${configPath}`);

    go2rtcProcess = spawn(binaryPath, ['-config', configPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (stableTimer) {
      clearTimeout(stableTimer);
    }
    stableTimer = setTimeout(() => {
      if (isRunning()) {
        retryCount = 0;
      }
    }, STABLE_RUN_THRESHOLD_MS);

    go2rtcProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/).filter((line) => line.trim().length > 0);
      for (const line of lines) {
        console.log(`[go2rtc] ${line}`);
      }
    });

    go2rtcProcess.stderr.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/).filter((line) => line.trim().length > 0);
      for (const line of lines) {
        console.error(`[go2rtc] ${line}`);
      }
    });

    go2rtcProcess.on('error', (err) => {
      console.error(`[go2rtc] Process error: ${err.message}`);
    });

    go2rtcProcess.on('close', (code, signal) => {
      console.log(`[go2rtc] Process closed (code: ${code}, signal: ${signal})`);
      go2rtcProcess = null;

      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = null;
      }

      if (!isManuallyStopped) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`[go2rtc] Unexpected exit. Restarting in ${RESTART_DELAY_MS / 1000}s... (Attempt ${retryCount}/${MAX_RETRIES})`);
          restartTimeout = setTimeout(() => {
            start(lastConfigDir);
          }, RESTART_DELAY_MS);
        } else {
          console.error(`[go2rtc] Maximum restart retries (${MAX_RETRIES}) reached. Process will not be restarted.`);
        }
      }
    });

    return go2rtcProcess;
  } catch (err) {
    console.error(`[go2rtc] Error starting process: ${err.message}`);
    if (!isManuallyStopped && retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[go2rtc] Restarting in ${RESTART_DELAY_MS / 1000}s after start failure... (Attempt ${retryCount}/${MAX_RETRIES})`);
      restartTimeout = setTimeout(() => {
        start(lastConfigDir);
      }, RESTART_DELAY_MS);
    }
    return null;
  }
}

/**
 * Gracefully stops the go2rtc process and prevents auto-restart.
 */
function stop() {
  isManuallyStopped = true;

  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }

  retryCount = 0;

  if (go2rtcProcess) {
    console.log('[go2rtc] Stopping go2rtc process...');
    try {
      go2rtcProcess.kill();
    } catch (err) {
      console.error(`[go2rtc] Error stopping process: ${err.message}`);
    }
    go2rtcProcess = null;
  }
}

/**
 * Checks if the go2rtc process is currently running.
 * @returns {boolean} True if running, false otherwise
 */
function isRunning() {
  return Boolean(go2rtcProcess && !go2rtcProcess.killed && go2rtcProcess.pid);
}

/**
 * Returns the go2rtc REST API base URL.
 * @returns {string} API URL
 */
function getApiUrl() {
  return API_BASE_URL;
}

/**
 * Adds a camera stream to go2rtc via REST API.
 * @param {string} name Stream identifier name
 * @param {string} url Source RTSP/DVRIP/etc. URL
 * @returns {Promise<any>}
 */
async function addStream(name, url) {
  try {
    const params = new URLSearchParams({ name: name, src: url });
    const endpoint = `/api/streams?${params.toString()}`;
    const result = await apiRequest('PUT', endpoint);
    console.log(`[go2rtc] Added stream "${name}" -> "${url}"`);
    return result;
  } catch (err) {
    console.error(`[go2rtc] Failed to add stream "${name}":`, err.message);
    throw err;
  }
}

/**
 * Removes a camera stream from go2rtc via REST API.
 * @param {string} name Stream identifier name
 * @returns {Promise<any>}
 */
async function removeStream(name) {
  try {
    const params = new URLSearchParams({ name: name });
    const endpoint = `/api/streams?${params.toString()}`;
    const result = await apiRequest('DELETE', endpoint);
    console.log(`[go2rtc] Removed stream "${name}"`);
    return result;
  } catch (err) {
    console.error(`[go2rtc] Failed to remove stream "${name}":`, err.message);
    throw err;
  }
}

/**
 * Retrieves all camera streams from go2rtc.
 * @returns {Promise<any>}
 */
async function getStreams() {
  try {
    const result = await apiRequest('GET', '/api/streams');
    return result;
  } catch (err) {
    console.error('[go2rtc] Failed to get streams:', err.message);
    throw err;
  }
}

/**
 * Exchanges WebRTC offer with go2rtc to receive an SDP answer.
 * @param {string} name Stream identifier name
 * @param {string|object} offer WebRTC SDP offer string or object
 * @returns {Promise<string|object>} WebRTC SDP answer
 */
async function getWebRTCOffer(name, offer) {
  try {
    const params = new URLSearchParams({ src: name });
    const endpoint = `/api/webrtc?${params.toString()}`;
    let body = offer;
    let contentType = 'application/sdp';

    if (typeof offer === 'object') {
      if (offer && typeof offer.sdp === 'string') {
        body = offer.sdp;
        contentType = 'application/sdp';
      } else {
        body = JSON.stringify(offer);
        contentType = 'application/json';
      }
    } else if (typeof offer === 'string') {
      body = offer;
      if (offer.trim().startsWith('{')) {
        contentType = 'application/json';
      } else {
        contentType = 'application/sdp';
      }
    }

    const answer = await apiRequest('POST', endpoint, body, {
      'Content-Type': contentType
    });
    return answer;
  } catch (err) {
    console.error(`[go2rtc] Failed to get WebRTC answer for stream "${name}":`, err.message);
    throw err;
  }
}

// Clean up child process on exit
function handleExit() {
  stop();
}

process.on('exit', handleExit);
process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

try {
  const electron = require('electron');
  const electronApp = (typeof electron === 'object' && electron !== null)
    ? (electron.app || (electron.remote && electron.remote.app))
    : null;
  if (electronApp && typeof electronApp.on === 'function') {
    electronApp.on('before-quit', handleExit);
  }
} catch (e) {
  // Electron not available
}

module.exports = {
  start,
  stop,
  isRunning,
  getApiUrl,
  addStream,
  removeStream,
  getStreams,
  getWebRTCOffer
};
