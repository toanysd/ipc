'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Camera, Search, Play, Settings, Video, Wifi, 
  ShieldAlert, LayoutDashboard, Radio, HardDrive, Bell, Activity, Server,
  Lock, X, Maximize, Zap, CheckCircle, XCircle, Loader, Radar, Terminal, Globe
} from 'lucide-react';

interface ICamera {
  id: string;
  name: string;
  hardware: string;
  ip: string;
  port: string;
  serviceUrl: string;
  status: 'online' | 'offline';
  username?: string;
  password?: string;
  rtspUrl?: string;
  streamId?: string;
  hlsUrl?: string;
  recordId?: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<ICamera[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Live stream state
  const [activeCamera, setActiveCamera] = useState<ICamera | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authForm, setAuthForm] = useState({ user: 'admin', pass: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Recovery states for forgotten credentials
  const [isTryingDefaults, setIsTryingDefaults] = useState(false);
  const [defaultsProgress, setDefaultsProgress] = useState('');
  const [defaultsFailed, setDefaultsFailed] = useState(false);
  const [showResetGuide, setShowResetGuide] = useState(false);

  // Quick Access states (multi-strategy probe)
  const [isQuickAccessing, setIsQuickAccessing] = useState(false);
  const [quickAccessProgress, setQuickAccessProgress] = useState('');
  const [quickAccessResults, setQuickAccessResults] = useState<any[] | null>(null);

  // Deep Probe states
  const [isDeepProbing, setIsDeepProbing] = useState(false);
  const [deepProbeProgress, setDeepProbeProgress] = useState('');
  const [deepProbeResults, setDeepProbeResults] = useState<any | null>(null);

  // Manual camera state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: 'Camera thủ công',
    ip: '',
    port: '80',
    rtspUrl: '',
    user: '',
    pass: '',
    requiresAuth: false
  });

  const videoRef = useRef<HTMLImageElement>(null);

  const handleAddManualCamera = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.ip) return;
    
    let rtspUrl = manualForm.rtspUrl;
    if (!rtspUrl) {
      if (manualForm.requiresAuth && manualForm.user) {
        rtspUrl = `rtsp://${encodeURIComponent(manualForm.user)}:${encodeURIComponent(manualForm.pass)}@${manualForm.ip}:554/cam/realmonitor?channel=1&subtype=0`;
      } else {
        rtspUrl = `rtsp://${manualForm.ip}:554/cam/realmonitor?channel=1&subtype=0`;
      }
    }
    
    const newCam: ICamera = {
      id: `manual-${Date.now()}`,
      name: manualForm.name || 'Camera thủ công',
      hardware: 'Manual Entry',
      ip: manualForm.ip,
      port: manualForm.port || '80',
      serviceUrl: `http://${manualForm.ip}:${manualForm.port || '80'}/onvif/device_service`,
      status: 'online',
      username: manualForm.user || undefined,
      password: manualForm.pass || undefined,
      rtspUrl: rtspUrl
    };
    
    setCameras(prev => {
      const idx = prev.findIndex(c => c.ip === newCam.ip);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newCam;
        return updated;
      }
      return [...prev, newCam];
    });
    
    setShowManualModal(false);
    setManualForm({
      name: 'Camera thủ công',
      ip: '',
      port: '80',
      rtspUrl: '',
      user: '',
      pass: '',
      requiresAuth: false
    });
  };

  const scanNetwork = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi máy chủ khi quét mạng');
      }

      let cameraList: any[] = [];
      if (Array.isArray(data)) {
        cameraList = data;
      } else if (data.cameras && Array.isArray(data.cameras)) {
        cameraList = data.cameras;
      } else {
        throw new Error('Dữ liệu không đúng định dạng');
      }

      // Merge with existing cameras to preserve credentials
      setCameras(prev => {
        const merged = cameraList.map(newCam => {
          const id = newCam.id || newCam.ip;
          const status = newCam.status || 'online';
          const cam = { ...newCam, id, status };
          const existing = prev.find(c => c.ip === cam.ip);
          if (existing) {
            cam.username = existing.username;
            cam.password = existing.password;
            cam.rtspUrl = existing.rtspUrl;
            cam.streamId = existing.streamId;
            cam.hlsUrl = existing.hlsUrl;
            cam.recordId = existing.recordId;
          }
          return cam;
        });
        return merged;
      });
    } catch (err: any) {
      setError(err.message || 'Lỗi không xác định khi kết nối tới backend.');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    scanNetwork();
  }, []);

  const startStreamFromUrl = async (cam: ICamera, finalUrl: string, user: string, pass: string) => {
    setIsConnecting(true);
    setError(null);
    setCameras(prev => prev.map(c => 
      c.id === cam.id 
        ? { ...c, username: user, password: pass, rtspUrl: finalUrl }
        : c
    ));
    setActiveCamera({ ...cam, username: user, password: pass, rtspUrl: finalUrl });
    setShowAuthModal(false);
    setActiveTab('live');
    setIsConnecting(false);
    return true;
  };

  const tryDefaultCredentials = async () => {
    if (!activeCamera) return;
    setIsTryingDefaults(true);
    setDefaultsFailed(false);
    setDefaultsProgress('Khởi động quét tài khoản mặc định...');
    
    const defaultCreds = [
      { user: 'admin', pass: '' },
      { user: 'admin', pass: 'admin' },
      { user: 'admin', pass: '12345' },
      { user: 'admin', pass: '123456' },
      { user: 'admin', pass: '888888' },
      { user: 'admin', pass: '12345abc' },
      { user: 'admin', pass: 'password' },
      { user: 'admin', pass: '1234' },
      { user: 'admin', pass: '4321' },
      { user: 'root', pass: '' },
      { user: 'root', pass: 'root' },
      { user: 'root', pass: 'pass' },
      { user: 'root', pass: 'axis' },
      { user: 'service', pass: 'service' }
    ];

    for (let i = 0; i < defaultCreds.length; i++) {
      const cred = defaultCreds[i];
      setDefaultsProgress(`Đang thử (${i + 1}/${defaultCreds.length}): ${cred.user} / ${cred.pass || '(không mật khẩu)'}`);
      
      try {
        const res = await fetch('/api/camera/stream-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: activeCamera.ip,
            port: activeCamera.port,
            serviceUrl: activeCamera.serviceUrl,
            user: cred.user,
            pass: cred.pass
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.url) {
            setDefaultsProgress(`Thành công! Tài khoản: ${cred.user}`);
            setAuthForm({ user: cred.user, pass: cred.pass });
            await new Promise(resolve => setTimeout(resolve, 800));
            await startStreamFromUrl(activeCamera, data.url, cred.user, cred.pass);
            setIsTryingDefaults(false);
            return;
          }
        }
      } catch (err) {
        console.error('Lỗi khi thử tài khoản mặc định:', err);
      }
    }

    setDefaultsProgress('Không tìm thấy tài khoản mặc định phù hợp.');
    setDefaultsFailed(true);
    setShowResetGuide(true);
    setIsTryingDefaults(false);
  };

  // Multi-strategy Quick Access - no credentials needed
  const tryQuickAccess = async () => {
    if (!activeCamera) return;
    setIsQuickAccessing(true);
    setQuickAccessProgress('Đang dò tìm đa chiến lược...');
    setQuickAccessResults(null);

    try {
      const res = await fetch('/api/camera/quick-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: activeCamera.ip,
          port: activeCamera.port,
          serviceUrl: activeCamera.serviceUrl
        })
      });

      const data = await res.json();
      setQuickAccessResults(data.strategies || []);

      if (data.success) {
        // Find the first successful strategy with a usable URL
        const rtspStrategy = data.strategies.find((s: any) => s.success && (s.rtspUrl || s.rtspUrls));
        const mjpegStrategy = data.strategies.find((s: any) => s.success && s.mjpegUrl);
        const snapshotStrategy = data.strategies.find((s: any) => s.success && s.snapshotUrl);
        const successCount = data.strategies.filter((s: any) => s.success).length;

        if (rtspStrategy?.rtspUrl) {
          setQuickAccessProgress(`✅ Thành công! Tìm thấy luồng RTSP qua ${rtspStrategy.name}`);
          await new Promise(resolve => setTimeout(resolve, 600));
          await startStreamFromUrl(activeCamera, rtspStrategy.rtspUrl, '', '');
          setIsQuickAccessing(false);
          return;
        }

        if (mjpegStrategy?.mjpegUrl) {
          setQuickAccessProgress(`✅ Tìm thấy MJPEG stream! Đang mở...`);
          window.open(mjpegStrategy.mjpegUrl, '_blank');
          setIsQuickAccessing(false);
          return;
        }

        if (rtspStrategy?.rtspUrls?.length) {
          setQuickAccessProgress(`✅ Cổng RTSP mở! ${rtspStrategy.rtspUrls.length} đường dẫn có sẵn — chọn bên dưới.`);
          setIsQuickAccessing(false);
          return;
        }

        if (snapshotStrategy?.snapshotUrl) {
          setQuickAccessProgress(`✅ ${successCount} chiến lược thành công. Tìm thấy snapshot — xem bên dưới.`);
        } else {
          setQuickAccessProgress(`ℹ️ ${successCount} chiến lược có kết quả. Xem chi tiết bên dưới.`);
        }
      } else {
        setQuickAccessProgress('Không tìm thấy đường truy cập nhanh. Thử "Tài khoản mặc định" hoặc reset cứng.');
      }
    } catch (err: any) {
      setQuickAccessProgress(`Lỗi: ${err.message}`);
    }
    setIsQuickAccessing(false);
  };

  // Deep Probe - community techniques
  const tryDeepProbe = async () => {
    if (!activeCamera) return;
    setIsDeepProbing(true);
    setDeepProbeProgress('Đang quét cổng và phân tích sâu...');
    setDeepProbeResults(null);

    try {
      const res = await fetch('/api/camera/deep-probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: activeCamera.ip,
          port: activeCamera.port,
          serviceUrl: activeCamera.serviceUrl
        })
      });

      const data = await res.json();
      setDeepProbeResults(data);

      if (data.success) {
        const credProbe = data.probes?.find((p: any) => p.success && p.data?.user);
        if (credProbe) {
          setDeepProbeProgress(`🎉 Tìm thấy tài khoản: ${credProbe.data.user} / ${credProbe.data.pass || '(trống)'}`);
          setAuthForm({ user: credProbe.data.user, pass: credProbe.data.pass || '' });
        } else {
          const successCount = data.probes?.filter((p: any) => p.success).length || 0;
          setDeepProbeProgress(`✅ ${successCount} probe thành công. Xem kết quả bên dưới.`);
        }
      } else {
        setDeepProbeProgress('Không tìm thấy thêm thông tin. Cần reset cứng camera.');
      }
    } catch (err: any) {
      setDeepProbeProgress(`Lỗi: ${err.message}`);
    }
    setIsDeepProbing(false);
  };

  const handlePlayClick = async (cam: ICamera) => {
    setActiveCamera(cam);
    setIsRecording(!!cam.recordId);
    setAuthForm({ user: cam.username || 'admin', pass: cam.password || '' });
    setShowAuthModal(true);
    
    // Reset recovery states for new attempt
    setIsTryingDefaults(false);
    setDefaultsProgress('');
    setDefaultsFailed(false);
    setShowResetGuide(false);
    setIsQuickAccessing(false);
    setQuickAccessProgress('');
    setQuickAccessResults(null);
    setIsDeepProbing(false);
    setDeepProbeProgress('');
    setDeepProbeResults(null);
  };

  const connectStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCamera) return;
    
    let finalUrl = activeCamera.rtspUrl;
    if (finalUrl) {
      if (!finalUrl.includes('@') && finalUrl.startsWith('rtsp://')) {
        finalUrl = finalUrl.replace('rtsp://', `rtsp://${encodeURIComponent(authForm.user)}:${encodeURIComponent(authForm.pass)}@`);
      }
    } else {
      finalUrl = `rtsp://${encodeURIComponent(authForm.user)}:${encodeURIComponent(authForm.pass)}@${activeCamera.ip}:554/cam/realmonitor?channel=1&subtype=0`;
    }
    
    await startStreamFromUrl(activeCamera, finalUrl, authForm.user, authForm.pass);
  };

  const stopStream = async () => {
    setActiveCamera(null);
  };

  const toggleRecording = async () => {
    if (!activeCamera) return;
    try {
      setError(null);
      if (isRecording) {
        const res = await fetch('/api/record/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cameraId: activeCamera.id })
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Lỗi khi dừng ghi hình');
          setIsRecording(false);
          return;
        }
        setIsRecording(false);
        const updatedCam = { ...activeCamera, recordId: undefined };
        setActiveCamera(updatedCam);
        setCameras(prev => prev.map(c => c.id === updatedCam.id ? updatedCam : c));
      } else {
        const res = await fetch('/api/record/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cameraId: activeCamera.id, rtspUrl: activeCamera.rtspUrl })
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Lỗi khi bắt đầu ghi hình');
          return;
        }
        setIsRecording(true);
        const updatedCam = { ...activeCamera, recordId: 'recording' };
        setActiveCamera(updatedCam);
        setCameras(prev => prev.map(c => c.id === updatedCam.id ? updatedCam : c));
      }
    } catch (err: any) {
      console.error('Lỗi khi thay đổi trạng thái ghi hình', err);
      setError(err.message || 'Lỗi không xác định khi ghi hình');
    }
  };

  // Removed HLS useEffect

  const onlineCount = cameras.filter(c => c.status === 'online').length;

  return (
    <div className="app-container">
      {/* Sidebar - Desktop Only */}
      <aside className="sidebar">
        <div className="brand">
          <ShieldAlert className="brand-icon" size={28} />
          <h1>Đại Cung Điện</h1>
        </div>
        
        <nav className="nav-menu">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={20} />
            <span>Tổng quan</span>
          </div>
          <div className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            <Radio size={20} />
            <span>Live View</span>
          </div>
          <div className={`nav-item ${activeTab === 'recordings' ? 'active' : ''}`} onClick={() => setActiveTab('recordings')}>
            <HardDrive size={20} />
            <span>Lưu trữ</span>
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <Settings size={20} />
            <span>Cài đặt</span>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <h2 className="page-title">
            {activeTab === 'dashboard' && 'Tổng quan hệ thống'}
            {activeTab === 'live' && 'Giám sát trực tiếp'}
            {activeTab === 'recordings' && 'Dữ liệu lưu trữ'}
            {activeTab === 'settings' && 'Cài đặt hệ thống'}
          </h2>
          <div className="topbar-actions">
            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%' }}>
              <Bell size={20} />
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowManualModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Camera size={18} />
              <span className="hide-mobile">Thêm thủ công</span>
            </button>
            <button 
              className="btn btn-primary" 
              onClick={scanNetwork} 
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <div className="spinner" />
                  <span className="hide-mobile">Đang quét...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span className="hide-mobile">Quét mạng</span>
                </>
              )}
            </button>
          </div>
        </header>

        <div className="content-scroll">
          {error && (
            <div className="glass-panel animate-fade-in" style={{ borderLeft: '4px solid var(--danger)', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--danger)' }}>
                <ShieldAlert size={24} />
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <div className="animate-fade-in">
              {/* Stats Overview */}
              <div className="stats-grid">
                <div className="glass-panel stat-card">
                  <div className="stat-icon">
                    <Server size={28} />
                  </div>
                  <div className="stat-info">
                    <h3>{cameras.length}</h3>
                    <p>Tổng số Camera</p>
                  </div>
                </div>
                <div className="glass-panel stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(46, 160, 67, 0.1)', color: 'var(--accent)' }}>
                    <Activity size={28} />
                  </div>
                  <div className="stat-info">
                    <h3>{onlineCount}</h3>
                    <p>Đang hoạt động</p>
                  </div>
                </div>
              </div>

              {/* Camera Grid */}
              <div className="camera-grid">
                {cameras.length === 0 && !isScanning && !error ? (
                  <div className="glass-panel" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 1rem' }}>
                    <Wifi size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Không tìm thấy thiết bị nào</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Hệ thống đang rảnh. Hãy đảm bảo mạng có kết nối tới Camera và thử quét lại.</p>
                  </div>
                ) : (
                  cameras.map((cam, idx) => (
                    <div key={cam.id} className="glass-panel camera-card animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                      <div className="camera-preview">
                        <Camera size={48} className="camera-icon-large" />
                        <div className="status-badge">
                          <div className={`status-dot ${cam.status === 'offline' ? 'offline' : ''}`} />
                          {cam.status === 'online' ? 'Trực tuyến' : 'Mất kết nối'}
                        </div>
                      </div>
                      <div className="camera-info">
                        <div className="camera-header">
                          <h3 className="camera-name" title={cam.name}>{cam.name}</h3>
                        </div>
                        <div className="camera-ip">
                          <Server size={14} />
                          {cam.ip}:{cam.port}
                        </div>
                        <p className="camera-hardware">Model: {cam.hardware}</p>
                        
                        <div className="camera-actions">
                          <button className="btn-icon" title="Xem Camera" onClick={() => handlePlayClick(cam)}>
                            <Play size={18} />
                          </button>
                          <button className="btn-icon" title="Ghi hình thủ công">
                            <Video size={18} />
                          </button>
                          <button className="btn-icon" title="Cấu hình thiết bị">
                            <Settings size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* LIVE VIEW */}
          {activeTab === 'live' && (
            <div className="animate-fade-in">
              {activeCamera && activeCamera.rtspUrl ? (
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{activeCamera.name}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Đang phát luồng trực tiếp (MJPEG Proxy)</p>
                    </div>
                    <button className="btn btn-secondary" onClick={stopStream}>
                      <X size={20} />
                    </button>
                  </div>
                  
                  {/* MJPEG Stream Container */}
                  <div style={{ width: '100%', backgroundColor: '#000', aspectRatio: '16/9', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img 
                      ref={videoRef}
                      src={`/api/stream?url=${encodeURIComponent(activeCamera.rtspUrl)}`} 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        const errText = document.getElementById('stream-error');
                        if (errText) errText.style.display = 'flex';
                      }}
                    />
                    <div id="stream-error" style={{ position: 'absolute', display: 'none', flexDirection: 'column', alignItems: 'center', color: 'var(--danger)', background: 'rgba(0,0,0,0.5)', padding: '2rem', borderRadius: '8px' }}>
                      <ShieldAlert size={48} style={{ marginBottom: '1rem' }} />
                      <p>Mất tín hiệu hoặc không thể giải mã luồng video.</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vui lòng kiểm tra lại tài khoản hoặc kết nối mạng.</p>
                    </div>
                  </div>
                  
                  <div style={{ padding: '1.5rem', display: 'flex', gap: '1rem', background: 'var(--surface)', alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.requestFullscreen().catch(err => console.error(err));
                      }
                    }}><Maximize size={18} /> Toàn màn hình</button>
                    {isRecording ? (
                      <>
                        <button className="btn btn-secondary" onClick={toggleRecording} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                          <Video size={18} className="recording-indicator" /> Dừng ghi
                        </button>
                        <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="status-dot offline" style={{ animation: 'pulse 1s infinite' }} /> Đang ghi hình
                        </span>
                      </>
                    ) : (
                      <button className="btn btn-secondary" onClick={toggleRecording}>
                        <Video size={18} /> Bắt đầu ghi
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-panel empty-state">
                  <Radio size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto' }} />
                  <h3>Chưa chọn Camera</h3>
                  <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
                    Quay lại bảng Tổng quan và chọn biểu tượng "Xem Camera" để bắt đầu giám sát trực tiếp.
                  </p>
                  <button className="btn btn-primary" onClick={() => setActiveTab('dashboard')} style={{ marginTop: '1.5rem' }}>
                    <LayoutDashboard size={18} /> Về Tổng quan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* OTHER TABS */}
          {(activeTab === 'recordings' || activeTab === 'settings') && (
            <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <Settings size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto', opacity: 0.5 }} />
              <h3>Module đang được phát triển</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Tính năng này sẽ sớm được hoàn thiện trong phiên bản tới.</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Nav - Mobile Only */}
      <nav className="bottom-nav">
        <div className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={22} />
          <span>Tổng quan</span>
        </div>
        <div className={`bottom-nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
          <Radio size={22} />
          <span>Live</span>
        </div>
        <div className={`bottom-nav-item ${activeTab === 'recordings' ? 'active' : ''}`} onClick={() => setActiveTab('recordings')}>
          <HardDrive size={22} />
          <span>Lưu trữ</span>
        </div>
        <div className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <Settings size={22} />
          <span>Cài đặt</span>
        </div>
      </nav>

      {/* Auth Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '460px', border: '1px solid var(--primary)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Lock size={20} className="brand-icon" /> Xác thực Camera</h3>
              <button className="btn-icon" onClick={() => setShowAuthModal(false)}><X size={18} /></button>
            </div>

            {/* Quick Access - Primary Action */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(46,213,115,0.1), rgba(30,144,255,0.1))',
              border: '1px solid rgba(46,213,115,0.3)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Zap size={18} style={{ color: '#2ed573' }} />
                <strong style={{ fontSize: '0.95rem' }}>Truy cập nhanh (không cần mật khẩu)</strong>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.8rem 0' }}>
                Tự động dò tìm luồng video qua ONVIF, RTSP, HTTP mà không cần đăng nhập.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #2ed573, #1e90ff)' }}
                onClick={tryQuickAccess}
                disabled={isQuickAccessing || isTryingDefaults || isConnecting}
              >
                {isQuickAccessing ? <Loader size={16} className="spin" /> : <Zap size={16} />}
                {isQuickAccessing ? 'Đang dò tìm...' : '⚡ Truy cập nhanh'}
              </button>

              {/* Quick Access Progress */}
              {quickAccessProgress && (
                <div style={{
                  marginTop: '0.6rem',
                  padding: '0.6rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: quickAccessProgress.startsWith('✅') ? '#2ed573' : (quickAccessProgress.startsWith('Lỗi') ? 'var(--danger)' : 'var(--text-muted)')
                }}>
                  {quickAccessProgress}
                </div>
              )}

              {/* Quick Access Results */}
              {quickAccessResults && quickAccessResults.length > 0 && (
                <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {quickAccessResults.map((s: any, idx: number) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      background: 'rgba(0,0,0,0.15)',
                      borderRadius: '6px',
                      fontSize: '0.75rem'
                    }}>
                      {s.success
                        ? <CheckCircle size={14} style={{ color: '#2ed573', flexShrink: 0 }} />
                        : <XCircle size={14} style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }} />
                      }
                      <span style={{ color: s.success ? '#fff' : 'var(--text-muted)', flex: 1 }}>{s.name}</span>
                      {s.success && s.rtspUrl && (
                        <button
                          type="button"
                          onClick={() => startStreamFromUrl(activeCamera!, s.rtspUrl, '', '')}
                          style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}
                        >
                          ▶ Mở
                        </button>
                      )}
                      {s.success && s.mjpegUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(s.mjpegUrl, '_blank')}
                          style={{ background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffa500', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}
                        >
                          🎥 MJPEG
                        </button>
                      )}
                      {s.success && s.rtspUrls && (
                        <span style={{ color: '#2ed573', fontSize: '0.7rem', flexShrink: 0 }}>{s.rtspUrls.length} URLs</span>
                      )}
                      {s.success && s.snapshotUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(s.snapshotUrl, '_blank')}
                          style={{ background: 'rgba(30,144,255,0.2)', border: '1px solid rgba(30,144,255,0.4)', color: '#1e90ff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}
                        >
                          📷 Xem
                        </button>
                      )}
                      {s.success && s.info && !s.rtspUrl && !s.mjpegUrl && !s.snapshotUrl && !s.rtspUrls && (
                        <span style={{ color: '#ffa500', fontSize: '0.65rem', flexShrink: 0 }}>ℹ️ {s.info}</span>
                      )}
                    </div>
                  ))}

                  {/* Show clickable RTSP URLs if strategy 3 returned candidates */}
                  {quickAccessResults.find((s: any) => s.success && s.rtspUrls)?.rtspUrls && (
                    <div style={{ marginTop: '0.3rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                      <strong style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>RTSP URLs có thể dùng:</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {quickAccessResults.find((s: any) => s.success && s.rtspUrls).rtspUrls.map((url: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => startStreamFromUrl(activeCamera!, url, '', '')}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid var(--border)',
                              color: '#1e90ff',
                              padding: '0.3rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              textAlign: 'left',
                              wordBreak: 'break-all'
                            }}
                          >
                            ▶ {url}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deep Probe Panel */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,0,128,0.08))',
              border: '1px solid rgba(255,165,0,0.25)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Radar size={18} style={{ color: '#ffa500' }} />
                <strong style={{ fontSize: '0.95rem' }}>Dò sâu (Deep Probe)</strong>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.8rem 0' }}>
                Quét toàn bộ cổng, nhận diện hãng, thử Telnet/SSH, giao thức riêng, phân tích trang web.
              </p>
              <button
                type="button"
                className="btn"
                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #ffa500, #ff6b81)', border: 'none', color: '#fff', cursor: 'pointer' }}
                onClick={tryDeepProbe}
                disabled={isDeepProbing || isQuickAccessing || isTryingDefaults}
              >
                {isDeepProbing ? <Loader size={16} className="spin" /> : <Radar size={16} />}
                {isDeepProbing ? 'Đang dò sâu...' : '🔍 Dò sâu (Deep Probe)'}
              </button>

              {deepProbeProgress && (
                <div style={{
                  marginTop: '0.6rem', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.8rem',
                  color: deepProbeProgress.startsWith('🎉') || deepProbeProgress.startsWith('✅') ? '#2ed573' : 'var(--text-muted)'
                }}>
                  {deepProbeProgress}
                </div>
              )}

              {deepProbeResults && deepProbeResults.probes && (
                <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {/* Device type + Brand detection */}
                  {deepProbeResults.probes?.some((p: any) => p.data?.deviceType === 'router') && (
                    <div style={{ padding: '0.6rem', background: 'rgba(255,80,0,0.15)', border: '1px solid rgba(255,80,0,0.3)', borderRadius: '8px', fontSize: '0.8rem' }}>
                      <div style={{ color: '#ff5000', fontWeight: 700, marginBottom: '0.3rem' }}>⚠️ ĐÂY LÀ ROUTER, KHÔNG PHẢI CAMERA!</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: '1.5' }}>
                        Thiết bị tại IP này là router/ONU. Camera thực sự có thể ở IP khác trong mạng.
                        Đăng nhập vào router để xem danh sách thiết bị kết nối và tìm IP camera.
                      </div>
                      {deepProbeResults.probes?.find((p: any) => p.data?.detectedModel?.toUpperCase().includes('NSD-G')) && (
                        <div style={{ marginTop: '0.4rem', padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.7rem', color: '#ffa500', lineHeight: '1.5' }}>
                          📌 <strong>Sony NSD-G1000T (NURO光)</strong><br/>
                          • Tên đăng nhập: <strong>admin</strong><br/>
                          • Mật khẩu: <strong>WPA Key</strong> in trên nhãn ở <strong>mặt đáy</strong> router<br/>
                          • Reset: giữ nút RESET ~10 giây bằng kẹp giấy
                        </div>
                      )}
                      <button type="button" onClick={() => {
                        setAuthForm({ user: 'admin', pass: '' });
                        setDeepProbeProgress('Đã điền admin — nhập WPA Key từ nhãn đáy router làm mật khẩu');
                      }} style={{ marginTop: '0.4rem', background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffa500', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                        🔑 Điền admin + nhập WPA Key thủ công
                      </button>
                    </div>
                  )}
                  {deepProbeResults.brand && deepProbeResults.brand !== 'Unknown' && !deepProbeResults.probes?.some((p: any) => p.data?.deviceType === 'router') && (
                    <div style={{ padding: '0.5rem', background: 'rgba(255,165,0,0.15)', borderRadius: '6px', fontSize: '0.8rem', color: '#ffa500', fontWeight: 600 }}>
                      📌 Hãng phát hiện: {deepProbeResults.brand}
                    </div>
                  )}

                  {/* Probe results */}
                  {deepProbeResults.probes.map((p: any, idx: number) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                      padding: '0.5rem 0.6rem', background: 'rgba(0,0,0,0.15)',
                      borderRadius: '6px', fontSize: '0.75rem'
                    }}>
                      {p.success
                        ? <CheckCircle size={14} style={{ color: '#2ed573', flexShrink: 0, marginTop: '1px' }} />
                        : <XCircle size={14} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0, marginTop: '1px' }} />
                      }
                      <div style={{ flex: 1 }}>
                        <div style={{ color: p.success ? '#fff' : 'var(--text-muted)' }}>{p.name}</div>
                        {p.success && p.info && (
                          <div style={{ color: '#2ed573', fontSize: '0.7rem', marginTop: '2px', wordBreak: 'break-all' }}>{p.info}</div>
                        )}

                        {/* Action buttons based on probe type */}
                        {p.success && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>

                            {/* Credentials found → fill form + auto-login */}
                            {p.data?.user && (
                              <>
                                <button type="button" onClick={() => {
                                  setAuthForm({ user: p.data.user, pass: p.data.pass || '' });
                                  setDeepProbeProgress(`Đã điền tài khoản: ${p.data.user}`);
                                }} style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                  ✅ Điền tài khoản
                                </button>
                                {p.data.url && (
                                  <button type="button" onClick={() => window.open(p.data.url, '_blank')}
                                    style={{ background: 'rgba(30,144,255,0.2)', border: '1px solid rgba(30,144,255,0.4)', color: '#1e90ff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                    🌐 Mở trang
                                  </button>
                                )}
                              </>
                            )}

                            {/* Port scan → show open ports with quick actions */}
                            {p.data?.openPorts && (
                              <>
                                {p.data.openPorts.some((op: any) => op.service === 'HTTP' || op.service === 'HTTP Alt' || op.service === 'HTTP Proxy') && (
                                  <button type="button" onClick={() => {
                                    const httpPort = p.data.openPorts.find((op: any) => op.service.startsWith('HTTP'));
                                    window.open(`http://${activeCamera?.ip}:${httpPort.port}/`, '_blank');
                                  }} style={{ background: 'rgba(30,144,255,0.2)', border: '1px solid rgba(30,144,255,0.4)', color: '#1e90ff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                    🌐 Mở Web
                                  </button>
                                )}
                                {p.data.openPorts.some((op: any) => op.service === 'RTSP' || op.service === 'RTSP Alt') && (
                                  <button type="button" onClick={() => {
                                    const rtspPort = p.data.openPorts.find((op: any) => op.service.startsWith('RTSP'));
                                    startStreamFromUrl(activeCamera!, `rtsp://${activeCamera?.ip}:${rtspPort.port}/`, '', '');
                                  }} style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                    ▶ Thử RTSP
                                  </button>
                                )}
                              </>
                            )}

                            {/* Telnet open → show connection info */}
                            {p.data?.method === 'telnet' && (
                              <>
                                <button type="button" onClick={() => {
                                  navigator.clipboard.writeText(`telnet ${activeCamera?.ip} 23`);
                                  setDeepProbeProgress('📋 Đã copy lệnh telnet!');
                                }} style={{ background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffa500', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                  📋 Copy lệnh Telnet
                                </button>
                                {p.data.suggestedCreds && p.data.suggestedCreds.length > 0 && (
                                  <button type="button" onClick={() => {
                                    const c = p.data.suggestedCreds[0];
                                    setAuthForm({ user: c.user, pass: c.pass });
                                    setDeepProbeProgress(`Đã điền: ${c.user} / ${c.pass || '(trống)'} — thử Đăng nhập`);
                                  }} style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                    🔑 Thử {p.data.suggestedCreds[0]?.user}/{p.data.suggestedCreds[0]?.pass || '""'}
                                  </button>
                                )}
                              </>
                            )}

                            {/* XM knock success */}
                            {p.data?.method === 'xm_knock' && p.data?.suggestedCreds && (
                              <button type="button" onClick={() => {
                                setAuthForm({ user: p.data.suggestedCreds.user, pass: p.data.suggestedCreds.pass });
                                setDeepProbeProgress(`Đã điền: ${p.data.suggestedCreds.user} / ${p.data.suggestedCreds.pass}`);
                              }} style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                🔑 Dùng root/xmhdipc
                              </button>
                            )}

                            {/* SSH open */}
                            {p.data?.method === 'ssh' && (
                              <button type="button" onClick={() => {
                                navigator.clipboard.writeText(`ssh root@${activeCamera?.ip}`);
                                setDeepProbeProgress('📋 Đã copy lệnh SSH!');
                              }} style={{ background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffa500', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                📋 Copy lệnh SSH
                              </button>
                            )}

                            {/* Proprietary protocol → brand-specific reset advice */}
                            {p.data?.brand && p.data?.resetAdvice && (
                              <button type="button" onClick={() => {
                                setDeepProbeProgress(`📱 ${p.data.resetAdvice}`);
                              }} style={{ background: 'rgba(30,144,255,0.2)', border: '1px solid rgba(30,144,255,0.4)', color: '#1e90ff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                📱 Hướng dẫn reset {p.data.brand}
                              </button>
                            )}

                            {/* Web login found → open it */}
                            {p.data?.url && !p.data?.user && (
                              <button type="button" onClick={() => window.open(p.data.url, '_blank')}
                                style={{ background: 'rgba(30,144,255,0.2)', border: '1px solid rgba(30,144,255,0.4)', color: '#1e90ff', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                🌐 Mở trang quản trị
                              </button>
                            )}

                            {/* Web has forgot password */}
                            {p.data?.hasForgotPw && (
                              <button type="button" onClick={() => window.open(p.data.url, '_blank')}
                                style={{ background: 'rgba(255,215,0,0.2)', border: '1px solid rgba(255,215,0,0.4)', color: '#ffd700', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                🔑 Quên mật khẩu
                              </button>
                            )}

                            {/* Web has video embed */}
                            {p.data?.hasVideoEmbed && (
                              <button type="button" onClick={() => window.open(p.data.url, '_blank')}
                                style={{ background: 'rgba(46,213,115,0.2)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                🎥 Xem video trên web
                              </button>
                            )}

                            {/* Device info with serial → suggest SADP/ConfigTool */}
                            {p.data?.serial && (
                              <button type="button" onClick={() => {
                                navigator.clipboard.writeText(p.data.serial);
                                setDeepProbeProgress(`📋 Đã copy SN: ${p.data.serial} — dùng cho SADP/ConfigTool`);
                              }} style={{ background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffa500', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>
                                📋 Copy Serial Number
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Actionable advice */}
                  {deepProbeResults.advice && deepProbeResults.advice.length > 0 && (
                    <div style={{ marginTop: '0.3rem', padding: '0.6rem', background: 'rgba(30,144,255,0.1)', border: '1px solid rgba(30,144,255,0.2)', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '0.75rem', color: '#1e90ff', display: 'block', marginBottom: '0.3rem' }}>💡 Khuyến nghị:</strong>
                      {deepProbeResults.advice.map((a: string, i: number) => (
                        <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.15rem 0', lineHeight: '1.4' }}>
                          {a}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span>hoặc đăng nhập thủ công</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Camera <strong>{activeCamera?.name}</strong> — nhập tài khoản nếu bạn biết.
            </p>
            <form onSubmit={connectStream} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="auth-username" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Tên đăng nhập</label>
                <input 
                  id="auth-username"
                  type="text" 
                  value={authForm.user}
                  onChange={e => setAuthForm({...authForm, user: e.target.value})}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>
              <div>
                <label htmlFor="auth-password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Mật khẩu (Wifi/Camera)</label>
                <input 
                  id="auth-password"
                  type="password" 
                  value={authForm.pass}
                  onChange={e => setAuthForm({...authForm, pass: e.target.value})}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>

              {/* Progress Indicator */}
              {(isTryingDefaults || defaultsProgress) && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: '1px dashed var(--border)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: isTryingDefaults ? 'var(--primary)' : (defaultsFailed ? 'var(--danger)' : 'var(--accent)')
                }}>
                  {isTryingDefaults && <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid transparent', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }} />}
                  <span>{defaultsProgress}</span>
                </div>
              )}

              {/* Recovery Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={tryDefaultCredentials}
                  disabled={isTryingDefaults || isConnecting}
                >
                  <Lock size={16} /> Thử tài khoản mặc định
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', fontSize: '0.9rem' }}
                  onClick={async () => {
                    if (!activeCamera) return;
                    let finalUrl = activeCamera.rtspUrl;
                    if (finalUrl) {
                      if (finalUrl.includes('@')) {
                        const parts = finalUrl.split('@');
                        finalUrl = 'rtsp://' + parts[1];
                      }
                    } else {
                      finalUrl = `rtsp://${activeCamera.ip}:554/cam/realmonitor?channel=1&subtype=0`;
                    }
                    await startStreamFromUrl(activeCamera, finalUrl, '', '');
                  }}
                  disabled={isTryingDefaults}
                >
                  Mở trực tiếp
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', fontSize: '0.9rem' }} 
                  disabled={isConnecting || isTryingDefaults}
                >
                  {isConnecting ? 'Kết nối...' : 'Đăng nhập'}
                </button>
              </div>

              {/* Expandable Reset Guide */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowResetGuide(!showResetGuide)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: 0,
                    width: '100%',
                    textAlign: 'left',
                    fontWeight: 500
                  }}
                >
                  <span style={{ transform: showResetGuide ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                  Quên mật khẩu? Hướng dẫn khôi phục cài đặt gốc
                </button>

                {showResetGuide && (
                  <div className="animate-fade-in" style={{
                    marginTop: '0.8rem',
                    padding: '0.8rem',
                    background: 'rgba(235, 87, 87, 0.05)',
                    border: '1px solid rgba(235, 87, 87, 0.2)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    lineHeight: '1.4',
                    color: 'var(--text-muted)'
                  }}>
                    <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '0.5rem' }}>Các bước thực hiện Reset Cứng Camera:</strong>
                    <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: 0 }}>
                      <li>
                        <strong>Tìm nút Reset:</strong> Thường ở mặt dưới camera, cạnh khe cắm thẻ nhớ, hoặc trên dây cáp kết nối.
                      </li>
                      <li>
                        <strong>Cắm nguồn điện:</strong> Đảm bảo camera được cấp điện và đang hoạt động bình thường.
                      </li>
                      <li>
                        <strong>Nhấn và giữ:</strong> Dùng que chọc hoặc ngón tay ấn giữ nút Reset từ <strong>10 đến 15 giây</strong> đến khi nghe tiếng bíp hoặc camera nháy đèn khởi động lại.
                      </li>
                      <li>
                        <strong>Chờ hoàn tất:</strong> Chờ camera khởi động lại hoàn toàn (1-2 phút). Sau đó quét lại mạng và đăng nhập bằng <strong>tài khoản mặc định</strong> ở trên.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Add Camera Modal */}
      {showManualModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '450px', border: '1px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Camera size={20} className="brand-icon" /> Thêm Camera thủ công</h3>
              <button className="btn-icon" onClick={() => setShowManualModal(false)}><X size={18} /></button>
            </div>
            
            <form onSubmit={handleAddManualCamera} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="manual-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Tên Camera</label>
                <input 
                  id="manual-name"
                  type="text" 
                  value={manualForm.name}
                  onChange={e => setManualForm({...manualForm, name: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                  required
                />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 3 }}>
                  <label htmlFor="manual-ip" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Địa chỉ IP</label>
                  <input 
                    id="manual-ip"
                    type="text" 
                    placeholder="Ví dụ: 192.168.1.10"
                    value={manualForm.ip}
                    onChange={e => setManualForm({...manualForm, ip: e.target.value})}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="manual-port" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Cổng ONVIF</label>
                  <input 
                    id="manual-port"
                    type="text" 
                    value={manualForm.port}
                    onChange={e => setManualForm({...manualForm, port: e.target.value})}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="manual-rtsp" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Đường dẫn RTSP (Tùy chọn)</label>
                <input 
                  id="manual-rtsp"
                  type="text" 
                  placeholder="Để trống để tự động sinh"
                  value={manualForm.rtspUrl}
                  onChange={e => setManualForm({...manualForm, rtspUrl: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input 
                  id="manual-auth"
                  type="checkbox" 
                  checked={manualForm.requiresAuth}
                  onChange={e => setManualForm({...manualForm, requiresAuth: e.target.checked})}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="manual-auth" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Yêu cầu tài khoản đăng nhập</label>
              </div>

              {manualForm.requiresAuth && (
                <div className="animate-fade-in" style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="manual-user" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tên đăng nhập</label>
                    <input 
                      id="manual-user"
                      type="text" 
                      value={manualForm.user}
                      onChange={e => setManualForm({...manualForm, user: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="manual-pass" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mật khẩu</label>
                    <input 
                      id="manual-pass"
                      type="password" 
                      value={manualForm.pass}
                      onChange={e => setManualForm({...manualForm, pass: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', outline: 'none', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%' }}>
                Thêm vào danh sách
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
