'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, RefreshCw, Radio, Wifi, WifiOff, Monitor, AlertCircle, Copy, Check } from 'lucide-react';

declare global {
  interface Window {
    Peer: any;
  }
}

interface DeviceInfo {
  hostname: string;
  ip: string;
  port?: number;
}

export default function EmitterPage() {
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [managerConnected, setManagerConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ hostname: '...', ip: '...' });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [peerJsLoaded, setPeerJsLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const mediaConnRef = useRef<any>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load PeerJS script
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Peer) {
      setPeerJsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      setPeerJsLoaded(true);
    };
    script.onerror = () => {
      setErrorMessage('Không thể tải thư viện PeerJS. Kiểm tra kết nối mạng.');
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDeviceInfo = useCallback(async (): Promise<DeviceInfo> => {
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        const info: DeviceInfo = {
          hostname: data.hostname || data.deviceName || 'Unknown',
          ip: data.ip || data.ipAddress || data.localIp || 'Unknown',
          port: data.port,
        };
        setDeviceInfo(info);
        return info;
      }
    } catch {
      // Fallback
    }
    const fallback: DeviceInfo = { hostname: 'Unknown', ip: 'Unknown' };
    setDeviceInfo(fallback);
    return fallback;
  }, []);

  const connectToManager = useCallback((peer: any, stream: MediaStream, info: DeviceInfo) => {
    if (!peer || peer.destroyed) return;

    try {
      // Data channel
      const dataConn = peer.connect('ipc-manager-master', { reliable: true });
      dataConnRef.current = dataConn;

      dataConn.on('open', () => {
        setManagerConnected(true);
        setErrorMessage('');
        dataConn.send({
          type: 'device-info',
          hostname: info.hostname,
          ip: info.ip,
          port: info.port,
          peerId: peer.id,
        });
      });

      dataConn.on('close', () => {
        setManagerConnected(false);
        setStreaming(false);
      });

      dataConn.on('error', () => {
        setManagerConnected(false);
      });

      // Media call
      const mediaConn = peer.call('ipc-manager-master', stream);
      mediaConnRef.current = mediaConn;

      if (mediaConn) {
        mediaConn.on('stream', () => {
          // Manager might send back a stream (unlikely but handle)
        });

        mediaConn.on('close', () => {
          setStreaming(false);
        });

        mediaConn.on('error', () => {
          setStreaming(false);
        });

        setStreaming(true);
      }
    } catch (err: any) {
      setErrorMessage('Lỗi kết nối tới Manager: ' + (err?.message || 'Unknown'));
    }
  }, []);

  const initializePeer = useCallback((stream: MediaStream) => {
    if (!window.Peer) return;

    // Destroy existing peer
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    const peer = new window.Peer(undefined, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peerRef.current = peer;

    peer.on('open', async (id: string) => {
      setPeerId(id);
      setPeerConnected(true);
      setErrorMessage('');
      setReconnecting(false);

      const info = await fetchDeviceInfo();
      connectToManager(peer, stream, info);
    });

    peer.on('disconnected', () => {
      setPeerConnected(false);
      setManagerConnected(false);
      setStreaming(false);

      // Try to reconnect peer to signaling server
      if (peer && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // Will be handled by auto-reconnect timer
        }
      }
    });

    peer.on('close', () => {
      setPeerConnected(false);
      setManagerConnected(false);
      setStreaming(false);
      setPeerId('');
    });

    peer.on('error', (err: any) => {
      const errType = err?.type || '';
      if (errType === 'peer-unavailable') {
        setErrorMessage('Manager (ipc-manager-master) chưa sẵn sàng. Sẽ thử lại...');
        setManagerConnected(false);
        setStreaming(false);
      } else if (errType === 'network') {
        setErrorMessage('Lỗi mạng. Đang thử kết nối lại...');
        setPeerConnected(false);
      } else if (errType === 'server-error') {
        setErrorMessage('Lỗi PeerJS server. Đang thử kết nối lại...');
        setPeerConnected(false);
      } else {
        setErrorMessage(`Lỗi PeerJS: ${err?.message || errType}`);
      }
    });

    // Handle incoming connections from manager
    peer.on('connection', (conn: any) => {
      conn.on('data', (data: any) => {
        if (data?.type === 'command') {
          // Handle commands from manager if needed
          console.log('[Emitter] Received command:', data);
        }
      });
    });
  }, [fetchDeviceInfo, connectToManager]);

  // Auto-reconnect timer
  useEffect(() => {
    if (!webcamActive || !peerJsLoaded) return;

    reconnectTimerRef.current = setInterval(() => {
      const peer = peerRef.current;
      const stream = streamRef.current;

      if (!stream) return;

      // If peer is dead, reinitialize
      if (!peer || peer.destroyed) {
        setReconnecting(true);
        initializePeer(stream);
        return;
      }

      // If peer is alive but manager not connected, retry
      if (peer && !peer.destroyed && peer.open && !managerConnected) {
        setReconnecting(true);
        fetchDeviceInfo().then((info) => {
          connectToManager(peer, stream, info);
          setReconnecting(false);
        });
      }
    }, 30000);

    return () => {
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [webcamActive, peerJsLoaded, managerConnected, initializePeer, fetchDeviceInfo, connectToManager]);

  const startWebcam = async () => {
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      setWebcamStream(stream);
      streamRef.current = stream;
      setWebcamActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Initialize PeerJS after webcam is ready
      if (peerJsLoaded) {
        initializePeer(stream);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Quyền truy cập camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('Không tìm thấy webcam. Vui lòng kết nối camera và thử lại.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMessage('Camera đang được sử dụng bởi ứng dụng khác. Đóng ứng dụng đó và thử lại.');
      } else {
        setErrorMessage(`Lỗi khi bật webcam: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (mediaConnRef.current) {
      mediaConnRef.current.close();
      mediaConnRef.current = null;
    }
    if (dataConnRef.current) {
      dataConnRef.current.close();
      dataConnRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setWebcamStream(null);
    streamRef.current = null;
    setWebcamActive(false);
    setPeerConnected(false);
    setPeerId('');
    setManagerConnected(false);
    setStreaming(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setErrorMessage('');

    const stream = streamRef.current;
    if (!stream) {
      setReconnecting(false);
      setErrorMessage('Webcam chưa được bật. Vui lòng bật webcam trước.');
      return;
    }

    // Close existing connections
    if (mediaConnRef.current) {
      mediaConnRef.current.close();
      mediaConnRef.current = null;
    }
    if (dataConnRef.current) {
      dataConnRef.current.close();
      dataConnRef.current = null;
    }

    const peer = peerRef.current;
    if (peer && !peer.destroyed && peer.open) {
      const info = await fetchDeviceInfo();
      connectToManager(peer, stream, info);
      setReconnecting(false);
    } else {
      // Reinitialize peer entirely
      if (peer) peer.destroy();
      initializePeer(stream);
      setTimeout(() => setReconnecting(false), 3000);
    }
  };

  const copyPeerId = () => {
    if (peerId) {
      navigator.clipboard.writeText(peerId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // Styles
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0c10 0%, #161b22 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    } as React.CSSProperties,
    card: {
      background: 'rgba(22, 27, 34, 0.6)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '32px',
      width: '100%',
      maxWidth: '560px',
    } as React.CSSProperties,
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '4px',
    } as React.CSSProperties,
    title: {
      fontSize: '22px',
      fontWeight: 700,
      color: '#f0f6fc',
      margin: 0,
    } as React.CSSProperties,
    subtitle: {
      fontSize: '14px',
      color: '#8b949e',
      margin: '0 0 24px 0',
    } as React.CSSProperties,
    videoContainer: {
      position: 'relative' as const,
      width: '100%',
      aspectRatio: '16/9',
      background: '#0d1117',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      marginBottom: '24px',
    } as React.CSSProperties,
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      transform: 'scaleX(-1)',
    } as React.CSSProperties,
    videoPlaceholder: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      color: '#484f58',
    } as React.CSSProperties,
    liveIndicator: {
      position: 'absolute' as const,
      top: '12px',
      right: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 600,
    } as React.CSSProperties,
    statusSection: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '10px',
      marginBottom: '24px',
    } as React.CSSProperties,
    statusRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.04)',
    } as React.CSSProperties,
    statusLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '14px',
      color: '#f0f6fc',
    } as React.CSSProperties,
    statusRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
    } as React.CSSProperties,
    dot: (active: boolean) => ({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: active ? '#2ea043' : '#484f58',
      boxShadow: active ? '0 0 8px rgba(46, 160, 67, 0.5)' : 'none',
      flexShrink: 0,
    }) as React.CSSProperties,
    peerIdBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: 'rgba(88, 166, 255, 0.1)',
      color: '#58a6ff',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      cursor: 'pointer',
      border: '1px solid rgba(88, 166, 255, 0.2)',
      transition: 'background 0.2s',
    } as React.CSSProperties,
    buttonRow: {
      display: 'flex',
      gap: '12px',
    } as React.CSSProperties,
    btnPrimary: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 20px',
      border: 'none',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      background: '#58a6ff',
      color: '#0a0c10',
    } as React.CSSProperties,
    btnDanger: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 20px',
      border: 'none',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      background: 'rgba(248, 81, 73, 0.15)',
      color: '#f85149',
      border2: '1px solid rgba(248, 81, 73, 0.3)',
    } as React.CSSProperties,
    btnSecondary: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 20px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#f0f6fc',
    } as React.CSSProperties,
    errorBox: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '12px 14px',
      background: 'rgba(248, 81, 73, 0.08)',
      border: '1px solid rgba(248, 81, 73, 0.2)',
      borderRadius: '8px',
      marginBottom: '20px',
      fontSize: '13px',
      color: '#f85149',
      lineHeight: 1.5,
    } as React.CSSProperties,
    instructions: {
      padding: '16px',
      background: 'rgba(88, 166, 255, 0.06)',
      border: '1px solid rgba(88, 166, 255, 0.12)',
      borderRadius: '8px',
      marginBottom: '20px',
      fontSize: '13px',
      color: '#8b949e',
      lineHeight: 1.6,
    } as React.CSSProperties,
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <Radio size={24} color="#58a6ff" />
          <h1 style={styles.title}>CoreService Emitter</h1>
        </div>
        <p style={styles.subtitle}>
          Thiết bị: <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{deviceInfo.hostname}</span>
          {deviceInfo.ip !== '...' && deviceInfo.ip !== 'Unknown' && (
            <span style={{ marginLeft: '8px', color: '#484f58' }}>({deviceInfo.ip})</span>
          )}
        </p>

        {/* Error Message */}
        {errorMessage && (
          <div style={styles.errorBox}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Instructions (before webcam is on) */}
        {!webcamActive && !errorMessage && (
          <div style={styles.instructions}>
            <strong style={{ color: '#58a6ff' }}>📋 Hướng dẫn nhanh:</strong>
            <br />
            1. Nhấn <strong style={{ color: '#f0f6fc' }}>&quot;Bật Webcam&quot;</strong> để bắt đầu
            <br />
            2. Cho phép trình duyệt truy cập camera khi được hỏi
            <br />
            3. Trang sẽ tự động kết nối tới CoreService Manager
            <br />
            4. Tự động kết nối lại nếu mất kết nối
          </div>
        )}

        {/* Video Preview */}
        <div style={styles.videoContainer}>
          {webcamActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.video}
              />
              <div
                style={{
                  ...styles.liveIndicator,
                  color: streaming ? '#2ea043' : '#f0a020',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: streaming ? '#2ea043' : '#f0a020',
                    animation: 'pulse 2s infinite',
                  }}
                />
                {streaming ? 'LIVE' : 'PREVIEW'}
              </div>
            </>
          ) : (
            <div style={styles.videoPlaceholder}>
              <Camera size={48} strokeWidth={1.5} />
              <span style={{ fontSize: '14px' }}>Camera chưa được bật</span>
            </div>
          )}
        </div>

        {/* Status Indicators */}
        <div style={styles.statusSection}>
          {/* PeerJS Status */}
          <div style={styles.statusRow}>
            <div style={styles.statusLeft}>
              {peerConnected ? <Wifi size={16} color="#2ea043" /> : <WifiOff size={16} color="#484f58" />}
              <span>PeerJS</span>
            </div>
            <div style={styles.statusRight}>
              <span style={{ color: peerConnected ? '#2ea043' : '#8b949e' }}>
                {peerConnected ? 'Kết nối' : 'Ngắt kết nối'}
              </span>
              <span style={styles.dot(peerConnected)} />
              {peerId && (
                <span style={styles.peerIdBadge} onClick={copyPeerId} title="Nhấn để sao chép">
                  {peerId.substring(0, 8)}
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                </span>
              )}
            </div>
          </div>

          {/* Webcam Status */}
          <div style={styles.statusRow}>
            <div style={styles.statusLeft}>
              {webcamActive ? <Camera size={16} color="#2ea043" /> : <CameraOff size={16} color="#484f58" />}
              <span>Webcam</span>
            </div>
            <div style={styles.statusRight}>
              <span style={{ color: webcamActive ? '#2ea043' : '#8b949e' }}>
                {webcamActive ? 'Hoạt động' : 'Tắt'}
              </span>
              <span style={styles.dot(webcamActive)} />
            </div>
          </div>

          {/* Manager Status */}
          <div style={styles.statusRow}>
            <div style={styles.statusLeft}>
              <Monitor size={16} color={streaming ? '#2ea043' : managerConnected ? '#f0a020' : '#484f58'} />
              <span>Manager</span>
            </div>
            <div style={styles.statusRight}>
              <span
                style={{
                  color: streaming ? '#2ea043' : managerConnected ? '#f0a020' : '#8b949e',
                }}
              >
                {streaming ? 'Đang stream' : managerConnected ? 'Kết nối' : 'Chờ kết nối'}
              </span>
              <span style={styles.dot(streaming)} />
              {reconnecting && (
                <RefreshCw size={12} color="#58a6ff" style={{ animation: 'spin 1s linear infinite' }} />
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={styles.buttonRow}>
          {!webcamActive ? (
            <button
              style={styles.btnPrimary}
              onClick={startWebcam}
              disabled={!peerJsLoaded}
            >
              <Camera size={18} />
              {peerJsLoaded ? 'Bật Webcam' : 'Đang tải...'}
            </button>
          ) : (
            <>
              <button
                style={{
                  ...styles.btnDanger,
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                }}
                onClick={stopWebcam}
              >
                <CameraOff size={18} />
                Tắt Webcam
              </button>
              <button
                style={styles.btnSecondary}
                onClick={handleReconnect}
                disabled={reconnecting}
              >
                <RefreshCw size={18} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />
                Kết nối lại
              </button>
            </>
          )}
        </div>
      </div>

      {/* Global Keyframe Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        button:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        button:active {
          transform: translateY(0);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: none;
          transform: none;
        }
      `}</style>
    </div>
  );
}
