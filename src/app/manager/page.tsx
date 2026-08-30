'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, LayoutDashboard, Laptop, Camera, Aperture, 
  MonitorPlay, FolderOpen, Globe, Settings, Key,
  Monitor, Image as ImageIcon, CheckCircle, XCircle,
  Plus, Maximize, Minimize, X, Download, Video,
  Play, Square, ChevronLeft, ChevronRight,
  RefreshCw, Power, Server, HardDrive, Clock,
  Wifi, WifiOff, Smartphone, Trash2, AlertTriangle,
  Lock, Volume2, Search, ArrowRight, Eye, Cast
} from 'lucide-react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lfsoronpedvwxxtjqkep.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BZd9DDiBUzbdYzehGSc6rg_ZgPsekC3';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'sm' }
});

const colors = {
  bgPage: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgSidebar: '#FFFFFF',
  bgHeader: '#FFFFFF',
  bgInput: '#F1F5F9',
  borderColor: '#E2E8F0',
  borderHover: '#CBD5E1',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryHover: '#1D4ED8',
  accent: '#16A34A',
  accentLight: '#DCFCE7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  darkBg: '#0F172A',
  shadowSm: '0 1px 3px rgba(0,0,0,0.06)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08)',
  shadowLg: '0 10px 25px rgba(0,0,0,0.1)',
  radius: '12px',
  radiusLg: '16px',
};

interface DeviceInfo {
  deviceId: string;
  hostname: string;
  platform: string;
  arch?: string;
  uptime?: number;
  memory?: number;
  freeMemory?: number;
  cpus?: number;
  lastSeen: number;
  online: boolean;
  conn?: DataConnection;
}

interface MediaItem {
  id: string;
  deviceId: string;
  type: 'webcam' | 'screen';
  dataUrl: string;
  timestamp: number;
}

const tabs = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'devices', label: 'Thiết bị Máy khách', icon: Laptop },
  { id: 'cameras', label: 'Camera IP (VMS)', icon: Camera },
  { id: 'capture', label: 'Chụp ảnh từ xa', icon: Aperture },
  { id: 'live', label: 'Xem trực tiếp Live', icon: MonitorPlay },
  { id: 'library', label: 'Thư viện Media', icon: FolderOpen },
  { id: 'network', label: 'Mạng & UPnP', icon: Globe },
  { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings },
];

export default function ManagerPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Real P2P Devices State
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [newDeviceCode, setNewDeviceCode] = useState('');
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  
  // Captures & Live Streams
  const [captures, setCaptures] = useState<MediaItem[]>([]);
  const [activeWebcamCapture, setActiveWebcamCapture] = useState<string | null>(null);
  const [activeScreenCapture, setActiveScreenCapture] = useState<string | null>(null);
  const [isCapturingWebcam, setIsCapturingWebcam] = useState(false);
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  
  // Live Streaming
  const [isLiveWebcamActive, setIsLiveWebcamActive] = useState(false);
  const [isLiveScreenActive, setIsLiveScreenActive] = useState(false);
  const [liveStreamSource, setLiveStreamSource] = useState<'webcam' | 'screen' | null>(null);
  
  // Camera IP VMS
  const [cameraGridMode, setCameraGridMode] = useState<number>(2);
  const [registeredCameras, setRegisteredCameras] = useState<Array<{ name: string; url: string; online: boolean }>>([]);
  const [newCamName, setNewCamName] = useState('');
  const [newCamUrl, setNewCamUrl] = useState('');
  const [isScanningCameras, setIsScanningCameras] = useState(false);

  // Network / UPnP
  const [upnpInfo, setUpnpInfo] = useState<{ available: boolean; externalIp: string | null; mappings: any[]; cgnat: boolean }>({
    available: false,
    externalIp: null,
    mappings: [],
    cgnat: false
  });

  // Logs & Toasts
  const [systemLogs, setSystemLogs] = useState<Array<{ msg: string; time: string; type: 'info' | 'success' | 'error' }>>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Lightbox
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);

  // Refs
  const peerRef = useRef<Peer | null>(null);
  const activeMediaCallRef = useRef<MediaConnection | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  const addLog = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setSystemLogs(prev => [{ msg, time, type }, ...prev.slice(0, 49)]);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. PIN Auth check
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const storedAuth = sessionStorage.getItem('manager-auth');
    if (storedAuth === '1621') {
      setIsAuthenticated(true);
    }
  }, []);

  // 2. Load saved media and devices from localStorage
  useEffect(() => {
    try {
      const savedMedia = localStorage.getItem('sm_media_gallery');
      if (savedMedia) setCaptures(JSON.parse(savedMedia));
    } catch (e) {}
  }, []);

  // 3. Supabase: Auto-discover devices (no manual pairing needed)
  useEffect(() => {
    if (!isAuthenticated) return;

    // Load all registered devices from Supabase on startup
    const loadDevices = async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) {
        addLog(`Supabase lỗi: ${error.message}`, 'error');
        return;
      }

      if (data && data.length > 0) {
        addLog(`Đã tải ${data.length} thiết bị từ Supabase`, 'success');
        // Save to known devices list for PeerJS auto-connect
        const ids = data.map((d: any) => d.device_id);
        localStorage.setItem('sm_known_devices', JSON.stringify(ids));

        // Update device list UI (show as offline until P2P connects)
        const devMap: Record<string, DeviceInfo> = {};
        data.forEach((d: any) => {
          const lastSeenMs = new Date(d.last_seen).getTime();
          const isOnline = (Date.now() - lastSeenMs) < 90000;
          devMap[d.device_id] = {
            deviceId: d.device_id,
            hostname: d.hostname || 'Máy khách',
            platform: d.platform || 'windows',
            arch: d.arch,
            uptime: d.uptime,
            memory: d.memory,
            freeMemory: d.free_memory,
            cpus: d.cpus,
            lastSeen: lastSeenMs,
            online: isOnline,
          };
        });
        setDevices(devMap);
        if (!selectedDeviceId && data.length > 0) {
          setSelectedDeviceId(data[0].device_id);
        }
      }
    };
    loadDevices();

    // Subscribe to realtime changes — auto-detect new devices the moment they install
    const channel = supabase
      .channel('sm-devices-watch')
      .on('postgres_changes', {
        event: '*',
        schema: 'sm',
        table: 'devices'
      }, (payload: any) => {
        const d = payload.new as any;
        if (!d || !d.device_id) return;

        const lastSeenMs = new Date(d.last_seen).getTime();
        const isOnline = (Date.now() - lastSeenMs) < 90000;

        if (payload.eventType === 'INSERT') {
          addLog(`🆕 Thiết bị mới: ${d.hostname} (${d.device_id}) vừa đăng ký!`, 'success');
          showToast(`Thiết bị mới: ${d.hostname}`);
        } else if (payload.eventType === 'UPDATE') {
          // Heartbeat update - device is online
        }

        setDevices(prev => {
          const updated = {
            ...prev,
            [d.device_id]: {
              ...(prev[d.device_id] || {}),
              deviceId: d.device_id,
              hostname: d.hostname || 'Máy khách',
              platform: d.platform || 'windows',
              arch: d.arch,
              uptime: d.uptime,
              memory: d.memory,
              freeMemory: d.free_memory,
              cpus: d.cpus,
              lastSeen: lastSeenMs,
              online: isOnline,
            }
          };
          // Keep known list updated
          localStorage.setItem('sm_known_devices', JSON.stringify(Object.keys(updated)));
          return updated;
        });

        setSelectedDeviceId(prev => prev || d.device_id);

        // Auto connect via PeerJS when new device appears
        if (peerRef.current && !peerRef.current.destroyed && d.peer_id) {
          connectToDevice(d.peer_id || d.device_id, false);
        }
      })
      .subscribe();

    // Mark devices as offline if last_seen > 90s ago — check every 30s
    const offlineCheck = setInterval(() => {
      setDevices(prev => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          const dev = next[id];
          const shouldBeOffline = !dev.conn?.open && (now - dev.lastSeen) > 90000;
          if (shouldBeOffline && dev.online) {
            next[id] = { ...dev, online: false };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(offlineCheck);
    };
  }, [isAuthenticated, addLog]);

  // 4. Initialize Manager PeerJS
  // KEY: Manager uses RANDOM Peer ID — no fixed ID conflict.
  // Manager CONNECTS TO clients (clients have fixed IDs like IPC-XXXXXX).
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('[Manager] Initializing PeerJS with random ID...');
    addLog('Đang khởi tạo hệ thống P2P...', 'info');

    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      },
      debug: 1
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('[Manager] PeerJS ready with ID:', id);
      addLog('Máy chủ quản lý sẵn sàng — đang kết nối tới các máy khách đã ghép nối...', 'success');
      
      // Auto-connect to all saved/known device IDs
      try {
        const savedList = JSON.parse(localStorage.getItem('sm_known_devices') || '[]');
        if (savedList.length > 0) {
          addLog(`Phát hiện ${savedList.length} thiết bị, đang kết nối...`, 'info');
          savedList.forEach((devId: string, i: number) => {
            setTimeout(() => connectToDevice(devId, false), i * 500);
          });
        } else {
          addLog('Chưa có máy khách nào. Hãy cài Client rồi nhập mã ghép nối.', 'info');
        }
      } catch (e) {}
    });

    // Also accept if any client initiates connection
    peer.on('connection', (conn) => {
      console.log('[Manager] Incoming connection from:', conn.peer);
      setupDeviceConnection(conn);
    });

    // Handle incoming media calls (live stream from client)
    peer.on('call', (call) => {
      console.log('[Manager] Incoming media stream from:', call.peer);
      activeMediaCallRef.current = call;
      call.answer();

      call.on('stream', (remoteStream) => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = remoteStream;
          liveVideoRef.current.play().catch(e => console.warn('play error:', e));
        }
        addLog(`Đang nhận luồng trực tiếp từ ${call.peer}`, 'success');
      });

      call.on('close', () => {
        setIsLiveWebcamActive(false);
        setIsLiveScreenActive(false);
        setLiveStreamSource(null);
        if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
        addLog('Luồng phát trực tiếp đã đóng', 'info');
      });
    });

    peer.on('error', (err: any) => {
      console.warn('[Manager] Peer error:', err.type, err);
      addLog(`Lỗi P2P: ${err.type}`, 'error');
    });

    peer.on('disconnected', () => {
      addLog('Mất kết nối PeerJS, đang kết nối lại...', 'info');
      setTimeout(() => { if (peerRef.current && !peerRef.current.destroyed) peerRef.current.reconnect(); }, 3000);
    });

    fetchUpnpStatus();
    const upnpInterval = setInterval(fetchUpnpStatus, 15000);

    // Retry connecting to offline known devices every 30s
    const retryInterval = setInterval(() => {
      const savedList = JSON.parse(localStorage.getItem('sm_known_devices') || '[]');
      setDevices(prev => {
        savedList.forEach((devId: string) => {
          const dev = prev[devId];
          if (!dev || !dev.online || !dev.conn?.open) {
            connectToDevice(devId, false);
          }
        });
        return prev;
      });
    }, 30000);

    return () => {
      clearInterval(upnpInterval);
      clearInterval(retryInterval);
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [isAuthenticated, addLog]);

  const setupDeviceConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      console.log('[Manager] Connection open with device:', conn.peer);
      addLog(`Thiết bị ${conn.peer} đã kết nối trực tuyến!`, 'success');
      conn.send({ command: 'info' });
    });

    conn.on('data', (data: any) => {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'heartbeat') {
        const devId = data.deviceId || conn.peer;
        setDevices(prev => {
          const updated = {
            ...prev,
            [devId]: {
              deviceId: devId,
              hostname: data.hostname || 'Máy khách',
              platform: data.platform || 'windows',
              arch: data.arch,
              uptime: data.uptime,
              memory: data.memory,
              freeMemory: data.freeMemory,
              cpus: data.cpus,
              lastSeen: Date.now(),
              online: true,
              conn
            }
          };
          // Save all known device IDs persistently
          const ids = Object.keys(updated);
          localStorage.setItem('sm_known_devices', JSON.stringify(ids));
          return updated;
        });

        // Auto-select first device if none selected
        setSelectedDeviceId(prev => prev || devId);
        addLog(`Thiết bị ${data.hostname || devId} (${devId}) đang trực tuyến`, 'success');
      } 
      else if (data.type === 'capture-result') {
        const item: MediaItem = {
          id: `media_${Date.now()}`,
          deviceId: data.deviceId || conn.peer,
          type: data.captureType || 'webcam',
          dataUrl: data.dataUrl,
          timestamp: data.timestamp || Date.now()
        };

        if (data.captureType === 'screen') {
          setActiveScreenCapture(data.dataUrl);
          setIsCapturingScreen(false);
          addLog(`Đã nhận ảnh chụp màn hình từ ${data.deviceId || conn.peer}`, 'success');
          showToast('Đã chụp màn hình thành công!');
        } else {
          setActiveWebcamCapture(data.dataUrl);
          setIsCapturingWebcam(false);
          addLog(`Đã nhận ảnh chụp webcam từ ${data.deviceId || conn.peer}`, 'success');
          showToast('Đã chụp webcam thành công!');
        }

        setCaptures(prev => {
          const next = [item, ...prev];
          localStorage.setItem('sm_media_gallery', JSON.stringify(next.slice(0, 100)));
          return next;
        });
      }
      else if (data.type === 'command-result') {
        addLog(`Kết quả lệnh [${data.command}]: ${data.message || 'Thành công'}`, 'success');
        showToast(data.message || 'Lệnh thực thi thành công!');
      }
      else if (data.type === 'command-error') {
        addLog(`Lỗi lệnh [${data.command}]: ${data.error}`, 'error');
        showToast(`Lỗi: ${data.error}`);
        setIsCapturingWebcam(false);
        setIsCapturingScreen(false);
      }
    });

    conn.on('close', () => {
      console.log('[Manager] Connection closed with device:', conn.peer);
      setDevices(prev => {
        if (!prev[conn.peer]) return prev;
        return {
          ...prev,
          [conn.peer]: { ...prev[conn.peer], online: false }
        };
      });
      addLog(`Thiết bị ${conn.peer} đã ngắt kết nối`, 'info');
    });
  };

  const connectToDevice = (targetId: string, isManual = true) => {
    if (!targetId || !peerRef.current || peerRef.current.destroyed) return;
    const cleanId = targetId.trim().toUpperCase();
    if (!cleanId) return;
    if (isManual) {
      setConnectingId(cleanId);
      addLog(`Đang kết nối tới thiết bị ${cleanId}...`, 'info');
    }

    try {
      // Check if already connected
      const existing = devices[cleanId];
      if (existing?.conn?.open) {
        addLog(`Thiết bị ${cleanId} đã được kết nối`, 'info');
        if (isManual) { setConnectingId(null); setShowAddDeviceModal(false); setNewDeviceCode(''); }
        return;
      }

      const conn = peerRef.current.connect(cleanId, { reliable: true });

      // Save to known list immediately when user manually adds
      if (isManual) {
        try {
          const saved = JSON.parse(localStorage.getItem('sm_known_devices') || '[]');
          if (!saved.includes(cleanId)) {
            saved.push(cleanId);
            localStorage.setItem('sm_known_devices', JSON.stringify(saved));
          }
        } catch(e) {}
      }

      setupDeviceConnection(conn);

      // Close modal after short delay
      if (isManual) {
        setTimeout(() => {
          setConnectingId(null);
          setShowAddDeviceModal(false);
          setNewDeviceCode('');
        }, 800);
      }

      // Timeout: if not connected in 10s, mark failed
      if (isManual) {
        setTimeout(() => {
          if (!devices[cleanId]?.online) {
            addLog(`Thiết bị ${cleanId} không phản hồi — đảm bảo máy khách đang chạy`, 'error');
          }
        }, 10000);
      }
    } catch (e: any) {
      addLog(`Không thể kết nối tới ${cleanId}: ${e.message}`, 'error');
      if (isManual) setConnectingId(null);
    }
  };

  const sendDeviceCommand = (command: string, extra: any = {}) => {
    if (!selectedDeviceId || !devices[selectedDeviceId]) {
      alert('Vui lòng chọn một thiết bị máy khách trước.');
      return;
    }
    const dev = devices[selectedDeviceId];
    if (!dev.conn || !dev.conn.open) {
      // Reconnect
      connectToDevice(selectedDeviceId, false);
      showToast('Đang kết nối lại tới thiết bị...');
    }

    if (command === 'snap-webcam') setIsCapturingWebcam(true);
    if (command === 'snap-screen') setIsCapturingScreen(true);

    dev.conn?.send({ command, id: Date.now(), ...extra });
    addLog(`Đã gửi lệnh [${command}] tới ${dev.hostname} (${dev.deviceId})`, 'info');
  };

  const startLiveStream = (source: 'webcam' | 'screen') => {
    if (!selectedDeviceId) return;
    setLiveStreamSource(source);
    if (source === 'webcam') setIsLiveWebcamActive(true);
    if (source === 'screen') setIsLiveScreenActive(true);
    sendDeviceCommand(source === 'webcam' ? 'start-webcam' : 'start-screen');
  };

  const stopLiveStream = () => {
    if (activeMediaCallRef.current) {
      activeMediaCallRef.current.close();
      activeMediaCallRef.current = null;
    }
    sendDeviceCommand(liveStreamSource === 'webcam' ? 'stop-webcam' : 'stop-screen');
    setIsLiveWebcamActive(false);
    setIsLiveScreenActive(false);
    setLiveStreamSource(null);
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  };

  const fetchUpnpStatus = async () => {
    try {
      const res = await fetch('/api/go2rtc/upnp');
      if (res.ok) {
        const data = await res.json();
        setUpnpInfo(data);
      }
    } catch (e) {}
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1621') {
      sessionStorage.setItem('manager-auth', '1621');
      setIsAuthenticated(true);
    } else {
      alert('Mã PIN không đúng (Mặc định: 1621)');
      setPinInput('');
    }
  };

  const selectedDevice = selectedDeviceId ? devices[selectedDeviceId] : null;
  const onlineCount = Object.values(devices).filter(d => d.online).length;
  const totalDevicesCount = Object.keys(devices).length;

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: colors.bgPage }}>
        <div style={{ backgroundColor: colors.bgCard, padding: '40px', borderRadius: colors.radiusLg, boxShadow: colors.shadowLg, width: '100%', maxWidth: '420px', textAlign: 'center', border: `1px solid ${colors.borderColor}` }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: colors.primary }}>
            <Shield size={36} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: colors.textPrimary, marginBottom: '6px' }}>
            Service Manager
          </h1>
          <p style={{ color: colors.textSecondary, fontSize: '13px', marginBottom: '28px' }}>
            Bảng điều khiển Máy chủ & Giám sát Camera
          </p>
          <form onSubmit={handleAuth}>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Key size={18} color={colors.textMuted} style={{ position: 'absolute', left: '16px', top: '15px' }} />
              <input
                type="password"
                placeholder="Nhập mã PIN (1621)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{ width: '100%', padding: '12px 16px 12px 46px', borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, backgroundColor: colors.bgInput, fontSize: '16px', outline: 'none', textAlign: 'left' }}
                autoFocus
              />
            </div>
            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: colors.primary, color: '#FFF', border: 'none', borderRadius: colors.radius, fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span>Đăng nhập hệ thống</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: colors.bgPage, minHeight: '100vh', display: 'flex', flexDirection: 'column', color: colors.textPrimary }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: colors.darkBg, color: '#FFF', padding: '12px 20px', borderRadius: colors.radius, boxShadow: colors.shadowLg, zIndex: 100, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
          <CheckCircle size={18} color="#10B981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header style={{ height: '56px', backgroundColor: colors.bgHeader, borderBottom: `1px solid ${colors.borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', boxShadow: colors.shadowSm, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary }}>
            <Shield size={18} />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '16px', color: colors.textPrimary }}>Service Manager</span>
            <span style={{ fontSize: '11px', color: colors.textSecondary, marginLeft: '8px' }}>Dashboard</span>
          </div>
        </div>

        {/* Header Device Quick Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: colors.bgInput, padding: '6px 14px', borderRadius: '20px', border: `1px solid ${colors.borderColor}`, fontSize: '13px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: onlineCount > 0 ? colors.accent : colors.danger }} />
            <span style={{ fontWeight: 600 }}>{onlineCount} Online</span>
            <span style={{ color: colors.textSecondary }}>/ {totalDevicesCount} Máy khách</span>
          </div>

          <button 
            onClick={() => setShowAddDeviceModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.primary, color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Ghép nối Máy khách
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <nav style={{ width: '230px', backgroundColor: colors.bgSidebar, borderRight: `1px solid ${colors.borderColor}`, display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? colors.primary : colors.textSecondary,
                  backgroundColor: isActive ? colors.primaryLight : 'transparent',
                  borderLeft: isActive ? `4px solid ${colors.primary}` : '4px solid transparent',
                  transition: 'all 0.15s'
                }}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </div>
            );
          })}
        </nav>

        {/* Content Area */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                <div style={{ backgroundColor: colors.bgCard, padding: '20px', borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, borderLeft: `4px solid ${colors.accent}`, boxShadow: colors.shadowSm, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '12px', background: colors.accentLight, borderRadius: '12px', color: colors.accent }}>
                    <Laptop size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{onlineCount} / {totalDevicesCount}</div>
                    <div style={{ fontSize: '12px', color: colors.textSecondary }}>Máy khách trực tuyến</div>
                  </div>
                </div>

                <div style={{ backgroundColor: colors.bgCard, padding: '20px', borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, borderLeft: `4px solid ${colors.primary}`, boxShadow: colors.shadowSm, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '12px', background: colors.primaryLight, borderRadius: '12px', color: colors.primary }}>
                    <Camera size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{registeredCameras.length}</div>
                    <div style={{ fontSize: '12px', color: colors.textSecondary }}>Camera IP (go2rtc)</div>
                  </div>
                </div>

                <div style={{ backgroundColor: colors.bgCard, padding: '20px', borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, borderLeft: `4px solid ${colors.warning}`, boxShadow: colors.shadowSm, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '12px', background: colors.warningLight, borderRadius: '12px', color: colors.warning }}>
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{captures.length}</div>
                    <div style={{ fontSize: '12px', color: colors.textSecondary }}>Ảnh đã chụp lưu trữ</div>
                  </div>
                </div>

                <div style={{ backgroundColor: colors.bgCard, padding: '20px', borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, borderLeft: `4px solid ${upnpInfo.available ? colors.accent : colors.danger}`, boxShadow: colors.shadowSm, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ padding: '12px', background: upnpInfo.available ? colors.accentLight : colors.dangerLight, borderRadius: '12px', color: upnpInfo.available ? colors.accent : colors.danger }}>
                    <Globe size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>{upnpInfo.externalIp || 'P2P Ready'}</div>
                    <div style={{ fontSize: '12px', color: colors.textSecondary }}>{upnpInfo.cgnat ? 'CGNAT (WebRTC Mode)' : 'UPnP Tự động mở'}</div>
                  </div>
                </div>
              </div>

              {/* Connected Devices Quick List */}
              <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, padding: '20px', boxShadow: colors.shadowSm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Máy khách đã kết nối</h3>
                  <button onClick={() => setActiveTab('devices')} style={{ fontSize: '12px', color: colors.primary, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    Quản lý chi tiết →
                  </button>
                </div>

                {totalDevicesCount === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
                    Chưa có máy khách nào kết nối. Hãy cài đặt bản Client trên máy cần bảo vệ hoặc nhấn <strong>"Ghép nối Máy khách"</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {Object.values(devices).map(dev => (
                      <div 
                        key={dev.deviceId}
                        onClick={() => { setSelectedDeviceId(dev.deviceId); setActiveTab('capture'); }}
                        style={{ 
                          padding: '16px', 
                          borderRadius: colors.radius, 
                          border: `1px solid ${selectedDeviceId === dev.deviceId ? colors.primary : colors.borderColor}`, 
                          backgroundColor: selectedDeviceId === dev.deviceId ? colors.primaryLight : colors.bgPage,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: dev.online ? colors.accentLight : colors.dangerLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: dev.online ? colors.accent : colors.danger }}>
                            <Laptop size={20} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{dev.hostname}</div>
                            <div style={{ fontSize: '11px', color: colors.textSecondary, fontFamily: 'monospace' }}>Mã: {dev.deviceId}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: dev.online ? colors.accent : colors.danger }}>
                          {dev.online ? '● Trực tuyến' : '○ Ngoại tuyến'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Log */}
              <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, padding: '20px', boxShadow: colors.shadowSm }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Nhật ký hoạt động hệ thống</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '240px', overflowY: 'auto' }}>
                  {systemLogs.length === 0 ? (
                    <div style={{ color: colors.textMuted, fontSize: '13px' }}>Đang chờ sự kiện...</div>
                  ) : (
                    systemLogs.map((log, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: log.type === 'error' ? colors.danger : log.type === 'success' ? colors.accent : colors.primary }} />
                        <span style={{ flex: 1 }}>{log.msg}</span>
                        <span style={{ fontSize: '11px', color: colors.textMuted, fontFamily: 'monospace' }}>{log.time}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEVICES */}
          {activeTab === 'devices' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Danh sách Thiết bị Máy khách (Agent)</h2>
                  <p style={{ fontSize: '13px', color: colors.textSecondary }}>Các thiết bị đang chạy ngầm dịch vụ Service Manager Client</p>
                </div>
                <button 
                  onClick={() => setShowAddDeviceModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.primary, color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Plus size={16} /> Thêm thiết bị mới
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {Object.values(devices).map(dev => (
                  <div 
                    key={dev.deviceId}
                    style={{ 
                      backgroundColor: colors.bgCard, 
                      borderRadius: colors.radius, 
                      border: `2px solid ${selectedDeviceId === dev.deviceId ? colors.primary : colors.borderColor}`, 
                      padding: '20px', 
                      boxShadow: colors.shadowSm,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: dev.online ? colors.accentLight : colors.dangerLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: dev.online ? colors.accent : colors.danger }}>
                          <Laptop size={24} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: '15px', fontWeight: 700 }}>{dev.hostname}</h4>
                          <span style={{ fontSize: '11px', color: colors.textSecondary, fontFamily: 'monospace' }}>Mã: {dev.deviceId}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 8px', borderRadius: '12px', background: dev.online ? colors.accentLight : colors.dangerLight, color: dev.online ? colors.accent : colors.danger }}>
                        {dev.online ? '● Online' : '○ Offline'}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: colors.textSecondary, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: colors.bgInput, padding: '10px', borderRadius: '8px' }}>
                      <div>HĐH: <strong>{dev.platform}</strong></div>
                      <div>Uptime: <strong>{dev.uptime ? `${Math.floor(dev.uptime / 3600)}h` : '-'}</strong></div>
                      <div>RAM: <strong>{dev.memory ? `${Math.round(dev.memory / 1024 / 1024 / 1024)} GB` : '-'}</strong></div>
                      <div>CPU: <strong>{dev.cpus || 1} Cores</strong></div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => { setSelectedDeviceId(dev.deviceId); setActiveTab('capture'); }}
                        style={{ flex: 1, padding: '8px', backgroundColor: colors.primary, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Aperture size={14} /> Chụp & Điều khiển
                      </button>
                      <button 
                        onClick={() => { setSelectedDeviceId(dev.deviceId); setActiveTab('live'); startLiveStream('screen'); }}
                        style={{ padding: '8px 12px', backgroundColor: colors.bgInput, border: `1px solid ${colors.borderColor}`, borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        title="Xem trực tiếp màn hình"
                      >
                        <MonitorPlay size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: REMOTE CAPTURE (NVIDIAs Style Dual Card) */}
          {activeTab === 'capture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Chụp ảnh & Điều khiển Chống trộm</h2>
                  <p style={{ fontSize: '13px', color: colors.textSecondary }}>
                    Thiết bị đang chọn: <strong>{selectedDevice ? `${selectedDevice.hostname} (${selectedDevice.deviceId})` : 'Chưa chọn'}</strong>
                  </p>
                </div>
                {selectedDevice && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => sendDeviceCommand('lock')}
                      style={{ padding: '8px 14px', backgroundColor: colors.danger, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Lock size={14} /> Khóa máy từ xa
                    </button>
                    <button 
                      onClick={() => sendDeviceCommand('alarm')}
                      style={{ padding: '8px 14px', backgroundColor: colors.warning, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Volume2 size={14} /> Hú còi cảnh báo
                    </button>
                  </div>
                )}
              </div>

              {!selectedDevice ? (
                <div style={{ padding: '40px', backgroundColor: colors.bgCard, borderRadius: colors.radius, textAlign: 'center', color: colors.textMuted }}>
                  Vui lòng chọn một thiết bị từ tab <strong>Thiết bị</strong> để thực hiện chụp.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Left: Webcam Capture Window */}
                  <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '12px 16px', backgroundColor: colors.bgInput, borderBottom: `1px solid ${colors.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Camera size={16} color={colors.primary} /> Ảnh chụp Webcam Máy khách
                      </span>
                      <button 
                        onClick={() => sendDeviceCommand('snap-webcam')}
                        disabled={isCapturingWebcam}
                        style={{ padding: '6px 12px', backgroundColor: colors.primary, color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isCapturingWebcam ? 'not-allowed' : 'pointer' }}
                      >
                        {isCapturingWebcam ? 'Đang chụp...' : '📸 Chụp Webcam Ngay'}
                      </button>
                    </div>

                    <div style={{ flex: 1, minHeight: '300px', backgroundColor: colors.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {activeWebcamCapture ? (
                        <img src={activeWebcamCapture} alt="Webcam Capture" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
                          <Camera size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                          <div>Chưa có ảnh chụp webcam</div>
                          <div style={{ fontSize: '11px' }}>Bấm nút trên để chụp (LED máy khách tắt ngay sau khi chụp)</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Screen Capture Window */}
                  <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '12px 16px', backgroundColor: colors.bgInput, borderBottom: `1px solid ${colors.borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={16} color={colors.primary} /> Ảnh chụp Màn hình Desktop
                      </span>
                      <button 
                        onClick={() => sendDeviceCommand('snap-screen')}
                        disabled={isCapturingScreen}
                        style={{ padding: '6px 12px', backgroundColor: colors.primary, color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isCapturingScreen ? 'not-allowed' : 'pointer' }}
                      >
                        {isCapturingScreen ? 'Đang chụp...' : '🖥️ Chụp Màn hình'}
                      </button>
                    </div>

                    <div style={{ flex: 1, minHeight: '300px', backgroundColor: colors.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {activeScreenCapture ? (
                        <img src={activeScreenCapture} alt="Screen Capture" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
                          <Monitor size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                          <div>Chưa có ảnh chụp màn hình</div>
                          <div style={{ fontSize: '11px' }}>Bấm nút trên để chụp màn hình desktop từ xa</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: LIVE STREAM (WebRTC 1080p Stream like ScreenDisguise) */}
          {activeTab === 'live' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Xem trực tiếp Màn hình & Camera (WebRTC HD)</h2>
                  <p style={{ fontSize: '13px', color: colors.textSecondary }}>
                    Thiết bị: <strong>{selectedDevice ? `${selectedDevice.hostname} (${selectedDevice.deviceId})` : 'Chưa chọn'}</strong>
                  </p>
                </div>

                {selectedDevice && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => startLiveStream('screen')}
                      style={{ padding: '8px 14px', backgroundColor: liveStreamSource === 'screen' ? colors.accent : colors.primary, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Cast size={14} /> Phát Màn hình PC
                    </button>
                    <button 
                      onClick={() => startLiveStream('webcam')}
                      style={{ padding: '8px 14px', backgroundColor: liveStreamSource === 'webcam' ? colors.accent : colors.primary, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Camera size={14} /> Phát Webcam Live
                    </button>
                    {(isLiveWebcamActive || isLiveScreenActive) && (
                      <button 
                        onClick={stopLiveStream}
                        style={{ padding: '8px 14px', backgroundColor: colors.danger, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Dừng phát
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Video Viewport Canvas */}
              <div style={{ width: '100%', height: '540px', backgroundColor: colors.darkBg, borderRadius: colors.radiusLg, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video 
                  ref={liveVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />

                {(!isLiveWebcamActive && !isLiveScreenActive) && (
                  <div style={{ position: 'absolute', textAlign: 'center', color: '#94A3B8' }}>
                    <MonitorPlay size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFF' }}>Chưa bật luồng phát trực tiếp</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>Chọn "Phát Màn hình PC" hoặc "Phát Webcam Live" để bắt đầu xem</div>
                  </div>
                )}

                {(isLiveWebcamActive || isLiveScreenActive) && (
                  <div style={{ position: 'absolute', top: '16px', left: '16px', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: '6px', color: '#FFF', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', animation: 'pulse 1.5s infinite' }} />
                    <span>LIVE WebRTC P2P • {liveStreamSource === 'screen' ? 'Màn hình 1080p' : 'Webcam 720p'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CAMERAS (go2rtc VMS) */}
          {activeTab === 'cameras' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Giám sát Camera IP (VMS go2rtc)</h2>
                  <p style={{ fontSize: '13px', color: colors.textSecondary }}>Hỗ trợ DVRIP (iCSee/XMEye main stream) và RTSP độ phân giải cao</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setCameraGridMode(1)} style={{ padding: '6px 12px', background: cameraGridMode === 1 ? colors.primary : colors.bgInput, color: cameraGridMode === 1 ? '#FFF' : colors.textPrimary, border: `1px solid ${colors.borderColor}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>1×1</button>
                  <button onClick={() => setCameraGridMode(2)} style={{ padding: '6px 12px', background: cameraGridMode === 2 ? colors.primary : colors.bgInput, color: cameraGridMode === 2 ? '#FFF' : colors.textPrimary, border: `1px solid ${colors.borderColor}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>2×2</button>
                  <button onClick={() => setCameraGridMode(3)} style={{ padding: '6px 12px', background: cameraGridMode === 3 ? colors.primary : colors.bgInput, color: cameraGridMode === 3 ? '#FFF' : colors.textPrimary, border: `1px solid ${colors.borderColor}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>3×3</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cameraGridMode}, 1fr)`, gap: '16px' }}>
                {[1, 2, 3, 4].slice(0, cameraGridMode * cameraGridMode).map(idx => (
                  <div key={idx} style={{ backgroundColor: colors.darkBg, borderRadius: colors.radius, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      <Camera size={32} style={{ opacity: 0.4, marginBottom: '6px' }} />
                      <div>Kênh Camera #{idx}</div>
                      <div style={{ fontSize: '10px' }}>go2rtc WebRTC</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: LIBRARY */}
          {activeTab === 'library' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Thư viện Ảnh chụp Chống trộm ({captures.length})</h2>
                {captures.length > 0 && (
                  <button 
                    onClick={() => { if (confirm('Xóa toàn bộ thư viện?')) { setCaptures([]); localStorage.removeItem('sm_media_gallery'); } }}
                    style={{ padding: '6px 12px', backgroundColor: colors.dangerLight, color: colors.danger, border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>

              {captures.length === 0 ? (
                <div style={{ padding: '60px', backgroundColor: colors.bgCard, borderRadius: colors.radius, textAlign: 'center', color: colors.textMuted }}>
                  <ImageIcon size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <div>Chưa có ảnh chụp nào trong thư viện.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                  {captures.map(item => (
                    <div key={item.id} style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, overflow: 'hidden', boxShadow: colors.shadowSm }}>
                      <div style={{ aspectRatio: '16/9', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#000' }} onClick={() => setLightboxItem(item)}>
                        <img src={item.dataUrl} alt={item.type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: item.type === 'webcam' ? colors.primary : colors.accent }}>
                            {item.type === 'webcam' ? '📸 Webcam' : '🖥️ Màn hình'}
                          </div>
                          <div style={{ fontSize: '10px', color: colors.textMuted }}>{new Date(item.timestamp).toLocaleString('vi-VN')}</div>
                        </div>
                        <a href={item.dataUrl} download={`capture_${item.type}_${item.timestamp}.jpg`} style={{ color: colors.textSecondary, padding: '4px' }}>
                          <Download size={15} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: NETWORK */}
          {activeTab === 'network' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Trạng thái Mạng & Tự động Mở cổng (UPnP)</h2>
              
              <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Thông tin Kết nối WAN / Router</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '13px' }}>
                  <div>IP Công cộng (WAN): <strong>{upnpInfo.externalIp || 'Đang quét...'}</strong></div>
                  <div>Hỗ trợ UPnP Router: <strong style={{ color: upnpInfo.available ? colors.accent : colors.danger }}>{upnpInfo.available ? 'Khả dụng' : 'Không khả dụng'}</strong></div>
                  <div>Loại mạng: <strong>{upnpInfo.cgnat ? 'CGNAT (Dùng WebRTC P2P)' : 'IPv4 Trực tiếp'}</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS & UNINSTALL */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Cài đặt & Quản lý vai trò Hệ thống</h2>

              <div style={{ backgroundColor: colors.bgCard, borderRadius: colors.radius, border: `1px solid ${colors.borderColor}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Chuyển đổi Vai trò hoạt động (Modify Role)</h3>
                <p style={{ fontSize: '13px', color: colors.textSecondary }}>
                  Bạn có thể chuyển máy tính này thành <strong>Máy khách chạy ngầm</strong> để bảo vệ chống trộm hoặc duy trì làm <strong>Máy chủ quản lý</strong>.
                </p>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => {
                      if (confirm('Chuyển máy này sang chế độ Máy khách chạy ngầm?\nỨng dụng sẽ tự ẩn và khởi động cùng Windows.')) {
                        (window as any).require('electron').ipcRenderer.invoke('switch-role', 'client');
                      }
                    }}
                    style={{ padding: '10px 18px', backgroundColor: colors.primary, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🛡️ Chuyển sang Máy khách (Client Agent)
                  </button>

                  <button 
                    onClick={() => {
                      if (confirm('Đặt lại cấu hình ban đầu?')) {
                        (window as any).require('electron').ipcRenderer.invoke('reset-config');
                      }
                    }}
                    style={{ padding: '10px 18px', backgroundColor: colors.bgInput, border: `1px solid ${colors.borderColor}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🔄 Chọn lại vai trò (Setup Wizard)
                  </button>
                </div>
              </div>

              {/* Danger Zone: Uninstall */}
              <div style={{ backgroundColor: colors.dangerLight, borderRadius: colors.radius, border: `1px solid ${colors.danger}`, padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: colors.danger, marginBottom: '8px' }}>Gỡ cài đặt hoàn toàn (Uninstall)</h3>
                <p style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '16px' }}>
                  Hành động này sẽ xóa sạch toàn bộ file cài đặt, registry khởi động cùng Windows và dữ liệu cấu hình.
                </p>
                <button 
                  onClick={() => {
                    const pin = prompt('Nhập mã PIN để xác nhận gỡ cài đặt (1621):');
                    if (pin === '1621') {
                      (window as any).require('electron').ipcRenderer.invoke('uninstall-app');
                    } else if (pin !== null) {
                      alert('Mã PIN không đúng.');
                    }
                  }}
                  style={{ padding: '10px 18px', backgroundColor: colors.danger, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  🗑️ Gỡ bỏ Service Manager khỏi máy tính
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Modal: Add / Pair New Device */}
      {showAddDeviceModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: colors.bgCard, borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: `1px solid ${colors.borderColor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>Thêm thiết bị máy khách</h3>
              <button onClick={() => setShowAddDeviceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: '4px' }}><X size={18} /></button>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '20px', fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#0F172A' }}>Hướng dẫn ghép nối:</strong>
              1. Cài ứng dụng ở chế độ <strong>Máy khách</strong> trên laptop/PC cần giám sát<br/>
              2. Khi khởi động lần đầu, máy khách hiển thị <strong>Mã thiết bị</strong> (VD: <code style={{ background: '#E2E8F0', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>IPC-A1B2C3</code>)<br/>
              3. Nhập mã đó vào ô bên dưới và bấm <strong>Kết nối</strong>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: colors.textSecondary, marginBottom: '6px' }}>MÃ THIẾT BỊ</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="VD: IPC-A1B2C3"
                  value={newDeviceCode}
                  onChange={(e) => setNewDeviceCode(e.target.value.toUpperCase().trim())}
                  onKeyDown={(e) => e.key === 'Enter' && newDeviceCode && connectToDevice(newDeviceCode)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: `1px solid ${colors.borderColor}`, backgroundColor: '#fff', fontSize: '15px', outline: 'none', fontFamily: 'monospace', letterSpacing: '1px', color: colors.textPrimary }}
                  autoFocus
                />
                <button
                  onClick={() => connectToDevice(newDeviceCode)}
                  disabled={!newDeviceCode || !!connectingId}
                  style={{ padding: '10px 18px', backgroundColor: !newDeviceCode || !!connectingId ? '#94A3B8' : colors.primary, color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !newDeviceCode || !!connectingId ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                >
                  {connectingId ? 'Đang kết nối...' : 'Kết nối'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: colors.textMuted, borderTop: `1px solid ${colors.borderColor}`, paddingTop: '12px' }}>
              Kết nối hoạt động qua Internet — không cần cùng mạng LAN. Thiết bị sẽ xuất hiện trong danh sách sau vài giây.
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setLightboxItem(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <img src={lightboxItem.dataUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', objectFit: 'contain' }} />
            <button onClick={() => setLightboxItem(null)} style={{ position: 'absolute', top: '-14px', right: '-14px', width: '32px', height: '32px', borderRadius: '50%', background: '#FFF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: colors.shadowMd }}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
