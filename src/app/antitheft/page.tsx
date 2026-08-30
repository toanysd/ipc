'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Eye, Image as ImageIcon, MapPin, Trash2, Camera, Monitor, Video, X, Battery, Cpu, Clock, Terminal, Laptop, Globe, HardDrive } from 'lucide-react';

// === THEME ===
const colors = {
  bg: '#0a0c10',
  glassBg: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.06)',
  primary: '#58a6ff',
  primaryDim: 'rgba(88,166,255,0.2)',
  success: '#2ea043',
  danger: '#f85149',
  warning: '#d29922',
  text: '#e6edf3',
  textMuted: '#7d8590'
};

const styles = {
  glass: {
    backgroundColor: colors.glassBg,
    border: `1px solid ${colors.glassBorder}`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '12px',
  },
  button: {
    backgroundColor: colors.glassBg,
    border: `1px solid ${colors.glassBorder}`,
    color: colors.text,
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    fontWeight: 500,
  },
  buttonPrimary: {
    backgroundColor: colors.primaryDim,
    border: `1px solid ${colors.primary}`,
    color: colors.primary,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: `1px solid ${colors.glassBorder}`,
    color: colors.text,
    padding: '10px 16px',
    borderRadius: '8px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
  },
  card: {
    backgroundColor: colors.glassBg,
    border: `1px solid ${colors.glassBorder}`,
    borderRadius: '12px',
    padding: '20px',
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'inline-block',
  }
};

// === TYPES ===
type Tab = 'devices' | 'monitor' | 'gallery' | 'location';

interface DeviceInfo {
  hostname: string;
  ip: string;
  platform: string;
  uptime: number;
  battery?: { percent: number; isCharging: boolean };
  cpu?: string;
  memory?: { total: number; free: number };
}

interface DeviceState {
  id: string;
  status: 'offline' | 'online' | 'connecting';
  info?: DeviceInfo;
  conn?: any; // DataConnection
}

interface CapturedImage {
  id: string;
  deviceId: string;
  type: 'webcam' | 'screen';
  dataUrl: string;
  timestamp: number;
}

interface ImageChunkState {
  type: 'webcam' | 'screen';
  totalChunks: number;
  chunks: string[];
}

// === COMPONENT ===
export default function AntiTheftDashboard() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // App state
  const [activeTab, setActiveTab] = useState<Tab>('devices');
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [newDeviceId, setNewDeviceId] = useState('');
  
  // Gallery
  const [gallery, setGallery] = useState<CapturedImage[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<CapturedImage | null>(null);
  
  // Monitor state
  const [webcamStatus, setWebcamStatus] = useState<'idle' | 'capturing' | 'streaming'>('idle');
  const [screenStatus, setScreenStatus] = useState<'idle' | 'capturing'>('idle');
  const [currentWebcamImage, setCurrentWebcamImage] = useState<string | null>(null);
  const [currentScreenImage, setCurrentScreenImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // PeerJS refs
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  // Chunk assembly state per device
  const chunkAssemblyRef = useRef<Record<string, ImageChunkState>>({});

  // 1. Init: Load fonts, check auth, load PeerJS
  useEffect(() => {
    // Load Outfit font
    if (!document.getElementById('outfit-font')) {
      const link = document.createElement('link');
      link.id = 'outfit-font';
      link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.text;
    document.body.style.margin = '0';
    document.body.style.fontFamily = "'Outfit', sans-serif";

    // Check auth
    const auth = sessionStorage.getItem('antitheft-auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
      initPeer();
    }
    
    // Load saved devices
    const saved = localStorage.getItem('antitheft-devices');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        setDevices(parsed.map(id => ({ id, status: 'offline' })));
      } catch (e) {
        console.error('Failed to parse saved devices');
      }
    }

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      stopWebcamStream();
    };
  }, []);
  
  // Auto-connect to devices when Peer is ready
  useEffect(() => {
    if (!isAuthenticated || !peerRef.current || peerRef.current.disconnected) return;
    
    const interval = setInterval(() => {
      devices.forEach(dev => {
        if (dev.status === 'offline') {
          connectToDevice(dev.id);
        } else if (dev.status === 'online' && dev.conn) {
          dev.conn.send({ command: 'ping' });
        }
      });
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated, devices]);

  // Save devices on change
  useEffect(() => {
    const ids = devices.map(d => d.id);
    localStorage.setItem('antitheft-devices', JSON.stringify(ids));
  }, [devices]);

  const initPeer = () => {
    if (document.getElementById('peerjs-script')) {
      setupPeerManager();
      return;
    }
    
    const script = document.createElement('script');
    script.id = 'peerjs-script';
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.onload = setupPeerManager;
    document.head.appendChild(script);
  };

  const setupPeerManager = () => {
    const Peer = (window as any).Peer;
    if (!Peer) return;

    try {
      const peer = new Peer('ipc-antitheft-manager', {
        debug: 2
      });

      peer.on('open', (id: string) => {
        console.log('Manager connected to PeerJS cloud:', id);
        // Initial connection to all saved devices
        devices.forEach(dev => connectToDevice(dev.id, peer));
      });

      peer.on('error', (err: any) => {
        console.error('PeerJS error:', err);
      });
      
      // Handle incoming calls (for webcam stream)
      peer.on('call', (call: any) => {
        console.log('Incoming call from:', call.peer);
        call.answer(); // Answer without sending stream
        callRef.current = call;
        
        call.on('stream', (remoteStream: MediaStream) => {
          console.log('Received remote stream');
          mediaStreamRef.current = remoteStream;
          setWebcamStatus('streaming');
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStream;
            videoRef.current.play().catch(e => console.error('Play error:', e));
          }
        });
        
        call.on('close', () => {
          stopWebcamStream();
        });
      });

      peerRef.current = peer;
    } catch (e) {
      console.error('Failed to init Peer:', e);
    }
  };

  const connectToDevice = (deviceId: string, peerInstance = peerRef.current) => {
    if (!peerInstance || peerInstance.disconnected) return;
    
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'connecting' } : d));
    
    const conn = peerInstance.connect(deviceId, { reliable: true });
    
    conn.on('open', () => {
      console.log('Connected to device:', deviceId);
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'online', conn } : d));
      // Request initial info
      conn.send({ command: 'info' });
    });
    
    conn.on('data', (data: any) => {
      handleDeviceData(deviceId, data);
    });
    
    conn.on('close', () => {
      console.log('Connection closed:', deviceId);
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'offline', conn: undefined } : d));
    });
    
    conn.on('error', (err: any) => {
      console.error(`Connection error with ${deviceId}:`, err);
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'offline', conn: undefined } : d));
    });
  };

  const handleDeviceData = (deviceId: string, data: any) => {
    if (!data || typeof data !== 'object') return;
    
    switch (data.type) {
      case 'pong':
        // Just keeping connection alive
        break;
      case 'info':
        setDevices(prev => prev.map(d => 
          d.id === deviceId ? { ...d, info: data.data, status: 'online' } : d
        ));
        break;
      case 'capture-start':
        chunkAssemblyRef.current[deviceId] = {
          type: data.captureType,
          totalChunks: data.totalChunks,
          chunks: new Array(data.totalChunks).fill('')
        };
        if (data.captureType === 'webcam') setWebcamStatus('capturing');
        if (data.captureType === 'screen') setScreenStatus('capturing');
        break;
      case 'capture-chunk':
        const assembly = chunkAssemblyRef.current[deviceId];
        if (assembly && typeof data.index === 'number') {
          assembly.chunks[data.index] = data.data;
        }
        break;
      case 'capture-end':
        const finalAssembly = chunkAssemblyRef.current[deviceId];
        if (finalAssembly) {
          const dataUrl = finalAssembly.chunks.join('');
          const newImage: CapturedImage = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            deviceId,
            type: finalAssembly.type,
            dataUrl,
            timestamp: Date.now()
          };
          
          setGallery(prev => [newImage, ...prev]);
          
          if (finalAssembly.type === 'webcam') {
            setCurrentWebcamImage(dataUrl);
            setWebcamStatus('idle');
          } else if (finalAssembly.type === 'screen') {
            setCurrentScreenImage(dataUrl);
            setScreenStatus('idle');
          }
          
          delete chunkAssemblyRef.current[deviceId];
        }
        break;
      case 'webcam-ready':
        // Device is ready to be called
        if (peerRef.current && peerRef.current.id) {
          // In this architecture, manager calls device, but device also calls manager.
          // The requirements say: "Dashboard calls the client peer ID with peer.call(devicePeerId)"
          // We wait for incoming call or we initiate it. Let's initiate it.
          const call = peerRef.current.call(deviceId, new MediaStream()); // dummy stream
          callRef.current = call;
          call.on('stream', (remoteStream: MediaStream) => {
            console.log('Received remote stream from device');
            mediaStreamRef.current = remoteStream;
            setWebcamStatus('streaming');
            if (videoRef.current) {
              videoRef.current.srcObject = remoteStream;
              videoRef.current.play().catch(e => console.error('Play error:', e));
            }
          });
        }
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  };

  const sendCommand = (deviceId: string, command: string, payload: any = {}) => {
    const device = devices.find(d => d.id === deviceId);
    if (device && device.conn && device.status === 'online') {
      device.conn.send({ command, ...payload });
    } else {
      console.warn('Cannot send command, device offline or disconnected');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1621') {
      sessionStorage.setItem('antitheft-auth', 'true');
      setIsAuthenticated(true);
      setPinError(false);
      initPeer();
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleAddDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId.trim()) return;
    
    if (!devices.find(d => d.id === newDeviceId.trim())) {
      setDevices(prev => [...prev, { id: newDeviceId.trim(), status: 'offline' }]);
      connectToDevice(newDeviceId.trim());
    }
    setNewDeviceId('');
  };

  const handleRemoveDevice = (id: string) => {
    const dev = devices.find(d => d.id === id);
    if (dev?.conn) {
      dev.conn.close();
    }
    setDevices(prev => prev.filter(d => d.id !== id));
    if (selectedDeviceId === id) {
      setSelectedDeviceId(null);
    }
  };

  // Monitor actions
  const snapWebcam = () => {
    if (!selectedDeviceId) return;
    setWebcamStatus('capturing');
    sendCommand(selectedDeviceId, 'snap-webcam');
  };

  const snapScreen = () => {
    if (!selectedDeviceId) return;
    setScreenStatus('capturing');
    sendCommand(selectedDeviceId, 'snap-screen');
  };

  const startWebcamStream = () => {
    if (!selectedDeviceId) return;
    sendCommand(selectedDeviceId, 'start-webcam');
  };

  const stopWebcamStream = () => {
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setWebcamStatus('idle');
    if (selectedDeviceId) {
      sendCommand(selectedDeviceId, 'stop-webcam');
    }
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // === RENDER ===
  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <div style={{ ...styles.glass, padding: '40px', width: '320px', textAlign: 'center' }}>
          <Shield color={colors.primary} size={48} style={{ marginBottom: '20px' }} />
          <h1 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: 600 }}>Anti-Theft System</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Nhập mã PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              style={{ ...styles.input, textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.2em' }}
              autoFocus
            />
            {pinError && <p style={{ color: colors.danger, fontSize: '0.9rem', marginTop: '12px' }}>Mã PIN không đúng</p>}
            <button type="submit" style={{ ...styles.button, ...styles.buttonPrimary, width: '100%', justifyContent: 'center', marginTop: '24px' }}>
              Xác nhận
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* SIDEBAR */}
      <div style={{ 
        width: '220px', 
        backgroundColor: 'rgba(0,0,0,0.3)', 
        borderRight: `1px solid ${colors.glassBorder}`,
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${colors.glassBorder}` }}>
          <Shield color={colors.primary} size={28} />
          <span style={{ fontWeight: 600, fontSize: '1.2rem', letterSpacing: '0.5px' }}>IPC A-T</span>
        </div>
        
        <div style={{ padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {[
            { id: 'devices', icon: Shield, label: 'Thiết bị' },
            { id: 'monitor', icon: Eye, label: 'Giám sát' },
            { id: 'gallery', icon: ImageIcon, label: 'Ảnh chụp' },
            { id: 'location', icon: MapPin, label: 'Thông tin' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              style={{
                ...styles.button,
                backgroundColor: activeTab === tab.id ? colors.primaryDim : 'transparent',
                border: activeTab === tab.id ? `1px solid ${colors.primary}` : '1px solid transparent',
                justifyContent: 'flex-start',
                padding: '12px 16px',
              }}
            >
              <tab.icon size={18} color={activeTab === tab.id ? colors.primary : colors.textMuted} />
              <span style={{ color: activeTab === tab.id ? colors.text : colors.textMuted }}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
        
        {/* TAB: DEVICES */}
        {activeTab === 'devices' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h2 style={{ margin: 0, fontWeight: 500, fontSize: '1.8rem' }}>Quản lý thiết bị</h2>
              <form onSubmit={handleAddDevice} style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Nhập ID thiết bị..."
                  value={newDeviceId}
                  onChange={e => setNewDeviceId(e.target.value)}
                  style={{ ...styles.input, width: '250px' }}
                />
                <button type="submit" style={{ ...styles.button, ...styles.buttonPrimary }}>
                  Thêm
                </button>
              </form>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {devices.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px', color: colors.textMuted }}>
                  Chưa có thiết bị nào. Hãy thêm ID thiết bị để bắt đầu.
                </div>
              ) : (
                devices.map(dev => (
                  <div 
                    key={dev.id} 
                    style={{ 
                      ...styles.card, 
                      borderColor: selectedDeviceId === dev.id ? colors.primary : colors.glassBorder,
                      backgroundColor: selectedDeviceId === dev.id ? 'rgba(88,166,255,0.05)' : styles.card.backgroundColor,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => setSelectedDeviceId(dev.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '10px', height: '10px', borderRadius: '50%', 
                          backgroundColor: dev.status === 'online' ? colors.success : dev.status === 'connecting' ? colors.warning : colors.danger,
                          boxShadow: `0 0 10px ${dev.status === 'online' ? colors.success : dev.status === 'connecting' ? colors.warning : colors.danger}`
                        }} />
                        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                          {dev.info?.hostname || dev.id}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveDevice(dev.id); }}
                        style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: '4px' }}
                        title="Xóa thiết bị"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div style={{ fontSize: '0.9rem', color: colors.textMuted, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Trạng thái:</span>
                        <span style={{ color: dev.status === 'online' ? colors.success : colors.textMuted }}>
                          {dev.status === 'online' ? 'Trực tuyến' : dev.status === 'connecting' ? 'Đang kết nối...' : 'Ngoại tuyến'}
                        </span>
                      </div>
                      {dev.info && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Nền tảng:</span>
                            <span>{dev.info.platform}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>IP:</span>
                            <span>{dev.info.ip}</span>
                          </div>
                          {dev.info.battery && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Pin:</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {dev.info.battery.percent}% {dev.info.battery.isCharging ? '⚡' : ''}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      <div style={{ marginTop: '8px', fontSize: '0.8rem', opacity: 0.7 }}>ID: {dev.id}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: MONITOR */}
        {activeTab === 'monitor' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: '0 0 24px 0', fontWeight: 500, fontSize: '1.8rem' }}>Giám sát từ xa</h2>
            
            {!selectedDevice ? (
              <div style={{ ...styles.card, textAlign: 'center', padding: '60px', color: colors.textMuted }}>
                Vui lòng chọn một thiết bị ở tab Thiết bị để bắt đầu giám sát.
              </div>
            ) : selectedDevice.status !== 'online' ? (
              <div style={{ ...styles.card, textAlign: 'center', padding: '60px', color: colors.warning }}>
                Thiết bị {selectedDevice.id} hiện đang ngoại tuyến.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
                {/* WEBCAM PANEL */}
                <div style={{ ...styles.card, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <Camera color={colors.primary} />
                    <h3 style={{ margin: 0 }}>Webcam</h3>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button 
                      onClick={snapWebcam} 
                      disabled={webcamStatus !== 'idle'}
                      style={{ ...styles.button, opacity: webcamStatus !== 'idle' ? 0.5 : 1 }}
                    >
                      <ImageIcon size={16} /> Chụp Webcam
                    </button>
                    {webcamStatus === 'streaming' ? (
                      <button onClick={stopWebcamStream} style={{ ...styles.button, borderColor: colors.danger, color: colors.danger }}>
                        <X size={16} /> Dừng
                      </button>
                    ) : (
                      <button 
                        onClick={startWebcamStream}
                        disabled={webcamStatus !== 'idle'}
                        style={{ ...styles.button, opacity: webcamStatus !== 'idle' ? 0.5 : 1 }}
                      >
                        <Video size={16} /> Xem trực tiếp
                      </button>
                    )}
                  </div>
                  
                  <div style={{ 
                    flex: 1, 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {webcamStatus === 'capturing' && (
                      <div style={{ position: 'absolute', color: colors.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: `3px solid ${colors.primaryDim}`, borderTopColor: colors.primary, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <span>Đang chụp ảnh...</span>
                      </div>
                    )}
                    
                    {webcamStatus === 'streaming' && (
                      <video 
                        ref={videoRef} 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                        autoPlay 
                        playsInline
                      />
                    )}
                    
                    {webcamStatus === 'idle' && currentWebcamImage && (
                      <img src={currentWebcamImage} alt="Webcam snap" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                    
                    {webcamStatus === 'idle' && !currentWebcamImage && (
                      <span style={{ color: colors.textMuted }}>Chưa có dữ liệu</span>
                    )}
                  </div>
                </div>
                
                {/* SCREEN PANEL */}
                <div style={{ ...styles.card, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <Monitor color={colors.primary} />
                    <h3 style={{ margin: 0 }}>Màn hình</h3>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button 
                      onClick={snapScreen} 
                      disabled={screenStatus !== 'idle'}
                      style={{ ...styles.button, opacity: screenStatus !== 'idle' ? 0.5 : 1 }}
                    >
                      <ImageIcon size={16} /> Chụp Màn hình
                    </button>
                  </div>
                  
                  <div style={{ 
                    flex: 1, 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {screenStatus === 'capturing' && (
                      <div style={{ position: 'absolute', color: colors.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: `3px solid ${colors.primaryDim}`, borderTopColor: colors.primary, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <span>Đang chụp màn hình...</span>
                      </div>
                    )}
                    
                    {screenStatus === 'idle' && currentScreenImage && (
                      <img src={currentScreenImage} alt="Screen snap" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                    
                    {screenStatus === 'idle' && !currentScreenImage && (
                      <span style={{ color: colors.textMuted }}>Chưa có dữ liệu</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: GALLERY */}
        {activeTab === 'gallery' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h2 style={{ margin: 0, fontWeight: 500, fontSize: '1.8rem' }}>Ảnh chụp</h2>
              <button 
                onClick={() => setGallery([])} 
                style={{ ...styles.button, color: colors.danger, borderColor: colors.danger }}
                disabled={gallery.length === 0}
              >
                <Trash2 size={16} /> Xóa tất cả
              </button>
            </div>
            
            {gallery.length === 0 ? (
              <div style={{ ...styles.card, textAlign: 'center', padding: '60px', color: colors.textMuted }}>
                Chưa có ảnh nào.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                {gallery.map(img => (
                  <div 
                    key={img.id} 
                    style={{ ...styles.card, padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}
                    onClick={() => setFullscreenImage(img)}
                  >
                    <div style={{ height: '150px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                      <img src={img.dataUrl} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: colors.textMuted }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colors.text }}>
                          {img.type === 'webcam' ? <Camera size={14} /> : <Monitor size={14} />}
                          {img.type === 'webcam' ? 'Webcam' : 'Màn hình'}
                        </span>
                        <span>{new Date(img.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>ID: {img.deviceId.substring(0, 10)}...</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: LOCATION / INFO */}
        {activeTab === 'location' && (
          <div>
            <h2 style={{ margin: '0 0 32px 0', fontWeight: 500, fontSize: '1.8rem' }}>Thông tin chi tiết</h2>
            
            {!selectedDevice ? (
              <div style={{ ...styles.card, textAlign: 'center', padding: '60px', color: colors.textMuted }}>
                Vui lòng chọn một thiết bị ở tab Thiết bị để xem thông tin.
              </div>
            ) : !selectedDevice.info ? (
              <div style={{ ...styles.card, textAlign: 'center', padding: '60px', color: colors.textMuted }}>
                Chưa nhận được thông tin từ thiết bị.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${colors.glassBorder}`, paddingBottom: '16px' }}>
                    <Laptop color={colors.primary} size={24} />
                    <h3 style={{ margin: 0 }}>Hệ thống</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Tên máy:</span>
                      <span style={{ fontWeight: 500 }}>{selectedDevice.info.hostname}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Nền tảng:</span>
                      <span style={{ fontWeight: 500 }}>{selectedDevice.info.platform}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Thời gian hoạt động:</span>
                      <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} /> {formatUptime(selectedDevice.info.uptime)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${colors.glassBorder}`, paddingBottom: '16px' }}>
                    <Globe color={colors.primary} size={24} />
                    <h3 style={{ margin: 0 }}>Mạng & Kết nối</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Địa chỉ IP:</span>
                      <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>{selectedDevice.info.ip}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Trạng thái kết nối:</span>
                      <span style={{ color: colors.success, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors.success }} /> Trực tuyến
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.textMuted }}>Peer ID:</span>
                      <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedDevice.id}</span>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${colors.glassBorder}`, paddingBottom: '16px' }}>
                    <Cpu color={colors.primary} size={24} />
                    <h3 style={{ margin: 0 }}>Phần cứng</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedDevice.info.battery && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.textMuted }}>Pin:</span>
                        <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Battery size={14} color={selectedDevice.info.battery.percent < 20 && !selectedDevice.info.battery.isCharging ? colors.danger : colors.text} /> 
                          {selectedDevice.info.battery.percent}% {selectedDevice.info.battery.isCharging ? '(Đang sạc)' : ''}
                        </span>
                      </div>
                    )}
                    {selectedDevice.info.cpu && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.textMuted }}>CPU:</span>
                        <span style={{ fontWeight: 500 }}>{selectedDevice.info.cpu}</span>
                      </div>
                    )}
                    {selectedDevice.info.memory && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: colors.textMuted }}>RAM Trống:</span>
                        <span style={{ fontWeight: 500 }}>
                          {(selectedDevice.info.memory.free / 1024 / 1024 / 1024).toFixed(1)} GB / {(selectedDevice.info.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FULLSCREEN IMAGE MODAL */}
      {fullscreenImage && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1000,
            display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px'
          }}
          onClick={() => setFullscreenImage(null)}
        >
          <button 
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: colors.text, cursor: 'pointer' }}
            onClick={() => setFullscreenImage(null)}
          >
            <X size={32} />
          </button>
          <img 
            src={fullscreenImage.dataUrl} 
            alt="Fullscreen capture" 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
            onClick={e => e.stopPropagation()}
          />
          <div style={{ position: 'absolute', bottom: '20px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '12px 24px', borderRadius: '24px' }}>
            {new Date(fullscreenImage.timestamp).toLocaleString()} - {fullscreenImage.type === 'webcam' ? 'Webcam' : 'Màn hình'} ({fullscreenImage.deviceId})
          </div>
        </div>
      )}

      {/* GLOBAL STYLES FOR ANIMATIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
