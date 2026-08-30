'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, Camera, Monitor, MapPin, RefreshCw, Plus, Trash2, Wifi, WifiOff, Image as ImageIcon, Video, VideoOff, X } from 'lucide-react';

const COLORS = {
  bg: '#0a0c10',
  surface: 'rgba(22, 27, 34, 0.6)',
  surfaceBorder: 'rgba(255, 255, 255, 0.08)',
  glassBg: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.06)',
  primary: '#58a6ff',
  success: '#2ea043',
  danger: '#f85149',
  warning: '#d29922',
  textMain: '#e6edf3',
  textMuted: '#7d8590',
};

declare const window: any;

interface DeviceInfo {
  deviceId: string;
  hostname: string;
  ip: string;
  platform: string;
  uptime: number;
  battery: number | null;
  cpus: number;
  totalMem: number;
  freeMem: number;
}

interface CaptureItem {
  id: number;
  type: string;
  timestamp: number;
  dataUrl: string;
  deviceId: string;
}

export default function MonitorPanel() {
  const [peerReady, setPeerReady] = useState(false);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [deviceStatus, setDeviceStatus] = useState<Record<string, 'online' | 'offline' | 'connecting'>>({});
  const [deviceInfo, setDeviceInfo] = useState<Record<string, DeviceInfo>>({});
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const peerRef = useRef<any>(null);
  const connsRef = useRef<Record<string, any>>({});
  const captureChunksRef = useRef<{ chunks: string[]; type: string; total: number }>({ chunks: [], type: '', total: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentCallRef = useRef<any>(null);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));

  // Load PeerJS + init + auto-fetch devices
  useEffect(() => {
    // Load saved devices (manual additions)
    try {
      const saved = localStorage.getItem('antitheft-devices');
      if (saved) setDeviceIds(JSON.parse(saved));
    } catch {}

    // Auto-fetch registered devices from heartbeat API
    fetchRegisteredDevices();
    const fetchInterval = setInterval(fetchRegisteredDevices, 10000);

    // Load PeerJS CDN
    if (document.querySelector('script[src*="peerjs"]')) {
      initPeer();
      return () => clearInterval(fetchInterval);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.onload = () => initPeer();
    document.head.appendChild(script);

    return () => {
      clearInterval(fetchInterval);
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch {}
      }
    };
  }, []);

  // Fetch devices registered via heartbeat API
  const fetchRegisteredDevices = async () => {
    try {
      const res = await fetch('/api/antitheft/heartbeat');
      if (res.ok) {
        const data = await res.json();
        if (data.devices && data.devices.length > 0) {
          const apiDevices: Record<string, DeviceInfo> = {};
          const apiIds: string[] = [];
          data.devices.forEach((d: any) => {
            apiIds.push(d.deviceId);
            apiDevices[d.deviceId] = {
              deviceId: d.deviceId,
              hostname: d.hostname || 'Unknown',
              ip: d.ip || '',
              platform: d.platform || '',
              uptime: d.uptime || 0,
              battery: d.battery,
              cpus: d.cpus || 0,
              totalMem: d.memory || 0,
              freeMem: d.freeMemory || 0,
            };
            // Mark online/offline based on heartbeat
            setDeviceStatus(prev => ({
              ...prev,
              [d.deviceId]: d.online ? 'online' : 'offline',
            }));
          });
          // Merge with manual devices
          setDeviceIds(prev => {
            const merged = [...new Set([...prev, ...apiIds])];
            return merged;
          });
          setDeviceInfo(prev => ({ ...prev, ...apiDevices }));
        }
      }
    } catch {}
  };

  const initPeer = () => {
    if (peerRef.current) return;
    try {
      const PeerClass = (window as any).Peer;
      if (!PeerClass) { addLog('PeerJS chưa load xong'); return; }

      const managerId = `ipc-manager-${Date.now().toString(36).slice(-4)}`;
      const peer = new PeerClass(managerId, {
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
      });

      peer.on('open', (id: string) => {
        addLog(`Manager online: ${id}`);
        setPeerReady(true);
      });

      peer.on('error', (err: any) => {
        addLog(`PeerJS error: ${err.type}`);
        if (err.type === 'unavailable-id') {
          setTimeout(() => { peerRef.current = null; initPeer(); }, 3000);
        }
      });

      peer.on('disconnected', () => {
        addLog('PeerJS disconnected, reconnecting...');
        try { peer.reconnect(); } catch {}
      });

      peerRef.current = peer;
    } catch (e: any) {
      addLog(`Init error: ${e.message}`);
    }
  };

  // Save devices to localStorage
  useEffect(() => {
    localStorage.setItem('antitheft-devices', JSON.stringify(deviceIds));
  }, [deviceIds]);

  // Connect to a device
  const connectDevice = useCallback((deviceId: string) => {
    if (!peerRef.current || !peerReady) { addLog('PeerJS chưa sẵn sàng'); return; }
    if (connsRef.current[deviceId]) return;

    setDeviceStatus(prev => ({ ...prev, [deviceId]: 'connecting' }));
    addLog(`Đang kết nối ${deviceId}...`);

    const conn = peerRef.current.connect(deviceId, { reliable: true });

    conn.on('open', () => {
      addLog(`✓ Đã kết nối ${deviceId}`);
      setDeviceStatus(prev => ({ ...prev, [deviceId]: 'online' }));
      connsRef.current[deviceId] = conn;
      // Get device info
      conn.send(JSON.stringify({ command: 'info' }));
    });

    conn.on('data', (raw: any) => {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      handleDeviceMessage(deviceId, data);
    });

    conn.on('close', () => {
      addLog(`${deviceId} ngắt kết nối`);
      setDeviceStatus(prev => ({ ...prev, [deviceId]: 'offline' }));
      delete connsRef.current[deviceId];
    });

    conn.on('error', (err: any) => {
      addLog(`${deviceId} lỗi: ${err}`);
      setDeviceStatus(prev => ({ ...prev, [deviceId]: 'offline' }));
      delete connsRef.current[deviceId];
    });

    // Timeout
    setTimeout(() => {
      setDeviceStatus(prev => {
        if (prev[deviceId] === 'connecting') {
          addLog(`${deviceId} không phản hồi qua PeerJS Cloud`);
          return { ...prev, [deviceId]: 'offline' };
        }
        return prev;
      });
    }, 15000);
  }, [peerReady]);

  // Auto-connect all devices
  useEffect(() => {
    if (!peerReady) return;
    deviceIds.forEach(id => {
      if (!connsRef.current[id]) connectDevice(id);
    });
    const interval = setInterval(() => {
      deviceIds.forEach(id => {
        if (!connsRef.current[id]) connectDevice(id);
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [peerReady, deviceIds, connectDevice]);

  // Handle messages from device
  const handleDeviceMessage = (deviceId: string, data: any) => {
    switch (data.type) {
      case 'info':
        setDeviceInfo(prev => ({ ...prev, [deviceId]: data.data }));
        break;

      case 'pong':
        setDeviceStatus(prev => ({ ...prev, [deviceId]: 'online' }));
        break;

      case 'capture-start':
        captureChunksRef.current = { chunks: [], type: data.captureType, total: data.totalChunks };
        addLog(`Đang nhận ảnh ${data.captureType}...`);
        break;

      case 'capture-chunk':
        captureChunksRef.current.chunks[data.index] = data.data;
        break;

      case 'capture-end': {
        const base64 = captureChunksRef.current.chunks.join('');
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        const item: CaptureItem = {
          id: Date.now(),
          type: captureChunksRef.current.type || data.captureType || 'unknown',
          timestamp: Date.now(),
          dataUrl,
          deviceId,
        };
        setCaptures(prev => [item, ...prev].slice(0, 50));
        addLog(`✓ Ảnh ${item.type} từ ${deviceId}`);
        setIsCapturing(false);
        break;
      }

      case 'webcam-ready':
        addLog(`${deviceId} webcam sẵn sàng, bắt đầu stream...`);
        startVideoCall(deviceId);
        break;

      case 'webcam-stopped':
        addLog(`${deviceId} đã dừng webcam`);
        setIsStreaming(false);
        break;

      case 'camera-list':
        addLog(`Tìm thấy ${data.data?.cameras?.length || 0} camera trên ${deviceId}`);
        break;

      case 'camera-live-ready':
        addLog(`Camera relay sẵn sàng, bắt đầu stream...`);
        startVideoCall(deviceId);
        break;

      case 'error':
        addLog(`⚠ ${deviceId}: ${data.message}`);
        setIsCapturing(false);
        break;
    }
  };

  // Video call for webcam/camera streaming
  const startVideoCall = (deviceId: string) => {
    if (!peerRef.current) return;
    // Create a silent audio track as dummy stream
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const dummyStream = canvas.captureStream(1);

    const call = peerRef.current.call(deviceId, dummyStream);
    currentCallRef.current = call;

    call.on('stream', (remoteStream: MediaStream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch(() => {});
        setIsStreaming(true);
        addLog(`▶ Đang xem video từ ${deviceId}`);
      }
    });

    call.on('close', () => {
      setIsStreaming(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    call.on('error', (e: any) => {
      addLog(`Video error: ${e}`);
      setIsStreaming(false);
    });
  };

  // Send command
  const sendCommand = (command: string, params?: any) => {
    if (!selectedDevice || !connsRef.current[selectedDevice]) {
      addLog('Chưa chọn thiết bị hoặc chưa kết nối');
      return;
    }
    connsRef.current[selectedDevice].send(JSON.stringify({ command, params }));
    addLog(`→ Gửi lệnh: ${command}`);
  };

  // Add device
  const addDevice = () => {
    const id = newDeviceId.trim();
    if (!id) return;
    if (deviceIds.includes(id)) { addLog('Device ID đã tồn tại'); return; }
    setDeviceIds(prev => [...prev, id]);
    setNewDeviceId('');
    addLog(`+ Thêm thiết bị: ${id}`);
    setTimeout(() => connectDevice(id), 500);
  };

  // Remove device
  const removeDevice = (id: string) => {
    if (connsRef.current[id]) {
      try { connsRef.current[id].close(); } catch {}
      delete connsRef.current[id];
    }
    setDeviceIds(prev => prev.filter(d => d !== id));
    if (selectedDevice === id) setSelectedDevice(null);
    addLog(`- Xóa thiết bị: ${id}`);
  };

  // Stop stream
  const stopStream = () => {
    if (currentCallRef.current) {
      currentCallRef.current.close();
      currentCallRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsStreaming(false);
    if (selectedDevice) sendCommand('stop-webcam');
  };

  const cardStyle = {
    background: COLORS.glassBg,
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '12px',
    padding: '20px',
  };

  const btnStyle = (color: string = COLORS.primary) => ({
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: color,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600 as const,
    fontSize: '13px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>
        <Eye size={28} style={{ verticalAlign: 'middle', marginRight: '10px', color: COLORS.primary }} />
        Giám sát từ xa
      </h1>

      {/* PeerJS Status */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: COLORS.textMuted }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: peerReady ? COLORS.success : COLORS.danger }} />
        {peerReady ? 'PeerJS Cloud: Đã kết nối' : 'PeerJS Cloud: Đang kết nối...'}
      </div>

      {/* Add Device */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Thêm thiết bị</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newDeviceId}
            onChange={e => setNewDeviceId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDevice()}
            placeholder="Nhập Device ID (VD: at-laptop-12345)"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px',
              border: `1px solid ${COLORS.glassBorder}`, background: 'rgba(0,0,0,0.3)',
              color: COLORS.textMain, fontSize: '14px', outline: 'none',
            }}
          />
          <button onClick={addDevice} style={btnStyle()}>
            <Plus size={16} /> Thêm
          </button>
        </div>
      </div>

      {/* Device List */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>
          Thiết bị ({deviceIds.length})
          <button onClick={() => deviceIds.forEach(id => { delete connsRef.current[id]; connectDevice(id); })}
            style={{ ...btnStyle('rgba(255,255,255,0.1)'), marginLeft: '12px', padding: '4px 10px', fontSize: '12px' }}>
            <RefreshCw size={12} /> Kết nối lại
          </button>
        </h3>

        {deviceIds.length === 0 && (
          <p style={{ color: COLORS.textMuted, margin: '20px 0', textAlign: 'center' }}>
            Chưa có thiết bị. Nhập Device ID ở trên để thêm.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deviceIds.map(id => {
            const status = deviceStatus[id] || 'offline';
            const info = deviceInfo[id];
            const isSelected = selectedDevice === id;
            return (
              <div key={id} onClick={() => setSelectedDevice(id)} style={{
                ...cardStyle, cursor: 'pointer', padding: '14px 16px',
                border: `1px solid ${isSelected ? COLORS.primary : COLORS.glassBorder}`,
                background: isSelected ? 'rgba(88,166,255,0.08)' : COLORS.glassBg,
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: status === 'online' ? COLORS.success : status === 'connecting' ? COLORS.warning : COLORS.danger,
                  boxShadow: status === 'online' ? `0 0 8px ${COLORS.success}` : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{info?.hostname || id}</div>
                  <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
                    {info ? `${info.ip} • ${info.platform}` : id}
                    {info?.battery != null && ` • 🔋${info.battery}%`}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                  background: status === 'online' ? 'rgba(46,160,67,0.2)' : status === 'connecting' ? 'rgba(210,153,34,0.2)' : 'rgba(248,81,73,0.2)',
                  color: status === 'online' ? COLORS.success : status === 'connecting' ? COLORS.warning : COLORS.danger,
                }}>
                  {status === 'online' ? 'Online' : status === 'connecting' ? '...' : 'Offline'}
                </span>
                <button onClick={(e) => { e.stopPropagation(); removeDevice(id); }}
                  style={{ background: 'none', border: 'none', color: COLORS.danger, cursor: 'pointer', padding: '4px' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live View */}
      {selectedDevice && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>
            Giám sát: {deviceInfo[selectedDevice]?.hostname || selectedDevice}
          </h3>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button onClick={() => { setIsCapturing(true); sendCommand('snap-webcam'); }}
              disabled={isCapturing || deviceStatus[selectedDevice] !== 'online'}
              style={{ ...btnStyle(), opacity: isCapturing || deviceStatus[selectedDevice] !== 'online' ? 0.5 : 1 }}>
              <Camera size={16} /> Chụp Webcam
            </button>
            <button onClick={() => { setIsCapturing(true); sendCommand('snap-screen'); }}
              disabled={isCapturing || deviceStatus[selectedDevice] !== 'online'}
              style={{ ...btnStyle('#7c3aed'), opacity: isCapturing || deviceStatus[selectedDevice] !== 'online' ? 0.5 : 1 }}>
              <Monitor size={16} /> Chụp Màn hình
            </button>
            {!isStreaming ? (
              <button onClick={() => sendCommand('start-webcam')}
                disabled={deviceStatus[selectedDevice] !== 'online'}
                style={{ ...btnStyle(COLORS.success), opacity: deviceStatus[selectedDevice] !== 'online' ? 0.5 : 1 }}>
                <Video size={16} /> Xem Webcam
              </button>
            ) : (
              <button onClick={stopStream} style={btnStyle(COLORS.danger)}>
                <VideoOff size={16} /> Dừng
              </button>
            )}
            <button onClick={() => sendCommand('scan-cameras')}
              disabled={deviceStatus[selectedDevice] !== 'online'}
              style={{ ...btnStyle('rgba(255,255,255,0.1)'), opacity: deviceStatus[selectedDevice] !== 'online' ? 0.5 : 1 }}>
              <RefreshCw size={16} /> Quét Camera
            </button>
          </div>

          {/* Video Player */}
          <div style={{
            background: '#000', borderRadius: '10px', border: `1px solid ${COLORS.glassBorder}`,
            aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden', marginBottom: '16px',
          }}>
            <video ref={videoRef} autoPlay playsInline muted style={{
              width: '100%', height: '100%', objectFit: 'contain',
              display: isStreaming ? 'block' : 'none',
            }} />
            {!isStreaming && (
              <div style={{ color: COLORS.textMuted, textAlign: 'center' }}>
                <VideoOff size={48} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>
                  {isCapturing ? 'Đang chụp ảnh...' : 'Nhấn "Xem Webcam" để bắt đầu stream'}
                </p>
              </div>
            )}
            {isStreaming && (
              <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(248,81,73,0.8)', color: '#fff',
                padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
              }}>
                ● LIVE
              </div>
            )}
          </div>

          {/* Latest Captures */}
          {captures.filter(c => c.deviceId === selectedDevice).length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px', color: COLORS.textMuted, fontSize: '13px' }}>Ảnh chụp gần đây</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {captures.filter(c => c.deviceId === selectedDevice).slice(0, 6).map(c => (
                  <div key={c.id} onClick={() => setModalImage(c.dataUrl)} style={{
                    borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                    border: `1px solid ${COLORS.glassBorder}`, transition: 'transform 0.2s',
                  }}>
                    <img src={c.dataUrl} alt={c.type} style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover' }} />
                    <div style={{ padding: '6px 10px', fontSize: '11px', color: COLORS.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{
                        background: c.type === 'webcam' ? 'rgba(88,166,255,0.2)' : 'rgba(124,58,237,0.2)',
                        color: c.type === 'webcam' ? COLORS.primary : '#7c3aed',
                        padding: '1px 6px', borderRadius: '3px',
                      }}>{c.type}</span>
                      <span>{new Date(c.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Captures Gallery */}
      {captures.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>
            <ImageIcon size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Tất cả ảnh chụp ({captures.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {captures.map(c => (
              <div key={c.id} onClick={() => setModalImage(c.dataUrl)} style={{
                borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                border: `1px solid ${COLORS.glassBorder}`,
              }}>
                <img src={c.dataUrl} alt={c.type} style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover' }} />
                <div style={{ padding: '4px 8px', fontSize: '10px', color: COLORS.textMuted }}>
                  {c.deviceId.slice(0, 15)} • {c.type} • {new Date(c.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      <div style={{ ...cardStyle, maxHeight: '200px', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', color: COLORS.textMuted }}>Log</h3>
        {logs.map((log, i) => (
          <div key={i} style={{ fontSize: '12px', color: COLORS.textMuted, padding: '2px 0', fontFamily: 'monospace' }}>{log}</div>
        ))}
        {logs.length === 0 && <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Chưa có hoạt động</div>}
      </div>

      {/* Fullscreen Modal */}
      {modalImage && (
        <div onClick={() => setModalImage(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <button onClick={() => setModalImage(null)} style={{
            position: 'absolute', top: 20, right: 20,
            background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
          }}><X size={32} /></button>
          <img src={modalImage} alt="capture" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  );
}
