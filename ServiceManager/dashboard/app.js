const SUPABASE_URL = 'https://lfsoronpedvwxxtjqkep.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc29yb25wZWR2d3h4dGpxa2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTA0NDMsImV4cCI6MjA5ODc2NjQ0M30.FZhJGMFmWmKqyCu8cZ-OlgAJ6Vk7hLO5Ay5_0Qc78aQ';
const WS_URL = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;

let devices = [];
let captures = [];
let currentDevice = null;
let currentView = 'dashboard';
let ws = null;
let peerConnection = null;

// DOM Elements
const el = {
    loginOverlay: document.getElementById('loginOverlay'),
    loginForm: document.getElementById('loginForm'),
    pinInput: document.getElementById('pinInput'),
    loginError: document.getElementById('loginError'),
    appContainer: document.getElementById('appContainer'),
    deviceList: document.getElementById('deviceList'),
    captureGrid: document.getElementById('captureGrid'),
    navItems: document.querySelectorAll('.nav-list li[data-view]'),
    views: document.querySelectorAll('.view-section'),
    currentDeviceName: document.getElementById('currentDeviceName'),
    currentDeviceIp: document.getElementById('currentDeviceIp'),
    typeFilter: document.getElementById('typeFilter'),
    streamBtn: document.getElementById('streamBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    webrtcPlayer: document.getElementById('webrtcPlayer'),
    streamStatus: document.getElementById('streamStatus'),
    fullscreenStreamBtn: document.getElementById('fullscreenStreamBtn'),
    lightbox: document.getElementById('lightbox'),
    closeLightbox: document.getElementById('closeLightbox'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxText: document.getElementById('lightboxText'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    statusTotalDev: document.getElementById('statusTotalDev'),
    statusOnlineDev: document.getElementById('statusOnlineDev'),
    countScreens: document.getElementById('countScreens'),
    countCamera: document.getElementById('countCamera'),
    countClipboard: document.getElementById('countClipboard')
};

// --- AUTHENTICATION ---
el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = el.pinInput.value;
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        
        if (response.ok) {
            const data = await response.json();
            sessionStorage.setItem('sm_token', data.token);
            el.loginOverlay.classList.add('hidden');
            el.appContainer.classList.remove('hidden');
            initApp();
        } else {
            el.loginError.textContent = 'Invalid PIN';
        }
    } catch (err) {
        el.loginError.textContent = 'Connection error';
        console.warn('Backend not reachable, proceeding as dev mode');
        sessionStorage.setItem('sm_token', 'dev-token');
        el.loginOverlay.classList.add('hidden');
        el.appContainer.classList.remove('hidden');
        initApp();
    }
});

// --- API HELPERS ---
const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

function populateSettingsForm(device) {
    if (!device) return;
    const setScreenToggle = document.getElementById('set-screen-toggle');
    const setScreenInterval = document.getElementById('set-screen-interval');
    const setWebcamToggle = document.getElementById('set-webcam-toggle');
    const setWebcamInterval = document.getElementById('set-webcam-interval');
    const setRecordToggle = document.getElementById('set-record-toggle');
    const setClipboardToggle = document.getElementById('set-clipboard-toggle');

    if (setScreenToggle) setScreenToggle.checked = Boolean(device.screen_capture_on);
    if (setScreenInterval) setScreenInterval.value = device.screen_interval_min || 5;
    if (setWebcamToggle) setWebcamToggle.checked = Boolean(device.webcam_capture_on);
    if (setWebcamInterval) setWebcamInterval.value = device.webcam_interval_min || 5;
    if (setRecordToggle) setRecordToggle.checked = Boolean(device.webcam_record_on);
    if (setClipboardToggle) setClipboardToggle.checked = Boolean(device.clipboard_log_on);
}

async function fetchDevices() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sm_devices?select=*`, { headers });
        if (res.ok) {
            devices = await res.json();
            renderDevices();
            updateStatusBar();
            
            // Auto select first device or refresh selected device object
            if (devices.length > 0) {
                if (!currentDevice) {
                    selectDevice(devices[0]);
                } else {
                    const updated = devices.find(d => d.device_id === currentDevice.device_id);
                    if (updated) {
                        currentDevice = updated;
                        populateSettingsForm(currentDevice);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch devices', e);
    }
}

async function fetchCaptures() {
    if (!currentDevice) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sm_captures?device_id=eq.${currentDevice.device_id}&order=created_at.desc`, { headers });
        if (res.ok) {
            captures = await res.json();
            renderCaptures();
            updateCounts();
        }
    } catch (e) {
        console.error('Failed to fetch captures', e);
    }
}

async function updateDeviceSettings(deviceId, settings) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sm_devices?device_id=eq.${deviceId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(settings)
        });
        if (res.ok) {
            if (currentDevice && currentDevice.device_id === deviceId) {
                Object.assign(currentDevice, settings);
                populateSettingsForm(currentDevice);
            }
            const d = devices.find(x => x.device_id === deviceId);
            if (d) Object.assign(d, settings);
            alert('✅ Đã lưu cấu hình thiết bị thành công!');
        } else {
            alert('Lỗi máy chủ khi lưu cấu hình');
        }
    } catch (e) {
        console.error('Failed to save settings', e);
        alert('Lỗi kết nối khi lưu cấu hình');
    }
}

// --- REALTIME ---
function initRealtime() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        console.log('Realtime connected');
        const msg = {
            topic: "realtime:public",
            event: "phx_join",
            payload: {
                config: {
                    postgres_changes: [
                        { event: "*", schema: "public", table: "sm_devices" },
                        { event: "*", schema: "public", table: "sm_captures" }
                    ]
                }
            },
            ref: "1"
        };
        ws.send(JSON.stringify(msg));
        
        setInterval(() => {
            if(ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: Date.now().toString() }));
            }
        }, 30000);
    };

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.event === 'postgres_changes') {
            const payload = data.payload;
            if (payload.table === 'sm_devices') {
                fetchDevices();
            } else if (payload.table === 'sm_captures') {
                if (currentDevice && payload.record && payload.record.device_id === currentDevice.device_id) {
                    fetchCaptures();
                }
            }
        }
    };
}

// --- RENDER LOGIC ---
function renderDevices() {
    el.deviceList.innerHTML = '';
    devices.forEach(dev => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.flexDirection = 'column';
        li.style.alignItems = 'flex-start';
        li.style.padding = '8px 12px';
        li.style.gap = '5px';
        
        const isOnline = dev.last_seen ? ((Date.now() - new Date(dev.last_seen).getTime()) < 90000) : false;
        if (currentDevice && currentDevice.device_id === dev.device_id) li.classList.add('active');
        
        const isWebcamLive = matrixChannels && matrixChannels.has(`${dev.device_id}_webcam`);
        const isIpcamLive = matrixChannels && matrixChannels.has(`${dev.device_id}_ipcam`);
        const isScreenLive = matrixChannels && matrixChannels.has(`${dev.device_id}_screen`);
        const hasLive = isWebcamLive || isIpcamLive || isScreenLive;
        
        li.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                    <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                    <strong style="font-size: 13px;">${dev.device_id}</strong>
                </div>
                ${hasLive ? '<span class="badge bg-green" style="font-size: 10px; padding: 2px 6px;"><span class="live-pulse-dot" style="width:6px; height:6px;"></span> LIVE</span>' : ''}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-left: 14px;">${dev.hostname || 'Device'}</div>
            <div style="display: flex; gap: 4px; margin-left: 14px; margin-top: 2px; flex-wrap: wrap;" onclick="event.stopPropagation()">
                <button onclick="openStreamChannel('${dev.device_id}', 'webcam', '${dev.hostname || dev.device_id}')" class="btn-secondary" style="padding: 2px 6px; font-size: 10px; ${isWebcamLive ? 'background:#d1fae5; color:#065f46; border-color:#86efac;' : ''}" title="Live Webcam máy này"><i class="fa-solid fa-camera"></i> Cam</button>
                <button onclick="openStreamChannel('${dev.device_id}', 'screen', '${dev.hostname || dev.device_id}')" class="btn-secondary" style="padding: 2px 6px; font-size: 10px; ${isScreenLive ? 'background:#dbeafe; color:#1e40af; border-color:#93c5fd;' : ''}" title="Live Màn hình máy này"><i class="fa-solid fa-desktop"></i> Màn</button>
                <button onclick="openStreamChannel('${dev.device_id}', 'ipcam', '${dev.hostname || dev.device_id}')" class="btn-secondary" style="padding: 2px 6px; font-size: 10px; ${isIpcamLive ? 'background:#ccfbf1; color:#115e59; border-color:#5eead4;' : ''}" title="Live Camera IP gắn kèm"><i class="fa-solid fa-video"></i> IP Cam</button>
            </div>
        `;
        li.onclick = () => selectDevice(dev);
        el.deviceList.appendChild(li);
    });
}

function updateStatusBar() {
    if (el.statusTotalDev) el.statusTotalDev.textContent = devices.length;
    const onlineCount = devices.filter(d => d.last_seen && (Date.now() - new Date(d.last_seen).getTime()) < 90000).length;
    if (el.statusOnlineDev) el.statusOnlineDev.textContent = onlineCount;
}

function updateCounts() {
    const screens = captures.filter(c => c.type === 'screenshot' || c.type === 'screen').length;
    const camera = captures.filter(c => c.type === 'webcam' || c.type === 'camera' || c.type === 'webcam_video').length;
    const clipboard = captures.filter(c => c.type === 'clipboard').length;
    
    if (el.countScreens) el.countScreens.textContent = screens;
    if (el.countCamera) el.countCamera.textContent = camera;
    if (el.countClipboard) el.countClipboard.textContent = clipboard;
}

function selectDevice(device) {
    currentDevice = device;
    if (el.currentDeviceName) el.currentDeviceName.textContent = `${device.device_id} (${device.hostname || 'Device'})`;
    if (el.currentDeviceIp) el.currentDeviceIp.textContent = device.external_ip ? `IP: ${device.external_ip}` : (device.platform || '');
    
    renderDevices();
    
    const setScreenToggle = document.getElementById('set-screen-toggle');
    const setScreenInterval = document.getElementById('set-screen-interval');
    const setWebcamToggle = document.getElementById('set-webcam-toggle');
    const setWebcamInterval = document.getElementById('set-webcam-interval');
    const setRecordToggle = document.getElementById('set-record-toggle');
    const setClipboardToggle = document.getElementById('set-clipboard-toggle');

    if (setScreenToggle) setScreenToggle.checked = !!device.screen_capture_on;
    if (setScreenInterval) setScreenInterval.value = device.screen_interval_min || 5;
    if (setWebcamToggle) setWebcamToggle.checked = !!device.webcam_capture_on;
    if (setWebcamInterval) setWebcamInterval.value = device.webcam_interval_min || 5;
    if (setRecordToggle) setRecordToggle.checked = !!device.webcam_record_on;
    if (setClipboardToggle) setClipboardToggle.checked = !!device.clipboard_log_on;
    
    populateCameraForm(device);
    fetchCaptures();
}

function populateCameraForm(device) {
    if (!device) return;
    
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem('sm_camera_' + device.device_id));
    } catch(e) {}
    
    const camIp = device.camera_ip || (saved && saved.ip) || '';
    const camUser = (saved && saved.user) || 'toanysd';
    const camPass = (saved && saved.pass) || '';
    const camBrand = (saved && saved.brand) || 'tapo';
    const camQuality = (saved && saved.quality) || '/stream1';
    
    const ipInput = document.getElementById('camIpInput');
    const userInput = document.getElementById('camUserInput');
    const passInput = document.getElementById('camPassInput');
    const brandSelect = document.getElementById('camBrandSelect');
    const qualitySelect = document.getElementById('camStreamQuality');
    const tapoHint = document.getElementById('tapoHint');
    
    if (ipInput && camIp) ipInput.value = camIp;
    if (userInput) userInput.value = camUser;
    if (passInput) passInput.value = camPass;
    if (brandSelect) brandSelect.value = camBrand;
    if (qualitySelect) qualitySelect.value = camQuality;
    if (tapoHint) tapoHint.style.display = (camBrand === 'tapo') ? 'block' : 'none';
    
    const targetInput = document.getElementById('upnpTargetIp');
    if (targetInput && camIp) targetInput.value = camIp;
    
    updateGeneratedRtspUrl();
}

function saveLocalCameraConfig() {
    if (!currentDevice) return;
    const config = {
        ip: document.getElementById('camIpInput')?.value.trim() || '',
        user: document.getElementById('camUserInput')?.value.trim() || '',
        pass: document.getElementById('camPassInput')?.value.trim() || '',
        brand: document.getElementById('camBrandSelect')?.value || 'tapo',
        quality: document.getElementById('camStreamQuality')?.value || '/stream1',
        remoteUrl: document.getElementById('generatedRtspUrl')?.value || ''
    };
    try {
        localStorage.setItem('sm_camera_' + currentDevice.device_id, JSON.stringify(config));
    } catch(e) {}
}

function renderCaptures() {
    el.captureGrid.innerHTML = '';
    const filter = el.typeFilter ? el.typeFilter.value : 'all';
    
    const filtered = captures.filter(c => filter === 'all' || c.type === filter);
    
    if (filtered.length === 0) {
        el.captureGrid.innerHTML = '<p class="text-muted" style="padding: 20px; grid-column: 1/-1;">Chưa có ảnh/dữ liệu nào. Hãy bấm nút <strong>"Chụp Màn Hình"</strong> hoặc <strong>"Chụp Webcam"</strong> ở trên để chụp ngay!</p>';
        return;
    }

    filtered.forEach(cap => {
        const card = document.createElement('div');
        card.className = 'capture-card';
        card.onclick = () => openLightbox(cap);
        
        const date = cap.created_at ? new Date(cap.created_at).toLocaleString('vi-VN') : '';
        
        let content = '';
        if (cap.type === 'clipboard') {
            const txt = (cap.metadata && cap.metadata.text) || cap.storage_path || 'No text';
            content = `<div class="clipboard-thumb" style="padding: 10px; font-family: monospace; font-size: 12px; background: #f8fafc; border-radius: 4px; height: 130px; overflow: hidden; border: 1px solid #e2e8f0;">${escapeHTML(txt).substring(0, 150)}...</div>`;
        } else {
            const imgSrc = cap.thumbnail || (cap.storage_path && cap.storage_path.startsWith('http') ? cap.storage_path : `${SUPABASE_URL}/storage/v1/object/public/sm-captures/${cap.storage_path}`);
            content = `<img src="${imgSrc}" class="capture-thumb" style="width: 100%; height: 140px; object-fit: cover; border-radius: 4px;" loading="lazy">`;
        }
        
        card.innerHTML = `
            ${content}
            <div class="capture-meta" style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 11px; color: #64748b;">
                <span><i class="fa-solid ${getIconForType(cap.type)}"></i> ${cap.type}</span>
                <span>${date}</span>
            </div>
        `;
        el.captureGrid.appendChild(card);
    });
}

function getIconForType(type) {
    if(type === 'screenshot' || type === 'screen') return 'fa-desktop';
    if(type === 'webcam' || type === 'camera') return 'fa-camera';
    if(type === 'clipboard') return 'fa-clipboard';
    if(type === 'webcam_video') return 'fa-video';
    return 'fa-file';
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// --- LIGHTBOX ---
function openLightbox(cap) {
    if (!el.lightbox) return;
    el.lightbox.classList.remove('hidden');
    const date = cap.created_at ? new Date(cap.created_at).toLocaleString('vi-VN') : '';
    if (el.lightboxCaption) el.lightboxCaption.textContent = `${(cap.type || '').toUpperCase()} - ${date}`;
    
    if (cap.type === 'clipboard') {
        if (el.lightboxImg) el.lightboxImg.classList.add('hidden');
        if (el.lightboxText) {
            el.lightboxText.classList.remove('hidden');
            el.lightboxText.textContent = (cap.metadata && cap.metadata.text) || cap.storage_path || '';
        }
    } else {
        if (el.lightboxText) el.lightboxText.classList.add('hidden');
        if (el.lightboxImg) {
            el.lightboxImg.classList.remove('hidden');
            el.lightboxImg.src = cap.thumbnail || (cap.storage_path && cap.storage_path.startsWith('http') ? cap.storage_path : `${SUPABASE_URL}/storage/v1/object/public/sm-captures/${cap.storage_path}`);
        }
    }
}

if (el.closeLightbox) {
    el.closeLightbox.onclick = () => {
        el.lightbox.classList.add('hidden');
        if (el.lightboxImg) el.lightboxImg.src = '';
    };
}

// --- PEERJS REMOTE COMMANDS ---
let managerPeer = null;

function getManagerPeer() {
    if (!managerPeer && window.Peer) {
        try {
            const peerId = `SM-MGR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            managerPeer = new Peer(peerId, {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });
            managerPeer.on('open', id => console.log('Manager Peer ready:', id));
        } catch (e) {
            console.error('Failed to init PeerJS:', e);
        }
    }
    return managerPeer;
}

function sendDeviceCommand(cmd, payload = {}) {
    if (!currentDevice) {
        alert('Vui lòng bấm chọn một thiết bị từ danh sách bên trái trước!');
        return;
    }
    const statusEl = document.getElementById('actionStatus');
    if (statusEl) statusEl.textContent = `Đang gửi lệnh: ${cmd}...`;
    
    const peer = getManagerPeer();
    if (!peer) {
        if (statusEl) statusEl.textContent = 'PeerJS chưa sẵn sàng';
        return;
    }
    
    try {
        const conn = peer.connect(currentDevice.device_id);
        conn.on('open', () => {
            conn.send({ cmd, ...payload });
            if (statusEl) statusEl.textContent = `Đã gửi lệnh ${cmd}! Đang chụp...`;
        });
        conn.on('data', (data) => {
            console.log('Received response from client:', data);
            
            if (data.cmd === 'get-network-info-result' && data.data) {
                const d = data.data;
                const localIpEl = document.getElementById('netLocalIp');
                const subnetEl = document.getElementById('netSubnet');
                const pubIpEl = document.getElementById('netPublicIp');
                const upnpEl = document.getElementById('netUpnpStatus');
                
                if (localIpEl) localIpEl.textContent = d.localIp || '127.0.0.1';
                if (subnetEl) subnetEl.textContent = d.subnet || '255.255.255.0';
                if (pubIpEl) pubIpEl.textContent = d.externalIp || 'Chưa phát hiện';
                if (upnpEl) {
                    upnpEl.textContent = d.upnpAvailable ? 'Đang hoạt động (Active)' : 'Không khả dụng';
                    upnpEl.className = `badge ${d.upnpAvailable ? 'bg-green' : 'bg-red'}`;
                }
                
                renderUpnpMappings(d.mappings || []);
                updateGeneratedRtspUrl();
                if (statusEl) statusEl.textContent = 'Đã cập nhật thông tin mạng!';
            } else if (data.cmd === 'scan-wifi-devices-result') {
                renderWifiDevices(data.devices || []);
                const scanStatus = document.getElementById('scanStatusText');
                if (scanStatus) {
                    scanStatus.innerHTML = `✅ Đã quét xong! Tìm thấy ${(data.devices || []).length} thiết bị đang hoạt động trong mạng WiFi.`;
                }
                if (statusEl) statusEl.textContent = 'Quét mạng hoàn tất!';
            } else if (data.cmd === 'open-port-result' || data.cmd === 'close-port-result') {
                renderUpnpMappings(data.mappings || []);
                alert(data.success ? 'Thao tác cấu hình cổng thành công!' : 'Router không phản hồi cấu hình cổng');
                if (statusEl) statusEl.textContent = 'Cấu hình cổng xong!';
            } else if (data.cmd === 'setup-camera-stream-result') {
                const streamStatus = document.getElementById('camStreamStatus');
                if (data.success) {
                    if (streamStatus) streamStatus.textContent = '✅ Đã nạp luồng camera vào engine go2rtc! Đang mở video...';
                    setTimeout(() => {
                        switchView('stream');
                        startIpCamWebRTC();
                    }, 1200);
                } else {
                    if (streamStatus) streamStatus.textContent = `❌ Lỗi: ${data.error || 'Không thể kết nối Camera'}`;
                }
            } else if (data.cmd === 'get-auto-network-status-result' && data.data) {
                renderAutoNetworkStatus(data.data);
                if (statusEl) statusEl.textContent = 'Đã cập nhật trạng thái Auto-Network!';
            } else if (data.cmd === 'save-camera-credentials-result') {
                if (data.success) {
                    alert('✅ Đã lưu thông tin đăng nhập Camera và đang tự động dò tìm + cấu hình lại!');
                    if (data.autoNetwork) renderAutoNetworkStatus(data.autoNetwork);
                } else {
                    alert('❌ Lỗi: ' + (data.error || 'Không thể lưu'));
                }
                if (statusEl) statusEl.textContent = '';
            } else if (data.cmd === 'force-rescan-network-result') {
                if (data.success && data.data) {
                    renderAutoNetworkStatus(data.data);
                    alert('✅ Đã quét lại mạng thành công!');
                } else {
                    alert('❌ Lỗi quét mạng: ' + (data.error || 'Unknown'));
                }
                if (statusEl) statusEl.textContent = '';
            } else {
                if (statusEl) statusEl.textContent = `Thiết bị hoàn thành: ${data.cmd || 'Thành công!'}`;
                setTimeout(() => {
                    fetchCaptures();
                    if (statusEl) statusEl.textContent = '';
                }, 1200);
            }
        });
        conn.on('error', (err) => {
            console.error('P2P connection error:', err);
            if (statusEl) statusEl.textContent = 'Lỗi kết nối trực tiếp (máy khách có thể đang offline)';
        });
    } catch (e) {
        console.error('Command error:', e);
        if (statusEl) statusEl.textContent = 'Lỗi gửi lệnh';
    }
}

// Render UPnP Port Mappings Table
function renderUpnpMappings(mappings) {
    const tbody = document.getElementById('upnpMappingTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!mappings || mappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #94a3b8;">Chưa có cổng nào được mở trên Router.</td></tr>';
        return;
    }
    
    mappings.forEach(m => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';
        tr.innerHTML = `
            <td style="padding: 8px; font-family: monospace; font-weight: bold; color: #2563eb;">${m.publicPort}</td>
            <td style="padding: 8px; font-family: monospace;">${m.targetIp || '127.0.0.1'}:${m.privatePort}</td>
            <td style="padding: 8px;"><span class="badge" style="background:#e0f2fe; color:#0369a1;">${m.protocol || 'TCP'}</span></td>
            <td style="padding: 8px;">${escapeHTML(m.description || 'Port forward')}</td>
            <td style="padding: 8px;"><span class="badge bg-green">Đã Mở</span></td>
            <td style="padding: 8px;">
                <button onclick="closePortMapping(${m.publicPort})" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #dc2626; border-color: #fca5a5;"><i class="fa-solid fa-trash"></i> Đóng Cổng</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Auto-Network Discovery Status
function renderAutoNetworkStatus(data) {
    // data can be from getStatus() or from runAutoSetup() result
    const cameras = data.cameras || data.discovered_cameras || [];
    const externalIp = data.externalIp || data.external_ip || '';
    const upnpAvailable = data.upnpAvailable || data.upnp_available || false;
    const upnpForwards = data.upnp?.results || data.upnp_forwards || [];
    const streams = data.streams || data.configured_streams || [];
    const mappings = data.mappings || data.port_mappings || [];
    const networkInfo = data.network || {};
    const setupComplete = data.success !== undefined ? data.success : data.setupComplete;
    
    // Update network info panel
    const localIpEl = document.getElementById('netLocalIp');
    const pubIpEl = document.getElementById('netPublicIp');
    const upnpEl = document.getElementById('netUpnpStatus');
    
    if (localIpEl && networkInfo.ip) localIpEl.textContent = networkInfo.ip;
    if (pubIpEl && externalIp) pubIpEl.textContent = externalIp;
    if (upnpEl) {
        upnpEl.textContent = upnpAvailable ? 'Đang hoạt động (Active)' : 'Không khả dụng';
        upnpEl.className = `badge ${upnpAvailable ? 'bg-green' : 'bg-red'}`;
    }

    // Update UPnP mappings table
    if (mappings.length > 0) renderUpnpMappings(mappings);

    // Auto-fill camera form if cameras found
    if (cameras.length > 0) {
        const cam = cameras[0];
        const ipInput = document.getElementById('camIpInput');
        const portInput = document.getElementById('camPortInput');
        if (ipInput && !ipInput.value) ipInput.value = cam.ip;
        if (portInput) portInput.value = cam.rtspPort || cam.rtsp_port || 554;
        
        const brandSelect = document.getElementById('camBrandSelect');
        if (brandSelect) {
            const camType = cam.type || cam.cameraType || 'tapo';
            if (camType === 'tapo') brandSelect.value = 'tapo';
            else if (camType === 'icsee') brandSelect.value = 'icsee';
            else brandSelect.value = 'generic';
        }
        
        // Auto-fill UPnP target
        const targetInput = document.getElementById('upnpTargetIp');
        if (targetInput && !targetInput.value) targetInput.value = cam.ip;
    }

    // Generate remote RTSP URL
    if (externalIp && cameras.length > 0) {
        const cam = cameras[0];
        const user = document.getElementById('camUserInput')?.value.trim() || 'admin';
        const pass = document.getElementById('camPassInput')?.value.trim() || '';
        const rtspPath = cam.rtspPath || cam.rtsp_path || cam.defaultRtspPath || '/stream1';
        const auth = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
        
        // Check if UPnP forwarding succeeded
        const fwd = upnpForwards.find(f => f.success);
        const extPort = fwd ? fwd.externalPort : 10554;
        const fullUrl = `rtsp://${auth}${externalIp}:${extPort}${rtspPath}`;
        
        const urlInput = document.getElementById('generatedRtspUrl');
        if (urlInput) urlInput.value = fullUrl;
    }

    // Render auto-network status banner
    const statusBanner = document.getElementById('autoNetworkBanner');
    if (statusBanner) {
        let bannerHtml = '';
        
        if (setupComplete && cameras.length > 0) {
            bannerHtml = `
                <div style="background: linear-gradient(135deg, #ecfdf5, #f0f9ff); border: 1px solid #6ee7b7; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="font-size: 20px;">🟢</span>
                        <strong style="color: #065f46; font-size: 15px;">Hệ thống đã TỰ ĐỘNG phát hiện ${cameras.length} Camera</strong>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            `;
            
            cameras.forEach((cam, i) => {
                const type = cam.type || cam.cameraType || 'camera';
                const ip = cam.ip || cam.cameraIp || '';
                const ports = cam.openPorts || cam.ports || [];
                const typeBadge = type === 'tapo' ? '📷 Tapo' : (type === 'icsee' ? '📹 ICSee' : '🎥 Generic');
                bannerHtml += `
                    <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #d1fae5;">
                        <span style="font-weight: 600; color: #0D9488;">${typeBadge}</span>
                        <span style="font-family: monospace; color: #1e40af; font-weight: 600;">${ip}</span>
                        <span style="color: #64748b; font-size: 12px;">Cổng: ${ports.join(', ')}</span>
                        ${streams.length > i ? '<span class="badge bg-green" style="font-size: 11px;">go2rtc ✓</span>' : ''}
                    </div>
                `;
            });
            
            // UPnP status
            if (upnpAvailable && upnpForwards.some(f => f.success)) {
                const fwd = upnpForwards.find(f => f.success);
                bannerHtml += `
                    <div style="margin-top: 6px; padding: 8px 12px; background: #dbeafe; border-radius: 6px; border: 1px solid #93c5fd;">
                        <strong style="color: #1e40af;">🌐 Mở cổng tự động thành công!</strong>
                        <span style="font-size: 12px; color: #3b82f6;"> Cổng ${fwd.externalPort} → ${fwd.cameraIp}:${fwd.internalPort}</span>
                    </div>
                `;
            } else {
                bannerHtml += `
                    <div style="margin-top: 6px; padding: 8px 12px; background: #fef3c7; border-radius: 6px; border: 1px solid #fbbf24;">
                        <strong style="color: #92400e;">⚠️ UPnP không khả dụng</strong>
                        <span style="font-size: 12px; color: #b45309;"> — Xem từ xa qua Dashboard P2P (cần bật Laptop). Hoặc mở cổng Router thủ công.</span>
                    </div>
                `;
            }
            
            bannerHtml += '</div></div>';
        } else if (setupComplete && cameras.length === 0) {
            bannerHtml = `
                <div style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">🔍</span>
                        <strong style="color: #92400e; font-size: 14px;">Không tìm thấy Camera IP trên mạng hiện tại</strong>
                    </div>
                    <p style="margin: 8px 0 0 30px; font-size: 13px; color: #78716c;">Hãy đảm bảo Camera đã bật và kết nối cùng mạng WiFi.</p>
                </div>
            `;
        } else {
            bannerHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-spinner fa-spin" style="color: #0D9488;"></i>
                        <strong style="color: #475569; font-size: 14px;">Đang tự động dò tìm Camera trên mạng...</strong>
                    </div>
                </div>
            `;
        }
        
        statusBanner.innerHTML = bannerHtml;
    }
    
    // Also update the scan results table with auto-discovered cameras
    if (cameras.length > 0) {
        renderWifiDevices(cameras.map(c => ({
            ip: c.ip || c.cameraIp,
            type: c.type || c.cameraType || 'camera',
            label: c.label || `Camera ${c.type}`,
            isCamera: true,
            openPorts: c.openPorts || c.ports || [],
            defaultRtspPath: c.rtspPath || c.rtsp_path || '/stream1'
        })));
        const scanStatus = document.getElementById('scanStatusText');
        if (scanStatus) scanStatus.innerHTML = `🤖 Tự động phát hiện ${cameras.length} camera khi khởi động!`;
    }
}

// Render Discovered WiFi Devices Table
function renderWifiDevices(devices) {
    const tbody = document.getElementById('wifiDeviceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!devices || devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8;">Không phát hiện thiết bị camera nào. Hãy thử chọn chế độ "Quét mở rộng mọi kênh WiFi" và bấm quét lại.</td></tr>';
        return;
    }
    
    devices.forEach(d => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';
        
        let badgeColor = d.isCamera ? 'background:#dcfce7; color:#166534; font-weight:bold;' : 'background:#f1f5f9; color:#475569;';
        let icon = d.type === 'tapo' ? 'fa-video' : (d.isCamera ? 'fa-camera' : 'fa-network-wired');
        
        tr.innerHTML = `
            <td style="padding: 10px; font-family: monospace; font-weight: bold;">${d.ip}</td>
            <td style="padding: 10px;">
                <span class="badge" style="${badgeColor}"><i class="fa-solid ${icon}"></i> ${d.label}</span>
            </td>
            <td style="padding: 10px; font-family: monospace; color: #64748b;">${(d.openPorts || []).join(', ')}</td>
            <td style="padding: 10px; display: flex; gap: 6px; flex-wrap: wrap;">
                ${d.isCamera ? `
                    <button onclick="quickStreamCamera('${d.ip}', '${d.type}', '${d.defaultRtspPath}')" class="btn-primary" style="padding: 4px 10px; font-size: 11px; background: #0D9488;"><i class="fa-solid fa-play"></i> Xem Nhanh</button>
                    <button onclick="quickForwardAndCreateRemoteLink('${d.ip}', '${d.type}', '${d.defaultRtspPath}')" class="btn-primary" style="padding: 4px 10px; font-size: 11px; background: #2563eb;"><i class="fa-solid fa-link"></i> Mở Port & Tạo Link Ngoài</button>
                ` : ''}
                <button onclick="selectPortForwardTarget('${d.ip}')" class="btn-secondary" style="padding: 4px 10px; font-size: 11px;"><i class="fa-solid fa-door-open"></i> Mở Cổng Tùy Chọn</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function selectDiscoveredCamera(ip, type, defaultPath) {
    const ipInput = document.getElementById('camIpInput');
    const brandSelect = document.getElementById('camBrandSelect');
    const tapoHint = document.getElementById('tapoHint');
    const qualitySelect = document.getElementById('camStreamQuality');
    
    if (ipInput) ipInput.value = ip;
    if (brandSelect) {
        if (type === 'tapo') brandSelect.value = 'tapo';
        else if (type === 'icsee') brandSelect.value = 'icsee';
        else brandSelect.value = 'generic';
    }
    if (tapoHint) tapoHint.style.display = type === 'tapo' ? 'block' : 'none';
    if (qualitySelect && defaultPath) qualitySelect.value = defaultPath;
    
    ipInput?.focus();
    if (ipInput) {
        ipInput.style.border = '2px solid #0D9488';
        setTimeout(() => { ipInput.style.border = '1px solid #cbd5e1'; }, 2500);
    }
}

// 1-Click Quick Stream from Discovered Camera
function quickStreamCamera(ip, type, defaultPath) {
    selectDiscoveredCamera(ip, type, defaultPath);
    const user = document.getElementById('camUserInput').value.trim();
    const pass = document.getElementById('camPassInput').value.trim();
    
    if (type === 'tapo' && (!user || !pass)) {
        alert('Vui lòng nhập Tài khoản & Mật khẩu Camera Tapo ở ô Cấu Hình bên trên trước khi phát!');
        document.getElementById('camUserInput').focus();
        return;
    }
    
    document.getElementById('btnActivateCamStream')?.click();
}

// 1-Click Forward Port & Generate Remote Link
function quickForwardAndCreateRemoteLink(ip, type, defaultPath) {
    selectDiscoveredCamera(ip, type, defaultPath);
    
    const targetInput = document.getElementById('upnpTargetIp');
    const privPortInput = document.getElementById('upnpPrivatePort');
    const pubPortInput = document.getElementById('upnpPublicPort');
    const descInput = document.getElementById('upnpDesc');
    
    if (targetInput) targetInput.value = ip;
    if (privPortInput) privPortInput.value = '554';
    if (pubPortInput) pubPortInput.value = '10554';
    if (descInput) descInput.value = `Camera ${type.toUpperCase()} (${ip})`;
    
    updateGeneratedRtspUrl(10554, ip, defaultPath);
    
    // Trigger open port
    document.getElementById('btnOpenPort')?.click();
    
    // Scroll to remote RTSP card
    document.getElementById('remoteRtspCard')?.scrollIntoView({ behavior: 'smooth' });
}

function updateGeneratedRtspUrl(publicPort, targetIp, path) {
    const pubIpEl = document.getElementById('netPublicIp');
    let publicIp = (pubIpEl && pubIpEl.textContent.trim() !== 'Đang kiểm tra...' && pubIpEl.textContent.trim() !== 'Chưa phát hiện' && pubIpEl.textContent.trim() !== 'IP_CONG_KHAI') 
        ? pubIpEl.textContent.trim() 
        : (currentDevice && currentDevice.external_ip ? currentDevice.external_ip : '219.104.132.28');
        
    const user = document.getElementById('camUserInput')?.value.trim() || 'admin';
    const pass = document.getElementById('camPassInput')?.value.trim() || '';
    const brand = document.getElementById('camBrandSelect')?.value;
    const streamPath = path || (brand === 'icsee' ? '/cam/realmonitor?channel=1&subtype=0' : (document.getElementById('camStreamQuality')?.value || '/stream1'));
    const auth = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
    
    const port = publicPort || parseInt(document.getElementById('upnpPublicPort')?.value) || 10554;
    const fullUrl = `rtsp://${auth}${publicIp}:${port}${streamPath}`;
    const input = document.getElementById('generatedRtspUrl');
    if (input) input.value = fullUrl;
}

// Live update remote RTSP link on typing
['camUserInput', 'camPassInput', 'camStreamQuality', 'upnpPublicPort', 'camBrandSelect'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        const pubPort = parseInt(document.getElementById('upnpPublicPort')?.value) || 10554;
        const brand = document.getElementById('camBrandSelect')?.value;
        const quality = document.getElementById('camStreamQuality')?.value;
        const defaultPath = (brand === 'icsee') ? '/cam/realmonitor?channel=1&subtype=0' : quality;
        updateGeneratedRtspUrl(pubPort, null, defaultPath);
        saveLocalCameraConfig();
    });
});

function selectPortForwardTarget(ip) {
    const targetInput = document.getElementById('upnpTargetIp');
    const pubPortInput = document.getElementById('upnpPublicPort');
    if (targetInput) targetInput.value = ip;
    pubPortInput?.focus();
}

function closePortMapping(publicPort) {
    if (confirm(`Bạn có chắc chắn muốn đóng cổng ngoài ${publicPort} trên Router không?`)) {
        sendDeviceCommand('close-port', { publicPort });
    }
}

// Quick action buttons
document.getElementById('btnSnapScreen')?.addEventListener('click', () => sendDeviceCommand('snap-screen'));
document.getElementById('btnSnapWebcam')?.addEventListener('click', () => sendDeviceCommand('snap-webcam'));
document.getElementById('btnGetClipboard')?.addEventListener('click', () => sendDeviceCommand('get-clipboard'));
document.getElementById('btnAlarm')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn phát còi báo động trên máy này không?')) {
        sendDeviceCommand('alarm');
    }
});
document.getElementById('btnLock')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn KHÓA MÁY từ xa không?')) {
        sendDeviceCommand('lock');
    }
});

// Network & IP Camera Buttons
document.getElementById('btnRefreshNetInfo')?.addEventListener('click', () => {
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    sendDeviceCommand('get-network-info');
});

document.getElementById('btnForceRescan')?.addEventListener('click', () => {
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    const banner = document.getElementById('autoNetworkBanner');
    if (banner) {
        banner.innerHTML = `
            <div style="background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-spinner fa-spin" style="color: #0284c7;"></i>
                    <strong style="color: #0369a1; font-size: 14px;">Đang quét lại toàn bộ mạng, tìm Camera, cấu hình go2rtc, mở cổng Router...</strong>
                    <span style="font-size: 12px; color: #0ea5e9;">(Quá trình này mất khoảng 15-30 giây)</span>
                </div>
            </div>
        `;
    }
    sendDeviceCommand('force-rescan-network');
});

document.getElementById('btnScanWifi')?.addEventListener('click', () => {
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    const mode = document.getElementById('scanSubnetMode')?.value || 'current';
    const targetSubnets = mode === 'all' ? ['192.168.0', '192.168.1', '192.168.2', '192.168.88', '10.0.0'] : null;
    
    const scanStatus = document.getElementById('scanStatusText');
    const tbody = document.getElementById('wifiDeviceTableBody');
    if (scanStatus) {
        scanStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang quét ${mode === 'all' ? 'tất cả dải mạng WiFi (192.168.0.x, 1.x, 2.x...)' : 'dải mạng WiFi máy khách'} (khoảng 5-10s)...`;
    }
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #0D9488;"><i class="fa-solid fa-spinner fa-spin"></i> Đang gửi gói tin thăm dò các thiết bị và camera IP...</td></tr>';
    }
    sendDeviceCommand('scan-wifi-devices', { targetSubnets });
});

document.getElementById('camBrandSelect')?.addEventListener('change', (e) => {
    const brand = e.target.value;
    const portInput = document.getElementById('camPortInput');
    const qualitySelect = document.getElementById('camStreamQuality');
    const tapoHint = document.getElementById('tapoHint');
    
    if (brand === 'tapo') {
        if (portInput) portInput.value = 554;
        if (qualitySelect) qualitySelect.value = '/stream1';
        if (tapoHint) tapoHint.style.display = 'block';
    } else if (brand === 'icsee') {
        if (portInput) portInput.value = 554;
        if (tapoHint) tapoHint.style.display = 'none';
    } else {
        if (tapoHint) tapoHint.style.display = 'none';
    }
});

document.getElementById('btnActivateCamStream')?.addEventListener('click', () => {
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    
    const brand = document.getElementById('camBrandSelect').value;
    const ip = document.getElementById('camIpInput').value.trim();
    const port = document.getElementById('camPortInput').value.trim() || '554';
    const user = document.getElementById('camUserInput').value.trim();
    const pass = document.getElementById('camPassInput').value.trim();
    const quality = document.getElementById('camStreamQuality').value;
    const statusEl = document.getElementById('camStreamStatus');
    
    if (!ip) {
        alert('Vui lòng nhập địa chỉ IP của Camera (hoặc bấm nút "Quét Thiết Bị" ở trên để chọn camera)!');
        return;
    }
    
    let rtspUrl = '';
    const auth = (user && pass) ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
    
    if (brand === 'tapo') {
        rtspUrl = `rtsp://${auth}${ip}:${port}${quality}`;
    } else if (brand === 'icsee') {
        rtspUrl = `rtsp://${auth}${ip}:${port}/cam/realmonitor?channel=1&subtype=0`;
    } else {
        rtspUrl = `rtsp://${auth}${ip}:${port}${quality}`;
    }
    
    if (statusEl) statusEl.textContent = `Đang nạp luồng camera: ${rtspUrl}...`;
    
    updateGeneratedRtspUrl(10554, ip, quality);
    saveLocalCameraConfig();
    
    openStreamChannel(currentDevice.device_id, 'ipcam', `${currentDevice.hostname || currentDevice.device_id} (Camera)`, rtspUrl);
});

document.getElementById('btnOpenPort')?.addEventListener('click', () => {
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    const targetIp = document.getElementById('upnpTargetIp').value.trim();
    const privatePort = parseInt(document.getElementById('upnpPrivatePort').value);
    const publicPort = parseInt(document.getElementById('upnpPublicPort').value);
    const desc = document.getElementById('upnpDesc').value.trim();
    
    if (!targetIp || isNaN(publicPort) || isNaN(privatePort)) {
        alert('Vui lòng nhập đầy đủ Target IP, Cổng trong và Cổng ngoài!');
        return;
    }
    
    updateGeneratedRtspUrl(publicPort, targetIp);
    saveLocalCameraConfig();
    
    sendDeviceCommand('open-port', {
        targetIp,
        privatePort,
        publicPort,
        protocol: 'TCP',
        description: desc || `Forward ${publicPort}->${targetIp}:${privatePort}`
    });
});

// Copy Remote RTSP URL
document.getElementById('btnCopyRtspUrl')?.addEventListener('click', () => {
    const input = document.getElementById('generatedRtspUrl');
    if (!input || !input.value) {
        alert('Chưa có link RTSP nào được tạo!');
        return;
    }
    navigator.clipboard.writeText(input.value);
    alert('✅ Đã sao chép link RTSP vào bộ nhớ tạm!\nBạn có thể dán vào VLC Media Player hoặc App xem camera.');
});

// Test Remote RTSP on Dashboard
document.getElementById('btnTestRemoteRtsp')?.addEventListener('click', () => {
    const input = document.getElementById('generatedRtspUrl');
    if (!input || !input.value) {
        alert('Chưa có link RTSP!');
        return;
    }
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    
    openStreamChannel(currentDevice.device_id, 'custom', `Camera RTSP (${currentDevice.device_id})`, input.value);
});

// Direct Custom RTSP Player in #view-stream
document.getElementById('btnPlayCustomRtsp')?.addEventListener('click', () => {
    const input = document.getElementById('customRtspPlayerInput');
    const url = input?.value.trim();
    if (!url) {
        alert('Vui lòng nhập đường link RTSP!');
        return;
    }
    
    const statusEl = document.getElementById('streamStatus');
    if (statusEl) {
        statusEl.textContent = `Đang nạp link tùy chỉnh: ${url}...`;
        statusEl.classList.remove('hidden');
    }
    
    sendDeviceCommand('setup-camera-stream', {
        rtspUrl: url,
        streamName: 'camera'
    });
});

// --- NAVIGATION ---
el.navItems.forEach(item => {
    item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        switchView(view);
    });
});

if (el.typeFilter) el.typeFilter.addEventListener('change', renderCaptures);

document.getElementById('streamWebcamBtn')?.addEventListener('click', () => {
    startWebcamStream();
});

// --- VMS MULTI-CHANNEL SECURITY MATRIX ---
const matrixChannels = new Map();

function updateLiveStreamBadge() {
    const badge = document.getElementById('countLiveStreams');
    if (badge) {
        badge.textContent = `${matrixChannels.size} Live`;
        if (matrixChannels.size > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    renderDevices();
}

function setMatrixGrid(cols) {
    const grid = document.getElementById('streamMatrixGrid');
    if (!grid) return;
    
    ['btnGrid1', 'btnGrid2', 'btnGrid3', 'btnGridAuto'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.background = '#ffffff';
            btn.style.color = '#333333';
            btn.style.fontWeight = 'normal';
        }
    });
    
    if (cols === 1) {
        grid.style.gridTemplateColumns = '1fr';
        const b = document.getElementById('btnGrid1');
        if (b) { b.style.background = '#e0f2fe'; b.style.color = '#0369a1'; b.style.fontWeight = 'bold'; }
    } else if (cols === 2) {
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        const b = document.getElementById('btnGrid2');
        if (b) { b.style.background = '#e0f2fe'; b.style.color = '#0369a1'; b.style.fontWeight = 'bold'; }
    } else if (cols === 3) {
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        const b = document.getElementById('btnGrid3');
        if (b) { b.style.background = '#e0f2fe'; b.style.color = '#0369a1'; b.style.fontWeight = 'bold'; }
    } else {
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(420px, 1fr))';
        const b = document.getElementById('btnGridAuto');
        if (b) { b.style.background = '#e0f2fe'; b.style.color = '#0369a1'; b.style.fontWeight = 'bold'; }
    }
}

document.getElementById('btnGrid1')?.addEventListener('click', () => setMatrixGrid(1));
document.getElementById('btnGrid2')?.addEventListener('click', () => setMatrixGrid(2));
document.getElementById('btnGrid3')?.addEventListener('click', () => setMatrixGrid(3));
document.getElementById('btnGridAuto')?.addEventListener('click', () => setMatrixGrid('auto'));

// Fullscreen Matrix
document.getElementById('btnFullscreenMatrix')?.addEventListener('click', () => {
    const grid = document.getElementById('streamMatrixGrid');
    if (!grid) return;
    if (grid.requestFullscreen) grid.requestFullscreen();
    else if (grid.webkitRequestFullscreen) grid.webkitRequestFullscreen();
});

// Modal Add Stream Event Listeners
document.getElementById('btnOpenAddStreamModal')?.addEventListener('click', openAddStreamModal);
document.getElementById('btnPlaceholderAddStream')?.addEventListener('click', openAddStreamModal);
document.getElementById('btnCloseAddStreamModal')?.addEventListener('click', () => document.getElementById('modalAddStream')?.classList.add('hidden'));
document.getElementById('btnCancelAddStream')?.addEventListener('click', () => document.getElementById('modalAddStream')?.classList.add('hidden'));

function openAddStreamModal() {
    const modal = document.getElementById('modalAddStream');
    const select = document.getElementById('modalSelectDevice');
    if (!modal || !select) return;
    
    select.innerHTML = '';
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.device_id;
        opt.textContent = `${d.device_id} (${d.hostname || 'Device'})`;
        if (currentDevice && currentDevice.device_id === d.device_id) opt.selected = true;
        select.appendChild(opt);
    });
    
    modal.classList.remove('hidden');
}

document.getElementById('btnConfirmAddStream')?.addEventListener('click', () => {
    const selectDev = document.getElementById('modalSelectDevice');
    const selectType = document.getElementById('modalSelectStreamType');
    const deviceId = selectDev ? selectDev.value : (currentDevice ? currentDevice.device_id : null);
    const streamType = selectType ? selectType.value : 'webcam';
    
    document.getElementById('modalAddStream')?.classList.add('hidden');
    
    if (!deviceId) {
        alert('Vui lòng chọn thiết bị máy khách!');
        return;
    }
    
    const dev = devices.find(d => d.device_id === deviceId);
    openStreamChannel(deviceId, streamType, dev ? dev.hostname : deviceId);
});

// Open Stream Channel in Matrix
async function openStreamChannel(deviceId, type, label = '', customUrl = null) {
    switchView('stream');
    
    const channelKey = `${deviceId}_${type}`;
    if (matrixChannels.has(channelKey)) {
        const existingCard = document.getElementById(`card_${channelKey}`);
        if (existingCard) {
            existingCard.style.outline = '3px solid #0D9488';
            setTimeout(() => { existingCard.style.outline = 'none'; }, 2000);
            existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }
    
    const grid = document.getElementById('streamMatrixGrid');
    const placeholder = document.getElementById('emptyMatrixPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    
    let typeName = 'Webcam';
    let icon = 'fa-camera';
    if (type === 'screen') { typeName = 'Màn Hình'; icon = 'fa-desktop'; }
    else if (type === 'ipcam') { typeName = 'Camera IP'; icon = 'fa-video'; }
    else if (type === 'custom') { typeName = 'RTSP Tùy Chọn'; icon = 'fa-play'; }
    
    const card = document.createElement('div');
    card.id = `card_${channelKey}`;
    card.className = 'stream-matrix-card';
    
    // Check saved quality preference
    const savedCam = JSON.parse(localStorage.getItem('sm_camera_' + deviceId) || '{}');
    const currentQuality = localStorage.getItem('sm_default_stream_quality') || savedCam.quality || '/stream1';
    const isQualitySelectable = (type === 'ipcam' || type === 'custom');
    
    card.innerHTML = `
        <div class="stream-card-header">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;">
                <span class="live-pulse-dot"></span>
                <strong style="white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 13px;"><i class="fa-solid ${icon}"></i> ${escapeHTML(label || deviceId)}</strong>
                <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; padding:2px 6px;">${typeName}</span>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
                ${isQualitySelectable ? `
                <select id="qual_${channelKey}" class="stream-quality-select" onchange="switchChannelQuality('${channelKey}', this.value)" title="Chuyển chất lượng luồng camera">
                    <option value="/stream1" ${currentQuality === '/stream1' ? 'selected' : ''}>🟢 Luồng 1 (Full HD / 2K)</option>
                    <option value="/stream2" ${currentQuality === '/stream2' ? 'selected' : ''}>🟡 Luồng 2 (360p Tiết Kiệm)</option>
                </select>
                ` : ''}
                <button onclick="fullscreenCard('${channelKey}')" class="icon-btn" style="color: #cbd5e1; font-size: 13px;" title="Toàn màn hình"><i class="fa-solid fa-expand"></i></button>
                <button onclick="closeStreamChannel('${channelKey}')" class="icon-btn" style="color: #f87171; font-size: 15px;" title="Đóng luồng này"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="stream-card-video-wrapper">
            <video id="video_${channelKey}" autoplay playsinline controls></video>
            
            <!-- Snapshot Flash Animation -->
            <div id="flash_${channelKey}" class="snapshot-flash"></div>

            <!-- Prominent Recording Indicator Overlay -->
            <div id="rec_overlay_${channelKey}" class="rec-overlay-badge hidden">
                <span class="rec-dot"></span>
                <span>REC <span id="rec_time_${channelKey}">00:00</span></span>
            </div>

            <!-- Live Stream Stats Overlay -->
            <div id="stats_${channelKey}" class="stream-stats-badge hidden">
                <i class="fa-solid fa-gauge-high"></i> <span id="res_${channelKey}">Đang tải...</span>
            </div>

            <div id="status_${channelKey}" class="stream-overlay" style="position: absolute; color: #fff; background: rgba(0,0,0,0.75); padding: 8px 16px; border-radius: 6px; font-size: 13px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối ${typeName}...
            </div>
        </div>
        <div class="stream-card-toolbar">
            <button id="snap_${channelKey}" onclick="snapStreamChannel('${channelKey}')" class="btn-primary" style="padding: 4px 12px; font-size: 11px; background: #0D9488;"><i class="fa-solid fa-camera"></i> Chụp Ảnh</button>
            <button id="rec_${channelKey}" onclick="toggleRecordStreamChannel('${channelKey}')" class="btn-secondary" style="padding: 4px 12px; font-size: 11px; color: #dc2626; border-color: #fca5a5;"><i class="fa-solid fa-circle-dot"></i> Ghi Hình</button>
            <span id="timer_${channelKey}" class="badge bg-red hidden" style="font-size: 11px; font-weight: bold;"><i class="fa-solid fa-circle fa-beat" style="margin-right:3px;"></i> 00:00</span>
            <button id="mute_${channelKey}" onclick="toggleMuteCard('${channelKey}')" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-left: auto;"><i class="fa-solid fa-volume-high"></i></button>
            <button onclick="closeStreamChannel('${channelKey}')" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #dc2626;"><i class="fa-solid fa-stop"></i> Dừng</button>
        </div>
    `;
    
    grid.appendChild(card);
    
    const channelObj = {
        key: channelKey,
        deviceId,
        type,
        label: label || deviceId,
        customUrl,
        currentQuality,
        mediaCall: null,
        peerConnection: null,
        stream: null,
        recorder: null,
        recordedChunks: [],
        recordTimer: null,
        recordSeconds: 0,
        statsInterval: null,
        cardEl: card
    };
    
    matrixChannels.set(channelKey, channelObj);
    updateLiveStreamBadge();
    
    const videoEl = document.getElementById(`video_${channelKey}`);
    const statusOverlay = document.getElementById(`status_${channelKey}`);
    
    // Attach video metadata listeners to show live resolution
    const onVideoReady = () => {
        if (videoEl && videoEl.videoWidth > 0) {
            const w = videoEl.videoWidth;
            const h = videoEl.videoHeight;
            let labelQuality = `${w}×${h}`;
            if (w >= 2000) labelQuality += ' (2K QHD)';
            else if (w >= 1900) labelQuality += ' (Full HD 1080p)';
            else if (w >= 1200) labelQuality += ' (HD 720p)';
            else if (w <= 640) labelQuality += ' (SD 360p)';
            
            const statsEl = document.getElementById(`stats_${channelKey}`);
            const resEl = document.getElementById(`res_${channelKey}`);
            if (resEl) resEl.textContent = labelQuality;
            if (statsEl) statsEl.classList.remove('hidden');
        }
    };
    videoEl.addEventListener('loadedmetadata', onVideoReady);
    videoEl.addEventListener('playing', onVideoReady);
    
    // Connect stream based on type
    const peer = getManagerPeer();
    if (!peer) {
        if (statusOverlay) statusOverlay.textContent = 'Lỗi: PeerJS chưa sẵn sàng';
        return;
    }
    
    if (type === 'webcam' || type === 'screen') {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const dummyStream = canvas.captureStream(1);
            
            const call = peer.call(deviceId, dummyStream, {
                metadata: { type: type === 'screen' ? 'screen' : 'webcam' }
            });
            channelObj.mediaCall = call;
            
            call.on('stream', (remoteStream) => {
                console.log(`Received stream for ${channelKey}`);
                channelObj.stream = remoteStream;
                if (videoEl) videoEl.srcObject = remoteStream;
                if (statusOverlay) statusOverlay.style.display = 'none';
                setTimeout(onVideoReady, 500);
            });
            
            call.on('close', () => {
                if (statusOverlay) {
                    statusOverlay.style.display = 'block';
                    statusOverlay.textContent = 'Luồng đã kết thúc';
                }
            });
            
            call.on('error', (err) => {
                console.error(`Call error on ${channelKey}:`, err);
                if (statusOverlay) {
                    statusOverlay.style.display = 'block';
                    statusOverlay.textContent = 'Lỗi kết nối máy khách';
                }
            });
        } catch(e) {
            console.error(`Stream init error:`, e);
            if (statusOverlay) statusOverlay.textContent = 'Lỗi khởi tạo';
        }
    } else if (type === 'ipcam' || type === 'custom') {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            });
            channelObj.peerConnection = pc;
            
            // Request high-quality video with H264 preferred (hardware decode)
            const videoTransceiver = pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });
            
            // Set high bitrate for better quality
            try {
                const params = videoTransceiver.receiver?.getParameters?.() || {};
                // Prefer H264 codec for hardware decode performance
                const codecs = RTCRtpReceiver.getCapabilities?.('video')?.codecs || [];
                const h264Codecs = codecs.filter(c => c.mimeType.toLowerCase().includes('h264'));
                const otherCodecs = codecs.filter(c => !c.mimeType.toLowerCase().includes('h264'));
                if (h264Codecs.length > 0) {
                    try { videoTransceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]); } catch(e) {}
                }
            } catch(e) { /* codec preference not supported */ }
            
            pc.ontrack = (event) => {
                console.log(`Received IP camera WebRTC track for ${channelKey}`);
                channelObj.stream = event.streams[0];
                if (videoEl) videoEl.srcObject = event.streams[0];
                if (statusOverlay) statusOverlay.style.display = 'none';
                setTimeout(onVideoReady, 500);
            };
            
            const offer = await pc.createOffer();
            
            // Modify SDP to request higher video bitrate (4Mbps for Full HD)
            let sdp = offer.sdp;
            sdp = sdp.replace(/(m=video.*\r\n)/, '$1b=AS:4000\r\n');
            offer.sdp = sdp;
            
            await pc.setLocalDescription(offer);
            
            await new Promise(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else {
                    const checkState = () => {
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', checkState);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', checkState);
                    setTimeout(resolve, 1500);
                }
            });
            
            const conn = peer.connect(deviceId);
            conn.on('open', () => {
                let localRtsp = customUrl;
                if (!localRtsp) {
                    const saved = JSON.parse(localStorage.getItem('sm_camera_' + deviceId) || '{}');
                    const ip = saved.ip || '192.168.1.6';
                    const user = saved.user || 'toanysd';
                    let pass = saved.pass || document.getElementById('camPassInput')?.value || '';
                    const brand = saved.brand || 'tapo';
                    // Use settings quality, then saved quality, then default
                    const quality = channelObj.currentQuality || localStorage.getItem('sm_default_stream_quality') || saved.quality || '/stream1';
                    
                    if (!pass && brand === 'tapo') {
                        const entered = prompt('Nhập mật khẩu Camera Tapo (mật khẩu đặt trong App Tapo -> Cài đặt nâng cao -> Tài khoản Camera):', '');
                        if (entered) {
                            pass = entered;
                            saved.pass = entered;
                            localStorage.setItem('sm_camera_' + deviceId, JSON.stringify(saved));
                            const passInput = document.getElementById('camPassInput');
                            if (passInput) passInput.value = entered;
                        }
                    }
                    
                    const auth = (user && pass) ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
                    localRtsp = (brand === 'icsee') 
                        ? `rtsp://${auth}${ip}:554/cam/realmonitor?channel=1&subtype=0` 
                        : `rtsp://${auth}${ip}:554${quality}`;
                }
                
                // First ensure go2rtc on client is pointing to the local camera RTSP URL
                conn.send({
                    cmd: 'setup-camera-stream',
                    rtspUrl: localRtsp,
                    streamName: 'camera'
                });
                
                setTimeout(() => {
                    conn.send({
                        cmd: 'webrtc-exchange',
                        src: 'camera',
                        offer: pc.localDescription.sdp
                    });
                }, 400);
            });
            
            conn.on('data', async (resp) => {
                if (resp.cmd === 'webrtc-exchange-answer') {
                    if (resp.success && resp.answer) {
                        await pc.setRemoteDescription(new RTCSessionDescription({
                            type: 'answer',
                            sdp: resp.answer
                        }));
                    } else {
                        if (statusOverlay) {
                            statusOverlay.style.display = 'block';
                            statusOverlay.textContent = `Lỗi Camera: ${resp.error || 'Camera có thể đang tắt'}`;
                        }
                    }
                }
            });
            
            conn.on('error', (err) => {
                if (statusOverlay) {
                    statusOverlay.style.display = 'block';
                    statusOverlay.textContent = 'Lỗi kết nối P2P tới máy khách';
                }
            });
            
        } catch(e) {
            console.error(`IP Camera WebRTC error:`, e);
            if (statusOverlay) statusOverlay.textContent = `Lỗi WebRTC: ${e.message}`;
        }
    }
}

// Switch Quality On The Fly (Stream 1 Full HD vs Stream 2 SD)
async function switchChannelQuality(channelKey, newQuality) {
    const ch = matrixChannels.get(channelKey);
    if (!ch) return;
    
    ch.currentQuality = newQuality;
    const statusOverlay = document.getElementById(`status_${channelKey}`);
    if (statusOverlay) {
        statusOverlay.style.display = 'block';
        statusOverlay.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chuyển sang luồng ${newQuality === '/stream1' ? 'Full HD (Luồng 1)' : '360p (Luồng 2)'}...`;
    }
    
    // Save preference
    try {
        const saved = JSON.parse(localStorage.getItem('sm_camera_' + ch.deviceId) || '{}');
        saved.quality = newQuality;
        localStorage.setItem('sm_camera_' + ch.deviceId, JSON.stringify(saved));
    } catch(e) {}
    
    // Reconnect stream
    if (ch.peerConnection) {
        try { ch.peerConnection.close(); } catch(e) {}
    }
    
    // Trigger reconnection
    setTimeout(() => {
        matrixChannels.delete(channelKey);
        const card = document.getElementById(`card_${channelKey}`);
        if (card && card.parentNode) card.parentNode.removeChild(card);
        openStreamChannel(ch.deviceId, ch.type, ch.label, ch.customUrl);
    }, 300);
}

// Close Stream Channel
function closeStreamChannel(channelKey) {
    const ch = matrixChannels.get(channelKey);
    if (!ch) return;
    
    if (ch.recorder && ch.recorder.state === 'recording') {
        try { ch.recorder.stop(); } catch(e) {}
    }
    if (ch.recordTimer) {
        clearInterval(ch.recordTimer);
    }
    if (ch.statsInterval) {
        clearInterval(ch.statsInterval);
    }
    if (ch.mediaCall) {
        try { ch.mediaCall.close(); } catch(e) {}
    }
    if (ch.peerConnection) {
        try { ch.peerConnection.close(); } catch(e) {}
    }
    if (ch.stream) {
        try { ch.stream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    
    if (ch.cardEl && ch.cardEl.parentNode) {
        ch.cardEl.parentNode.removeChild(ch.cardEl);
    }
    
    matrixChannels.delete(channelKey);
    updateLiveStreamBadge();
    
    if (matrixChannels.size === 0) {
        const placeholder = document.getElementById('emptyMatrixPlaceholder');
        if (placeholder) placeholder.style.display = 'block';
    }
}

// Fullscreen specific card
function fullscreenCard(channelKey) {
    const card = document.getElementById(`card_${channelKey}`);
    if (!card) return;
    if (card.requestFullscreen) card.requestFullscreen();
    else if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
}

// Mute / Unmute video on specific card
function toggleMuteCard(channelKey) {
    const video = document.getElementById(`video_${channelKey}`);
    const btn = document.getElementById(`mute_${channelKey}`);
    if (!video || !btn) return;
    
    video.muted = !video.muted;
    btn.innerHTML = video.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    btn.style.color = video.muted ? '#dc2626' : '';
}

// Snapshot on specific channel — FIXED with Flash effect & Full Resolution Local Save + Cloud Sync
async function snapStreamChannel(channelKey) {
    const ch = matrixChannels.get(channelKey);
    const video = document.getElementById(`video_${channelKey}`);
    const flash = document.getElementById(`flash_${channelKey}`);
    
    if (!ch || !video || !video.srcObject) {
        alert('Chưa có hình ảnh video để chụp!');
        return;
    }
    
    // Trigger visual camera shutter flash effect
    if (flash) {
        flash.style.opacity = '0.9';
        setTimeout(() => { flash.style.opacity = '0'; }, 250);
    }
    
    try {
        const width = video.videoWidth || 1920;
        const height = video.videoHeight || 1080;
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_');
        const filename = `Snap_${ch.type.toUpperCase()}_${ch.deviceId}_${timestamp}.jpg`;
        
        // Save file locally (File System Access API or direct download)
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            
            const savedDir = localStorage.getItem('sm_recording_save_dir');
            let saved = false;
            
            if (window.showSaveFilePicker && savedDir !== '__download__') {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        startIn: 'pictures',
                        types: [{
                            description: 'Hình ảnh JPEG',
                            accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    saved = true;
                    alert(`📸 Đã lưu ảnh chụp (${width}×${height}): ${handle.name}`);
                } catch(e) {
                    if (e.name !== 'AbortError') console.log('File picker error:', e);
                }
            }
            
            // Fallback: auto download
            if (!saved) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert(`📸 Đã tải về ảnh chụp (${width}×${height}) từ kênh [${ch.label}]!`);
            }
        }, 'image/jpeg', 0.95);
        
        // Also upload small compressed thumbnail to Supabase for gallery history
        try {
            const thumbCanvas = document.createElement('canvas');
            const scale = Math.min(1, 400 / width);
            thumbCanvas.width = Math.round(width * scale);
            thumbCanvas.height = Math.round(height * scale);
            thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);
            
            fetch(`${SUPABASE_URL}/rest/v1/sm_captures`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    device_id: ch.deviceId,
                    type: (ch.type === 'ipcam' || ch.type === 'custom') ? 'camera' : (ch.type === 'screen' ? 'screenshot' : 'webcam'),
                    storage_path: `${ch.deviceId}/snap_${ch.type}_${Date.now()}.jpg`,
                    thumbnail: thumbDataUrl,
                    metadata: { resolution: `${width}x${height}`, source: `matrix_${ch.type}` }
                })
            }).then(() => fetchCaptures()).catch(err => console.log('Supabase thumb sync note:', err));
        } catch(e) {}
        
    } catch(e) {
        console.error('Snapshot error:', e);
        alert('Lỗi chụp ảnh: ' + e.message);
    }
}

// Record clip on specific channel — with prominent visual recording badge
function toggleRecordStreamChannel(channelKey) {
    const ch = matrixChannels.get(channelKey);
    const video = document.getElementById(`video_${channelKey}`);
    const btn = document.getElementById(`rec_${channelKey}`);
    const badge = document.getElementById(`timer_${channelKey}`);
    const recOverlay = document.getElementById(`rec_overlay_${channelKey}`);
    const recTime = document.getElementById(`rec_time_${channelKey}`);
    
    if (!ch || !video || !video.srcObject) {
        alert('Chưa có luồng video để ghi hình!');
        return;
    }
    
    if (ch.recorder && ch.recorder.state === 'recording') {
        // Stop recording
        ch.recorder.stop();
        if (ch.recordTimer) { clearInterval(ch.recordTimer); ch.recordTimer = null; }
        if (badge) badge.classList.add('hidden');
        if (recOverlay) recOverlay.classList.add('hidden');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Ghi Hình';
            btn.style.background = '';
            btn.style.color = '#dc2626';
        }
        return;
    }
    
    try {
        ch.recordedChunks = [];
        const stream = video.srcObject;
        
        let mimeType = 'video/webm; codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm; codecs=vp8,opus';
        }
        
        ch.recorder = new MediaRecorder(stream, { 
            mimeType,
            videoBitsPerSecond: 4000000 
        });
        
        ch.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) ch.recordedChunks.push(e.data);
        };
        
        ch.recorder.onstop = async () => {
            const blob = new Blob(ch.recordedChunks, { type: 'video/webm' });
            const filename = `Record_${ch.type}_${ch.deviceId}_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '_')}.webm`;
            
            const savedDir = localStorage.getItem('sm_recording_save_dir');
            let saved = false;
            
            if (window.showSaveFilePicker && savedDir !== '__download__') {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        startIn: 'videos',
                        types: [{ description: 'Video WebM', accept: { 'video/webm': ['.webm'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    saved = true;
                    alert(`🎬 Đã lưu video ghi hình: ${handle.name}`);
                } catch(e) {
                    if (e.name !== 'AbortError') console.log('File save dialog error:', e);
                }
            }
            
            if (!saved) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert(`🎬 Đã tải về video ghi hình: ${filename}`);
            }
        };
        
        ch.recorder.start(1000);
        ch.recordSeconds = 0;
        
        // Show prominent on-screen recording overlay badge
        if (recOverlay) {
            recOverlay.classList.remove('hidden');
            if (recTime) recTime.textContent = '00:00';
        }
        if (badge) {
            badge.classList.remove('hidden');
            badge.innerHTML = '<i class="fa-solid fa-circle fa-beat" style="margin-right: 3px;"></i> 00:00';
        }
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-square"></i> Dừng Ghi';
            btn.style.background = '#dc2626';
            btn.style.color = '#ffffff';
        }
        
        ch.recordTimer = setInterval(() => {
            ch.recordSeconds++;
            const mins = String(Math.floor(ch.recordSeconds / 60)).padStart(2, '0');
            const secs = String(ch.recordSeconds % 60).padStart(2, '0');
            if (badge) badge.innerHTML = `<i class="fa-solid fa-circle fa-beat" style="margin-right: 3px;"></i> ${mins}:${secs}`;
        }, 1000);
        
    } catch(e) {
        console.error('Recording error on channel:', e);
        alert('Lỗi ghi hình: ' + e.message);
    }
}

// Snap all active matrix streams
document.getElementById('btnSnapAllStreams')?.addEventListener('click', async () => {
    if (matrixChannels.size === 0) {
        alert('Chưa có luồng nào đang mở để chụp!');
        return;
    }
    let count = 0;
    for (const [key] of matrixChannels) {
        await snapStreamChannel(key);
        count++;
    }
    alert(`📸 Đã hoàn thành chụp đồng loạt ${count} luồng video!`);
});

// Stop all active matrix streams
document.getElementById('btnStopAllMatrixStreams')?.addEventListener('click', () => {
    if (matrixChannels.size === 0) return;
    if (confirm('Bạn có chắc chắn muốn dừng toàn bộ các luồng giám sát đang mở không?')) {
        const keys = Array.from(matrixChannels.keys());
        keys.forEach(k => closeStreamChannel(k));
    }
});

// Sidebar & Direct buttons
document.getElementById('btnSidebarOpenMatrix')?.addEventListener('click', () => {
    switchView('stream');
});

document.getElementById('btnPlayCustomRtsp')?.addEventListener('click', () => {
    const input = document.getElementById('customRtspPlayerInput');
    const url = input?.value.trim();
    if (!url) {
        alert('Vui lòng nhập đường link RTSP!');
        return;
    }
    if (!currentDevice) {
        alert('Vui lòng chọn thiết bị máy khách trước!');
        return;
    }
    
    sendDeviceCommand('setup-camera-stream', {
        rtspUrl: url,
        streamName: 'custom_cam'
    });
    
    setTimeout(() => {
        openStreamChannel(currentDevice.device_id, 'custom', `Camera RTSP (${currentDevice.device_id})`);
    }, 1000);
});

function requestNetworkInfo() {
    if (!currentDevice) return;
    const localIpEl = document.getElementById('netLocalIp');
    const pubIpEl = document.getElementById('netPublicIp');
    if (localIpEl) localIpEl.textContent = 'Đang lấy...';
    if (pubIpEl) pubIpEl.textContent = 'Đang kiểm tra...';
    sendDeviceCommand('get-network-info');
    
    // Also request auto-network status
    sendDeviceCommand('get-auto-network-status');
    
    // Load cached auto-network data from Supabase (for instant display)
    if (currentDevice.auto_network) {
        renderAutoNetworkStatus(currentDevice.auto_network);
    }
}

function switchView(viewName) {
    el.navItems.forEach(i => i.classList.remove('active'));
    
    const targetNav = document.querySelector(`.nav-list li[data-view="${viewName}"]`);
    if(targetNav) targetNav.classList.add('active');
    
    el.views.forEach(v => v.classList.add('hidden'));
    
    const targetSection = document.getElementById(`view-${['screens', 'camera', 'clipboard'].includes(viewName) ? 'dashboard' : viewName}`);
    if (targetSection) targetSection.classList.remove('hidden');
    
    if (['screens', 'camera', 'clipboard', 'dashboard'].includes(viewName)) {
        if (el.typeFilter) {
            if (viewName === 'screens') el.typeFilter.value = 'screenshot';
            else if (viewName === 'camera') el.typeFilter.value = 'webcam';
            else if (viewName === 'clipboard') el.typeFilter.value = 'clipboard';
            else el.typeFilter.value = 'all';
        }
        renderCaptures();
    }
    
    if (viewName === 'network') {
        requestNetworkInfo();
    }
    
    if (viewName === 'settings') {
        if (currentDevice) populateSettingsForm(currentDevice);
    }
}

// --- SETTINGS ---
el.saveSettingsBtn.addEventListener('click', async () => {
    if (!currentDevice) return;
    const settings = {
        screen_capture_on: document.getElementById('set-screen-toggle').checked,
        screen_interval_min: parseInt(document.getElementById('set-screen-interval').value) || 5,
        webcam_capture_on: document.getElementById('set-webcam-toggle').checked,
        webcam_interval_min: parseInt(document.getElementById('set-webcam-interval').value) || 5,
        webcam_record_on: document.getElementById('set-record-toggle').checked,
        clipboard_log_on: document.getElementById('set-clipboard-toggle').checked
    };
    await updateDeviceSettings(currentDevice.device_id, settings);
    sendDeviceCommand('sync-settings', settings);
    
    // Save dashboard-local settings
    const recordSaveMode = document.getElementById('set-recording-save-mode')?.value || 'dialog';
    localStorage.setItem('sm_recording_save_dir', recordSaveMode === 'download' ? '__download__' : '');
    
    const defaultQuality = document.getElementById('set-default-stream-quality')?.value || '/stream1';
    localStorage.setItem('sm_default_stream_quality', defaultQuality);
    
    // Also update camera config with new quality
    if (currentDevice) {
        try {
            const camConfig = JSON.parse(localStorage.getItem('sm_camera_' + currentDevice.device_id) || '{}');
            camConfig.quality = defaultQuality;
            localStorage.setItem('sm_camera_' + currentDevice.device_id, JSON.stringify(camConfig));
        } catch(e) {}
    }
    
    alert('✅ Đã lưu tất cả cấu hình!');
});

// Load dashboard-local settings on page load
(function loadDashboardSettings() {
    const savedDir = localStorage.getItem('sm_recording_save_dir');
    const saveModeSelect = document.getElementById('set-recording-save-mode');
    if (saveModeSelect) saveModeSelect.value = savedDir === '__download__' ? 'download' : 'dialog';
    
    const savedQuality = localStorage.getItem('sm_default_stream_quality');
    const qualitySelect = document.getElementById('set-default-stream-quality');
    if (qualitySelect && savedQuality) qualitySelect.value = savedQuality;
})();

// --- INIT ---
function initApp() {
    fetchDevices();
    initRealtime();
}

// Check session
if (sessionStorage.getItem('sm_token')) {
    el.loginOverlay.classList.add('hidden');
    el.appContainer.classList.remove('hidden');
    initApp();
}
