'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Camera, Plus, Trash2, Play, Pause, Grid, Maximize, 
  RefreshCw, Wifi, WifiOff, Settings, Monitor, Eye, 
  Signal, Globe, AlertCircle 
} from 'lucide-react';

const COLORS = {
  bg: '#0a0c10',
  primary: '#58a6ff',
  success: '#2ea043',
  danger: '#f85149',
  warning: '#d29922',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  glassBg: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.06)',
};

const STYLES = {
  app: {
    minHeight: '100vh',
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: '"Outfit", sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  glass: {
    backgroundColor: COLORS.glassBg,
    border: `1px solid ${COLORS.glassBorder}`,
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: COLORS.glassBg,
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '8px',
    color: COLORS.text,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  buttonPrimary: {
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    border: `1px solid ${COLORS.primary}`,
    color: COLORS.primary,
  },
  buttonDanger: {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    border: `1px solid ${COLORS.danger}`,
    color: COLORS.danger,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '8px',
    color: COLORS.text,
    fontSize: '14px',
    outline: 'none',
  },
  card: {
    padding: '16px',
    backgroundColor: COLORS.glassBg,
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '12px',
    backdropFilter: 'blur(12px)',
  }
};

export default function CamerasPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [activeTab, setActiveTab] = useState('cameras');
  
  // Tab 1: Cameras
  const [discoveredCameras, setDiscoveredCameras] = useState<any[]>([]);
  const [registeredStreams, setRegisteredStreams] = useState<any>({});
  const [isScanning, setIsScanning] = useState(false);
  const [manualAdd, setManualAdd] = useState({ name: '', url: '' });

  // Tab 2: Live
  const [gridLayout, setGridLayout] = useState(1);
  
  // Tab 3: Network
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [upnpForm, setUpnpForm] = useState({ cameraIp: '', cameraPort: '554', externalPort: '10554', description: 'Camera' });

  // Tab 4: Settings
  const [settings, setSettings] = useState({ user: 'admin', pass: '' });
  const [go2rtcStatus, setGo2rtcStatus] = useState('running');

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const savedPin = sessionStorage.getItem('cameras-auth');
    if (savedPin === '1621') {
      setIsAuthenticated(true);
      fetchRegisteredStreams();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1621') {
      sessionStorage.setItem('cameras-auth', '1621');
      setIsAuthenticated(true);
      fetchRegisteredStreams();
    } else {
      alert('Mã PIN không đúng');
    }
  };

  const fetchRegisteredStreams = async () => {
    try {
      const res = await fetch('/api/go2rtc/streams');
      if (res.ok) {
        const data = await res.json();
        setRegisteredStreams(data || {});
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setDiscoveredCameras(data.cameras || []);
      }
    } catch (e) {
      console.error(e);
    }
    setIsScanning(false);
  };

  const handleAddStream = async (name: string, url: string) => {
    try {
      await fetch('/api/go2rtc/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url })
      });
      fetchRegisteredStreams();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveStream = async (name: string) => {
    try {
      await fetch(`/api/go2rtc/streams?name=${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      fetchRegisteredStreams();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNetworkInfo = async () => {
    try {
      const res = await fetch('/api/go2rtc/upnp');
      if (res.ok) {
        setNetworkInfo(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddUpnp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/go2rtc/upnp/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upnpForm)
      });
      fetchNetworkInfo();
    } catch (e) {
      console.error(e);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ ...STYLES.app, alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ ...STYLES.glass, padding: '32px', width: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <Monitor size={48} color={COLORS.primary} style={{ marginBottom: '16px' }} />
            <h2 style={{ margin: 0, fontSize: '24px' }}>Camera Hệ Thống</h2>
            <p style={{ margin: '8px 0 0 0', color: COLORS.textMuted, fontSize: '14px' }}>Vui lòng nhập mã PIN</p>
          </div>
          <input 
            type="password" 
            placeholder="Mã PIN" 
            value={pinInput} 
            onChange={e => setPinInput(e.target.value)}
            style={{ ...STYLES.input, textAlign: 'center', letterSpacing: '4px', fontSize: '20px' }}
            autoFocus
          />
          <button type="submit" style={{ ...STYLES.button, ...STYLES.buttonPrimary, justifyContent: 'center' }}>
            Đăng nhập
          </button>
        </form>
      </div>
    );
  }

  const renderTabCameras = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Quản lý Camera</h2>
        <button 
          onClick={handleScan}
          disabled={isScanning}
          style={{ ...STYLES.button, ...(isScanning ? {} : STYLES.buttonPrimary) }}
        >
          <RefreshCw size={16} className={isScanning ? 'spin' : ''} />
          {isScanning ? 'Đang quét...' : 'Quét mạng WiFi'}
        </button>
      </div>

      {discoveredCameras.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, color: COLORS.textMuted }}>Camera tìm thấy</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {discoveredCameras.map((cam, i) => (
              <div key={i} style={STYLES.card}>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>{cam.name || 'Unknown Camera'}</div>
                <div style={{ fontSize: '13px', color: COLORS.textMuted, marginBottom: '4px' }}>IP: {cam.ip}:{cam.port}</div>
                <div style={{ fontSize: '13px', color: COLORS.textMuted, marginBottom: '16px', wordBreak: 'break-all' }}>{cam.rtspUrl}</div>
                <button 
                  onClick={() => handleAddStream(cam.name || `cam_${i}`, cam.rtspUrl)}
                  style={{ ...STYLES.button, ...STYLES.buttonPrimary, width: '100%', justifyContent: 'center' }}
                >
                  <Plus size={16} /> Thêm vào hệ thống
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ margin: 0, color: COLORS.textMuted }}>Thêm thủ công</h3>
        <div style={{ ...STYLES.card, display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>Tên Camera</label>
            <input style={STYLES.input} value={manualAdd.name} onChange={e => setManualAdd({...manualAdd, name: e.target.value})} placeholder="cam_phong_khach" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>RTSP URL</label>
            <input style={STYLES.input} value={manualAdd.url} onChange={e => setManualAdd({...manualAdd, url: e.target.value})} placeholder="rtsp://admin:pass@192.168.1.100:554/stream" />
          </div>
          <button 
            onClick={() => handleAddStream(manualAdd.name, manualAdd.url)}
            style={{ ...STYLES.button, ...STYLES.buttonPrimary, height: '42px' }}
          >
            <Plus size={16} /> Thêm
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ margin: 0, color: COLORS.textMuted }}>Camera đã đăng ký (go2rtc)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {Object.entries(registeredStreams).map(([name, data]: [string, any]) => (
            <div key={name} style={{ ...STYLES.card, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', fontSize: '16px' }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: COLORS.success, backgroundColor: 'rgba(46, 160, 67, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                  <Wifi size={12} /> Online
                </div>
              </div>
              <div style={{ fontSize: '13px', color: COLORS.textMuted, wordBreak: 'break-all', marginBottom: '16px', flex: 1 }}>
                {Array.isArray(data) ? data[0] : (data?.url || JSON.stringify(data))}
              </div>
              <button 
                onClick={() => handleRemoveStream(name)}
                style={{ ...STYLES.button, ...STYLES.buttonDanger, justifyContent: 'center' }}
              >
                <Trash2 size={16} /> Xóa camera
              </button>
            </div>
          ))}
          {Object.keys(registeredStreams).length === 0 && (
            <div style={{ color: COLORS.textMuted, fontSize: '14px', fontStyle: 'italic' }}>Chưa có camera nào được đăng ký.</div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );

  const renderTabLive = () => {
    const streams = Object.keys(registeredStreams);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Xem trực tiếp</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setGridLayout(1)} style={{ ...STYLES.button, ...(gridLayout === 1 ? STYLES.buttonPrimary : {}) }}><Monitor size={16}/> 1x1</button>
            <button onClick={() => setGridLayout(2)} style={{ ...STYLES.button, ...(gridLayout === 2 ? STYLES.buttonPrimary : {}) }}><Grid size={16}/> 2x2</button>
            <button onClick={() => setGridLayout(3)} style={{ ...STYLES.button, ...(gridLayout === 3 ? STYLES.buttonPrimary : {}) }}><Grid size={16}/> 3x3</button>
          </div>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(${gridLayout}, 1fr)`, 
          gap: '16px', 
          flex: 1,
          minHeight: 0
        }}>
          {streams.slice(0, gridLayout * gridLayout).map(name => (
            <WebRTCPlayer key={name} streamName={name} />
          ))}
          {streams.length === 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, ...STYLES.glass }}>
              Chưa có camera nào để xem. Vui lòng thêm camera ở tab Camera.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTabNetwork = () => {
    useEffect(() => {
      fetchNetworkInfo();
    }, []);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ margin: 0 }}>Mạng & Truy cập từ xa</h2>
        
        {networkInfo && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ ...STYLES.card, flex: 1 }}>
              <div style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '4px' }}>IP Công cộng</div>
              <div style={{ fontSize: '24px', fontWeight: '600' }}>{networkInfo.externalIp || 'Đang lấy...'}</div>
            </div>
            <div style={{ ...STYLES.card, flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
              {networkInfo.cgnat ? (
                <>
                  <AlertCircle size={32} color={COLORS.warning} />
                  <div>
                    <div style={{ fontWeight: '600', color: COLORS.warning }}>Phát hiện CGNAT</div>
                    <div style={{ fontSize: '13px', color: COLORS.textMuted }}>Mạng của bạn đang sau NAT 2 lớp. Mở cổng có thể không hoạt động.</div>
                  </div>
                </>
              ) : (
                <>
                  <Signal size={32} color={COLORS.success} />
                  <div>
                    <div style={{ fontWeight: '600', color: COLORS.success }}>Mạng hỗ trợ mở cổng</div>
                    <div style={{ fontSize: '13px', color: COLORS.textMuted }}>UPnP sẵn sàng</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, color: COLORS.textMuted }}>Mở cổng (Port Forwarding)</h3>
          <p style={{ fontSize: '14px', color: COLORS.textMuted, margin: 0 }}>Khi cổng được mở vĩnh viễn, bạn có thể xem camera qua VLC hoặc TinyCam ngay cả khi laptop tắt.</p>
          
          <form onSubmit={handleAddUpnp} style={{ ...STYLES.card, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>IP Camera</label>
                <input required style={STYLES.input} value={upnpForm.cameraIp} onChange={e => setUpnpForm({...upnpForm, cameraIp: e.target.value})} placeholder="192.168.1.xxx" />
              </div>
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>Cổng Camera</label>
                <input required style={STYLES.input} value={upnpForm.cameraPort} onChange={e => setUpnpForm({...upnpForm, cameraPort: e.target.value})} />
              </div>
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>Cổng External</label>
                <input required style={STYLES.input} value={upnpForm.externalPort} onChange={e => setUpnpForm({...upnpForm, externalPort: e.target.value})} />
              </div>
            </div>
            <button type="submit" style={{ ...STYLES.button, ...STYLES.buttonPrimary, alignSelf: 'flex-start' }}>
              <Globe size={16} /> Mở cổng camera
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderTabSettings = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ margin: 0 }}>Cài đặt hệ thống</h2>
      
      <div style={{ ...STYLES.card, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>go2rtc Engine</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: go2rtcStatus === 'running' ? COLORS.success : COLORS.danger }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
            <span style={{ fontWeight: '500' }}>{go2rtcStatus === 'running' ? 'Đang chạy' : 'Đã dừng'}</span>
          </div>
        </div>
        <div style={{ fontSize: '13px', color: COLORS.textMuted }}>API: http://localhost:1984</div>
        <button style={{ ...STYLES.button, alignSelf: 'flex-start' }}>
          <RefreshCw size={16} /> Khởi động lại Engine
        </button>
      </div>

      <div style={{ ...STYLES.card, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Tài khoản Camera mặc định</h3>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>Tên đăng nhập</label>
            <input style={STYLES.input} value={settings.user} onChange={e => setSettings({...settings, user: e.target.value})} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: COLORS.textMuted }}>Mật khẩu</label>
            <input type="password" style={STYLES.input} value={settings.pass} onChange={e => setSettings({...settings, pass: e.target.value})} />
          </div>
        </div>
        <button style={{ ...STYLES.button, ...STYLES.buttonPrimary, alignSelf: 'flex-start' }}>Lưu cài đặt</button>
      </div>
    </div>
  );

  return (
    <div style={STYLES.app}>
      <div style={{ display: 'flex', flex: 1, padding: '24px', gap: '24px', height: '100vh', boxSizing: 'border-box' }}>
        
        {/* Sidebar */}
        <div style={{ ...STYLES.glass, width: '220px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', marginBottom: '16px' }}>
            <Camera color={COLORS.primary} size={28} />
            <span style={{ fontSize: '20px', fontWeight: '600' }}>IPC Cam</span>
          </div>
          
          <TabButton id="cameras" icon={Camera} label="Camera" active={activeTab === 'cameras'} onClick={() => setActiveTab('cameras')} />
          <TabButton id="live" icon={Eye} label="Xem trực tiếp" active={activeTab === 'live'} onClick={() => setActiveTab('live')} />
          <TabButton id="network" icon={Globe} label="Mạng" active={activeTab === 'network'} onClick={() => setActiveTab('network')} />
          <TabButton id="settings" icon={Settings} label="Cài đặt" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
          {activeTab === 'cameras' && renderTabCameras()}
          {activeTab === 'live' && renderTabLive()}
          {activeTab === 'network' && renderTabNetwork()}
          {activeTab === 'settings' && renderTabSettings()}
        </div>

      </div>
    </div>
  );
}

function TabButton({ id, icon: Icon, label, active, onClick }: { id: string, icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
        backgroundColor: active ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
        border: 'none', borderRadius: '8px', color: active ? COLORS.primary : COLORS.text,
        cursor: 'pointer', textAlign: 'left', fontSize: '15px', fontWeight: active ? '600' : '400',
        transition: 'all 0.2s'
      }}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function WebRTCPlayer({ streamName }: { streamName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('connecting'); // connecting, connected, error

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let isMounted = true;

    const initWebRTC = async () => {
      try {
        setStatus('connecting');
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === 'connected') {
            setStatus('connected');
          } else if (pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected') {
            setStatus('error');
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch('/api/go2rtc/webrtc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: streamName, offer: pc.localDescription?.sdp })
        });

        if (!res.ok) throw new Error('Failed to get answer');
        
        const answerSdp = await res.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      } catch (err) {
        console.error('WebRTC Error:', err);
        if (isMounted) setStatus('error');
      }
    };

    initWebRTC();

    return () => {
      isMounted = false;
      if (pc) pc.close();
    };
  }, [streamName]);

  return (
    <div style={{ ...STYLES.glass, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px', display: 'flex', justifyContent: 'space-between', zIndex: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <span style={{ fontWeight: '600', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{streamName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ 
            width: '8px', height: '8px', borderRadius: '50%', 
            backgroundColor: status === 'connected' ? COLORS.success : status === 'error' ? COLORS.danger : COLORS.warning,
            boxShadow: `0 0 8px ${status === 'connected' ? COLORS.success : status === 'error' ? COLORS.danger : COLORS.warning}`
          }} />
        </div>
      </div>
      
      {status === 'error' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: COLORS.danger }}>
          <WifiOff size={32} style={{ marginBottom: '8px' }} />
          <span>Mất kết nối</span>
        </div>
      ) : (
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.requestFullscreen) {
              target.requestFullscreen();
            }
          }}
        />
      )}
    </div>
  );
}
