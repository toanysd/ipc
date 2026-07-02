import { NextRequest, NextResponse } from 'next/server';
import * as net from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProbeResult {
  name: string;
  success: boolean;
  data?: any;
  info?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/** Send a raw TCP command and read response */
function tcpSendRecv(host: string, port: number, command: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    let data = '';

    socket.once('connect', () => {
      if (command) socket.write(command);
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      // Some services respond immediately
      if (data.length > 0) {
        setTimeout(() => { socket.destroy(); resolve(data); }, 500);
      }
    });

    socket.once('timeout', () => { socket.destroy(); resolve(data); });
    socket.once('error', (err) => { socket.destroy(); reject(err); });
    socket.once('close', () => { resolve(data); });

    socket.connect(port, host);
  });
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Probe 1: Full Port Scan (common camera ports)
// ---------------------------------------------------------------------------

async function probePortScan(ip: string): Promise<ProbeResult> {
  const name = 'Quét cổng dịch vụ';

  // Camera-specific ports to check
  const ports = [
    { port: 23, service: 'Telnet' },
    { port: 22, service: 'SSH' },
    { port: 80, service: 'HTTP' },
    { port: 81, service: 'HTTP Alt' },
    { port: 443, service: 'HTTPS' },
    { port: 554, service: 'RTSP' },
    { port: 8080, service: 'HTTP Proxy' },
    { port: 8443, service: 'HTTPS Alt' },
    { port: 8554, service: 'RTSP Alt' },
    { port: 8899, service: 'HTTP API' },
    { port: 9530, service: 'XM Backdoor' },
    { port: 9527, service: 'XM Debug' },
    { port: 34567, service: 'XM/DVR Protocol' },
    { port: 34599, service: 'XM P2P' },
    { port: 3702, service: 'WS-Discovery' },
    { port: 2020, service: 'ONVIF Alt' },
    { port: 5000, service: 'UPnP' },
    { port: 49152, service: 'UPnP Alt' },
    { port: 37777, service: 'Dahua Protocol' },
    { port: 37778, service: 'Dahua Data' },
    { port: 8000, service: 'Hikvision SDK' },
    { port: 8200, service: 'Hikvision ISUP' },
    { port: 10554, service: 'RTSP Hi' },
    { port: 6036, service: 'Axis Camera' },
  ];

  const openPorts: { port: number; service: string }[] = [];

  // Scan in batches of 6 to avoid overwhelming
  for (let i = 0; i < ports.length; i += 6) {
    const batch = ports.slice(i, i + 6);
    const results = await Promise.all(
      batch.map(async (p) => {
        const open = await tcpProbe(ip, p.port, 1500);
        return { ...p, open };
      })
    );
    for (const r of results) {
      if (r.open) openPorts.push({ port: r.port, service: r.service });
    }
  }

  if (openPorts.length === 0) {
    return { name, success: false, error: 'Không tìm thấy cổng mở' };
  }

  console.log(`[deep-probe] Ports open: ${openPorts.map(p => `${p.port}(${p.service})`).join(', ')}`);
  return {
    name, success: true,
    data: { openPorts },
    info: openPorts.map(p => `${p.port} (${p.service})`).join(', ')
  };
}

// ---------------------------------------------------------------------------
// Probe 2: MAC Address OUI Lookup
// ---------------------------------------------------------------------------

async function probeMacLookup(ip: string): Promise<ProbeResult> {
  const name = 'Nhận diện hãng (MAC/OUI)';

  // Try to get MAC from ARP table
  try {
    // We'll try getting the MAC from the camera's web response headers or
    // from ONVIF GetDeviceInformation
    const onvifUrls = [
      `http://${ip}:80/onvif/device_service`,
      `http://${ip}:8080/onvif/device_service`,
    ];

    for (const url of onvifUrls) {
      try {
        const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body><tds:GetDeviceInformation/></s:Body>
</s:Envelope>`;

        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
          body: soapBody,
        }, 4000);

        const xml = await res.text();
        const mfr = xml.match(/<(?:tds|tt):Manufacturer>(.*?)<\/(?:tds|tt):Manufacturer>/i);
        const model = xml.match(/<(?:tds|tt):Model>(.*?)<\/(?:tds|tt):Model>/i);
        const firmware = xml.match(/<(?:tds|tt):FirmwareVersion>(.*?)<\/(?:tds|tt):FirmwareVersion>/i);
        const serial = xml.match(/<(?:tds|tt):SerialNumber>(.*?)<\/(?:tds|tt):SerialNumber>/i);
        const hwId = xml.match(/<(?:tds|tt):HardwareId>(.*?)<\/(?:tds|tt):HardwareId>/i);

        if (mfr || model) {
          const info = [
            mfr ? `Hãng: ${mfr[1]}` : null,
            model ? `Model: ${model[1]}` : null,
            firmware ? `FW: ${firmware[1]}` : null,
            serial ? `SN: ${serial[1]}` : null,
            hwId ? `HW: ${hwId[1]}` : null,
          ].filter(Boolean).join(' | ');

          console.log(`[deep-probe] Device info: ${info}`);
          return {
            name, success: true,
            data: {
              manufacturer: mfr?.[1] || 'Unknown',
              model: model?.[1],
              firmware: firmware?.[1],
              serial: serial?.[1],
              hardwareId: hwId?.[1],
            },
            info
          };
        }
      } catch {
        // continue
      }
    }

    // Fallback: try HTTP server header
    for (const port of [80, 8080, 81, 8899]) {
      try {
        const res = await fetchWithTimeout(`http://${ip}:${port}/`, { method: 'HEAD' }, 2000);
        const server = res.headers.get('server') || res.headers.get('x-powered-by') || '';
        if (server) {
          console.log(`[deep-probe] HTTP Server header: ${server}`);
          return { name, success: true, data: { server }, info: `Server: ${server}` };
        }
      } catch {
        // continue
      }
    }
  } catch {
    // ignore
  }

  return { name, success: false, error: 'Không xác định được hãng sản xuất' };
}

// ---------------------------------------------------------------------------
// Probe 3: Telnet Access Attempt
// ---------------------------------------------------------------------------

async function probeTelnet(ip: string): Promise<ProbeResult> {
  const name = 'Telnet/SSH đăng nhập';

  // Telnet credentials from community forums (IPCamTalk, XM forums, etc.)
  const telnetCreds = [
    { user: 'root', pass: '' },
    { user: 'root', pass: 'xmhdipc' },      // XiongMai default
    { user: 'root', pass: 'xc3511' },        // XiongMai older
    { user: 'root', pass: 'ccadmin' },        // XM530 common
    { user: 'root', pass: 'anko' },           // Anko branded
    { user: 'root', pass: 'klv123' },         // KLV branded
    { user: 'root', pass: 'klv1234' },        // KLV branded
    { user: 'root', pass: '888888' },         // Generic chinese
    { user: 'root', pass: '123456' },         // Generic
    { user: 'root', pass: 'admin' },          // Generic
    { user: 'root', pass: 'password' },       // Generic
    { user: 'root', pass: 'root' },           // Generic
    { user: 'root', pass: 'pass' },           // Generic
    { user: 'root', pass: 'vizxv' },          // Dahua older
    { user: 'root', pass: 'juantech' },       // Juan Tech
    { user: 'root', pass: '54321' },          // Some chinese
    { user: 'admin', pass: 'admin' },
    { user: 'admin', pass: '' },
    { user: 'default', pass: 'default' },
  ];

  // Check if telnet port is open
  const telnetOpen = await tcpProbe(ip, 23, 2000);
  const sshOpen = await tcpProbe(ip, 22, 2000);

  if (!telnetOpen && !sshOpen) {
    // Try XM secret knock on port 9530 to enable telnet
    const xmKnockOpen = await tcpProbe(ip, 9530, 2000);
    if (xmKnockOpen) {
      console.log(`[deep-probe] Port 9530 (XM backdoor) open! Attempting to enable telnet...`);
      try {
        // XM secret knock: connect to 9530, send specific bytes
        const knockResult = await tcpSendRecv(ip, 9530, '\x00\x00\x00\x00\x00\x00\x00\x00', 3000);
        console.log(`[deep-probe] XM knock response: ${knockResult.substring(0, 100)}`);

        // Wait and check if telnet is now open
        await new Promise(r => setTimeout(r, 2000));
        const telnetNow = await tcpProbe(ip, 23, 2000);
        if (telnetNow) {
          return {
            name, success: true,
            info: 'Telnet đã được kích hoạt qua port 9530 (XM). Thử đăng nhập: root / xmhdipc',
            data: { method: 'xm_knock', telnetEnabled: true, suggestedCreds: { user: 'root', pass: 'xmhdipc' } }
          };
        }
      } catch {
        // ignore
      }
    }

    // Check XM debug port 9527
    const xmDebugOpen = await tcpProbe(ip, 9527, 2000);
    if (xmDebugOpen) {
      try {
        const banner = await tcpSendRecv(ip, 9527, '', 3000);
        if (banner) {
          console.log(`[deep-probe] Port 9527 banner: ${banner.substring(0, 200)}`);
          return {
            name, success: true,
            info: `Cổng debug 9527 mở: ${banner.substring(0, 100)}`,
            data: { method: 'xm_debug', port: 9527, banner: banner.substring(0, 200) }
          };
        }
      } catch {
        // ignore
      }
    }

    return { name, success: false, error: 'Cổng Telnet (23) và SSH (22) đều đóng' };
  }

  // Try telnet login
  if (telnetOpen) {
    console.log(`[deep-probe] Telnet port 23 is OPEN. Testing credentials...`);
    try {
      // Read telnet banner
      const banner = await tcpSendRecv(ip, 23, '', 3000);
      console.log(`[deep-probe] Telnet banner: ${banner.substring(0, 200)}`);

      return {
        name, success: true,
        info: `Telnet (23) mở! Banner: ${banner.substring(0, 80).trim() || '(trống)'}`,
        data: {
          method: 'telnet',
          port: 23,
          banner: banner.substring(0, 200),
          suggestedCreds: telnetCreds.slice(0, 10) // Top 10 to try
        }
      };
    } catch {
      return {
        name, success: true,
        info: 'Telnet (23) mở nhưng không đọc được banner',
        data: { method: 'telnet', port: 23, suggestedCreds: telnetCreds.slice(0, 10) }
      };
    }
  }

  if (sshOpen) {
    try {
      const banner = await tcpSendRecv(ip, 22, '', 2000);
      return {
        name, success: true,
        info: `SSH (22) mở! Banner: ${banner.substring(0, 80).trim() || '(trống)'}`,
        data: { method: 'ssh', port: 22, banner: banner.substring(0, 200) }
      };
    } catch {
      return {
        name, success: true,
        info: 'SSH (22) mở',
        data: { method: 'ssh', port: 22 }
      };
    }
  }

  return { name, success: false, error: 'Không kết nối được Telnet/SSH' };
}

// ---------------------------------------------------------------------------
// Probe 4: XM/Dahua/Hikvision Proprietary Protocol
// ---------------------------------------------------------------------------

async function probeProprietaryProtocol(ip: string): Promise<ProbeResult> {
  const name = 'Giao thức riêng (XM/Dahua/Hikvision)';

  const protocols = [
    { port: 34567, name: 'XM/DVR Protocol', brand: 'XiongMai' },
    { port: 34599, name: 'XM P2P', brand: 'XiongMai' },
    { port: 37777, name: 'Dahua Binary', brand: 'Dahua' },
    { port: 37778, name: 'Dahua Data', brand: 'Dahua' },
    { port: 8000, name: 'Hikvision SDK', brand: 'Hikvision' },
    { port: 8200, name: 'Hikvision ISUP', brand: 'Hikvision' },
  ];

  const found: { port: number; name: string; brand: string; banner?: string }[] = [];

  for (const proto of protocols) {
    if (await tcpProbe(ip, proto.port, 1500)) {
      console.log(`[deep-probe] Proprietary port ${proto.port} (${proto.name}) is OPEN`);
      let banner = '';
      try {
        banner = await tcpSendRecv(ip, proto.port, '', 2000);
      } catch { /* ignore */ }

      found.push({ ...proto, banner: banner.substring(0, 100) });
    }
  }

  if (found.length === 0) {
    return { name, success: false, error: 'Không tìm thấy giao thức riêng của hãng' };
  }

  // Determine brand
  const brand = found[0].brand;
  const resetAdvice = getResetAdvice(brand);

  return {
    name, success: true,
    data: { protocols: found, brand, resetAdvice },
    info: `${brand} camera! Ports: ${found.map(f => f.port).join(', ')}`
  };
}

function getResetAdvice(brand: string): string {
  switch (brand) {
    case 'XiongMai':
      return 'XiongMai: Dùng app CMS/XMEye, hoặc telnet root/xmhdipc. Reset: giữ nút 5-10s khi bật nguồn.';
    case 'Dahua':
      return 'Dahua: Tải ConfigTool từ dahuawiki.com. Reset: giữ nút 15-30s. Mặc định: admin/(trống hoặc admin).';
    case 'Hikvision':
      return 'Hikvision: Tải SADP Tool từ hikvision.com. Reset: giữ nút 15-20s. Mặc định: admin/12345 (firmware cũ).';
    default:
      return 'Thử reset cứng: giữ nút reset 10-15s khi đang bật nguồn.';
  }
}

// ---------------------------------------------------------------------------
// Probe 5: Web Login Page Analysis
// ---------------------------------------------------------------------------

async function probeWebLogin(ip: string): Promise<ProbeResult> {
  const name = 'Phân tích trang đăng nhập';

  const httpPorts = [80, 8080, 81, 443, 8899, 8443];

  for (const port of httpPorts) {
    try {
      const protocol = port === 443 || port === 8443 ? 'https' : 'http';
      const url = `${protocol}://${ip}:${port}/`;
      const res = await fetchWithTimeout(url, { method: 'GET' }, 3000);

      if (res.ok || res.status === 401) {
        const ct = (res.headers.get('content-type') ?? '').toLowerCase();
        const server = res.headers.get('server') || '';

        if (res.status === 401) {
          // WWW-Authenticate header tells us auth type
          const authHeader = res.headers.get('www-authenticate') || '';
          let authType = 'Unknown';
          if (authHeader.includes('Digest')) authType = 'Digest';
          else if (authHeader.includes('Basic')) authType = 'Basic';

          return {
            name, success: true,
            info: `Trang quản trị (${authType} Auth) tại port ${port}`,
            data: { port, authType, server, url, requiresAuth: true }
          };
        }

        if (ct.includes('text/html')) {
          const html = await res.text();
          const htmlLower = html.toLowerCase();

          // Detect camera/device brand from HTML
          let detectedBrand = 'Unknown';
          let detectedModel = '';
          let deviceType: 'camera' | 'router' | 'nvr' | 'unknown' = 'unknown';

          // Sony / NURO detection
          if (htmlLower.includes('sony') || htmlLower.includes('nsd-g') || htmlLower.includes('nuro')) {
            detectedBrand = 'Sony';
            const modelMatch = html.match(/NSD-[A-Z0-9]+/i);
            if (modelMatch) detectedModel = modelMatch[0];
            if (htmlLower.includes('nsd-g') || htmlLower.includes('onu')) deviceType = 'router';
          }
          else if (htmlLower.includes('hikvision') || htmlLower.includes('hikv')) detectedBrand = 'Hikvision';
          else if (htmlLower.includes('dahua') || htmlLower.includes('dh_')) detectedBrand = 'Dahua';
          else if (htmlLower.includes('xiongmai') || htmlLower.includes('xmeye') || htmlLower.includes('juan')) detectedBrand = 'XiongMai';
          else if (htmlLower.includes('axis')) detectedBrand = 'Axis';
          else if (htmlLower.includes('foscam')) detectedBrand = 'Foscam';
          else if (htmlLower.includes('reolink')) detectedBrand = 'Reolink';
          else if (htmlLower.includes('amcrest')) detectedBrand = 'Amcrest';
          else if (htmlLower.includes('tp-link') || htmlLower.includes('tplink')) detectedBrand = 'TP-Link';
          else if (htmlLower.includes('uniview') || htmlLower.includes('unv')) detectedBrand = 'Uniview';
          else if (htmlLower.includes('vivotek')) detectedBrand = 'Vivotek';
          else if (htmlLower.includes('hanwha') || htmlLower.includes('samsung') || htmlLower.includes('wisenet')) detectedBrand = 'Hanwha/Samsung';
          else if (htmlLower.includes('imou') || htmlLower.includes('lechange')) detectedBrand = 'Imou (Dahua)';
          else if (htmlLower.includes('ezviz')) detectedBrand = 'EZVIZ (Hikvision)';
          else if (htmlLower.includes('yoosee') || htmlLower.includes('cwc')) detectedBrand = 'Yoosee (XiongMai)';
          else if (htmlLower.includes('v380') || htmlLower.includes('vstarcam')) detectedBrand = 'V380/VStarcam';
          else if (htmlLower.includes('buffalo')) { detectedBrand = 'Buffalo'; deviceType = 'router'; }
          else if (htmlLower.includes('netgear')) { detectedBrand = 'Netgear'; deviceType = 'router'; }

          // Auto-detect device type from page content
          if (deviceType === 'unknown') {
            if (htmlLower.includes('router') || htmlLower.includes('gateway') || htmlLower.includes('onu') ||
                htmlLower.includes('wan') || htmlLower.includes('dhcp') || htmlLower.includes('pppoe') ||
                htmlLower.includes('ssid')) {
              deviceType = 'router';
            } else if (htmlLower.includes('camera') || htmlLower.includes('nvr') || htmlLower.includes('dvr') ||
                       htmlLower.includes('ipc') || htmlLower.includes('surveillance')) {
              deviceType = htmlLower.includes('nvr') || htmlLower.includes('dvr') ? 'nvr' : 'camera';
            }
          }

          // Check for forgot password link (including Japanese)
          const hasForgotPw = htmlLower.includes('forgot') || htmlLower.includes('reset') ||
                              htmlLower.includes('recover') || html.includes('パスワードを忘れ');

          // Check if page has login form (including Japanese forms)
          const hasLoginForm = htmlLower.includes('<form') && 
            (htmlLower.includes('password') || htmlLower.includes('pass') || 
             html.includes('パスワード') || html.includes('ログイン'));

          // Check for direct video/stream embed
          const hasVideoEmbed = htmlLower.includes('<video') || htmlLower.includes('rtsp://') ||
                                htmlLower.includes('.mjpg') || htmlLower.includes('stream');

          const info = [
            detectedBrand !== 'Unknown' ? `Hãng: ${detectedBrand}` : null,
            detectedModel ? `Model: ${detectedModel}` : null,
            deviceType === 'router' ? '⚠️ ĐÂY LÀ ROUTER, KHÔNG PHẢI CAMERA!' : null,
            hasLoginForm ? 'Có form đăng nhập' : null,
            hasForgotPw ? '⭐ Có nút "Quên mật khẩu"!' : null,
            hasVideoEmbed ? '🎥 Có video embed trên trang!' : null,
          ].filter(Boolean).join(' | ');

          return {
            name, success: true,
            data: { port, url, detectedBrand, detectedModel, deviceType, hasLoginForm, hasForgotPw, hasVideoEmbed, server },
            info: info || `Trang web tại port ${port}`
          };
        }
      }
    } catch {
      // continue
    }
  }

  return { name, success: false, error: 'Không tìm thấy trang đăng nhập web' };
}

// ---------------------------------------------------------------------------
// Probe 6: Brand-Specific Default Credentials (extended community list)
// ---------------------------------------------------------------------------

async function probeBrandCredentials(ip: string, port: number, brand?: string): Promise<ProbeResult> {
  const name = 'Thử tài khoản theo hãng (mở rộng)';

  // Comprehensive credential list from community forums, IPCamTalk, etc.
  const allCreds: { user: string; pass: string; brand: string }[] = [
    // XiongMai / XMEye / Yoosee
    { user: 'admin', pass: '', brand: 'XiongMai' },
    { user: 'admin', pass: 'admin', brand: 'XiongMai' },
    { user: 'default', pass: 'tluafed', brand: 'XiongMai' },
    // Hikvision
    { user: 'admin', pass: '12345', brand: 'Hikvision' },
    { user: 'admin', pass: 'hikvision', brand: 'Hikvision' },
    { user: 'admin', pass: 'Hikvision1', brand: 'Hikvision' },
    { user: 'admin', pass: 'abcd1234', brand: 'Hikvision' },
    // Dahua
    { user: 'admin', pass: '', brand: 'Dahua' },
    { user: 'admin', pass: 'admin', brand: 'Dahua' },
    { user: 'admin', pass: 'dmss', brand: 'Dahua' },
    { user: '888888', pass: '888888', brand: 'Dahua' },
    { user: '666666', pass: '666666', brand: 'Dahua' },
    // Axis
    { user: 'root', pass: 'pass', brand: 'Axis' },
    { user: 'root', pass: 'axis', brand: 'Axis' },
    // Foscam
    { user: 'admin', pass: '', brand: 'Foscam' },
    { user: 'admin', pass: 'foscam', brand: 'Foscam' },
    // Reolink
    { user: 'admin', pass: '', brand: 'Reolink' },
    { user: 'admin', pass: 'admin', brand: 'Reolink' },
    // TP-Link
    { user: 'admin', pass: 'admin', brand: 'TP-Link' },
    { user: 'admin', pass: '123456', brand: 'TP-Link' },
    // Amcrest
    { user: 'admin', pass: 'admin', brand: 'Amcrest' },
    // V380/VStarcam
    { user: 'admin', pass: '888888', brand: 'V380' },
    { user: 'admin', pass: '123', brand: 'VStarcam' },
    // Uniview
    { user: 'admin', pass: '123456', brand: 'Uniview' },
    // Vivotek
    { user: 'root', pass: '', brand: 'Vivotek' },
    // Hanwha/Samsung
    { user: 'admin', pass: '4321', brand: 'Hanwha' },
    { user: 'admin', pass: '888888', brand: 'Hanwha' },
    // EZVIZ
    { user: 'admin', pass: '', brand: 'EZVIZ' },
    // Imou
    { user: 'admin', pass: '', brand: 'Imou' },
    { user: 'admin', pass: 'admin', brand: 'Imou' },
    // Generic (catch-all)
    { user: 'admin', pass: 'password', brand: 'Generic' },
    { user: 'admin', pass: '1234', brand: 'Generic' },
    { user: 'admin', pass: '12345678', brand: 'Generic' },
    { user: 'user', pass: 'user', brand: 'Generic' },
    { user: 'service', pass: 'service', brand: 'Generic' },
    { user: 'supervisor', pass: 'supervisor', brand: 'Generic' },
    { user: 'guest', pass: 'guest', brand: 'Generic' },
    { user: 'operator', pass: 'operator', brand: 'Generic' },
  ];

  // Prioritize brand-specific creds if brand is known
  let sortedCreds = allCreds;
  if (brand && brand !== 'Unknown') {
    const brandLower = brand.toLowerCase();
    sortedCreds = [
      ...allCreds.filter(c => c.brand.toLowerCase().includes(brandLower)),
      ...allCreds.filter(c => !c.brand.toLowerCase().includes(brandLower)),
    ];
  }

  // Try HTTP Basic/Digest auth on web interface
  const httpPorts = [80, 8080, port].filter((v, i, a) => a.indexOf(v) === i);
  const testPaths = ['/', '/cgi-bin/snapshot.cgi', '/onvif-http/snapshot'];

  for (const hp of httpPorts) {
    for (const path of testPaths) {
      for (let i = 0; i < Math.min(sortedCreds.length, 20); i++) {
        const cred = sortedCreds[i];
        const url = `http://${ip}:${hp}${path}`;
        try {
          const authHeader = 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64');
          const res = await fetchWithTimeout(url, {
            method: 'GET',
            headers: { 'Authorization': authHeader },
          }, 2500);

          if (res.ok) {
            console.log(`[deep-probe] HTTP Basic auth SUCCESS: ${cred.user}/${cred.pass} on ${url}`);
            return {
              name, success: true,
              info: `✅ Tài khoản: ${cred.user} / ${cred.pass || '(trống)'} — ${cred.brand}`,
              data: { user: cred.user, pass: cred.pass, brand: cred.brand, url }
            };
          }
        } catch {
          // continue
        }
      }
    }
  }

  return { name, success: false, error: `Đã thử ${Math.min(sortedCreds.length, 20)} tài khoản, không thành công` };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { ip, port, serviceUrl } = await request.json();

    if (!ip) {
      return NextResponse.json({ success: false, error: 'Thiếu tham số ip' }, { status: 400 });
    }

    const cameraPort = port ? parseInt(port) : 80;

    console.log(`[deep-probe] ═══ Starting DEEP PROBE for ${ip} ═══`);

    const results: ProbeResult[] = [];

    // 1. Port scan
    const scan = await probePortScan(ip);
    results.push(scan);

    // 2. MAC/OUI lookup
    const mac = await probeMacLookup(ip);
    results.push(mac);
    const detectedBrand = mac.data?.manufacturer;

    // 3. Telnet/SSH probe
    const telnet = await probeTelnet(ip);
    results.push(telnet);

    // 4. Proprietary protocol detection
    const proto = await probeProprietaryProtocol(ip);
    results.push(proto);
    const protoBrand = proto.data?.brand;

    // 5. Web login analysis
    const web = await probeWebLogin(ip);
    results.push(web);
    const webBrand = web.data?.detectedBrand;

    // 6. Brand-specific credential testing
    const brand = webBrand || protoBrand || detectedBrand || 'Unknown';
    const creds = await probeBrandCredentials(ip, cameraPort, brand);
    results.push(creds);

    const anySuccess = results.some(r => r.success);

    // Generate overall advice
    const advice = generateAdvice(results, brand, ip);

    console.log(`[deep-probe] ═══ Completed – ${results.filter(r => r.success).length}/${results.length} probes succeeded ═══`);

    return NextResponse.json({
      success: anySuccess,
      probes: results,
      brand,
      advice,
    });
  } catch (err) {
    console.error('[deep-probe] Unhandled error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

function generateAdvice(results: ProbeResult[], brand: string, ip: string): string[] {
  const advice: string[] = [];
  const portData = results[0]?.data?.openPorts || [];
  const telnetData = results[2]?.data;
  const protoData = results[3]?.data;
  const webData = results[4]?.data;
  const credData = results[5]?.data;

  // Check if this is a router, not a camera
  if (webData?.deviceType === 'router') {
    advice.push(`⚠️ THIẾT BỊ NÀY LÀ ROUTER/ONU, KHÔNG PHẢI CAMERA IP!`);
    advice.push(`📡 IP ${ip} là ${webData.detectedBrand || ''} ${webData.detectedModel || 'router'}. Camera thực sự có thể ở IP khác trong mạng.`);

    // Sony NSD-G1000T specific
    if (webData.detectedModel?.toUpperCase().includes('NSD-G')) {
      advice.push(`📌 Sony ${webData.detectedModel} (NURO光 ONU):`);
      advice.push(`   • Tên đăng nhập: admin`);
      advice.push(`   • Mật khẩu: WPA Key in trên nhãn dán ở MẶT ĐÁY router`);
      advice.push(`   • Reset: giữ nút RESET (lỗ nhỏ ở mặt sau) ~10 giây bằng kẹp giấy`);
      advice.push(`   • Sau reset, mật khẩu sẽ trở về WPA Key trên nhãn`);
    }

    advice.push(`🔍 Để tìm camera: đăng nhập vào router → xem danh sách thiết bị kết nối → tìm IP camera.`);
    return advice;
  }

  if (credData?.user) {
    advice.push(`🎉 Tìm thấy tài khoản: ${credData.user} / ${credData.pass || '(trống)'}`);
  }

  if (telnetData?.method === 'telnet' || telnetData?.method === 'xm_knock') {
    const cred = telnetData.suggestedCreds?.[0];
    advice.push(`💻 Telnet mở! Dùng PuTTY → Telnet → ${ip}:23 → thử: ${cred?.user || 'root'} / ${cred?.pass || 'xmhdipc'}`);
  }

  if (webData?.hasForgotPw) {
    advice.push(`🔑 Trang web có nút "Quên mật khẩu" — truy cập http://${ip}:${webData.port}/`);
  }

  if (webData?.hasVideoEmbed) {
    advice.push(`🎥 Trang web có video embed — có thể xem trực tiếp tại http://${ip}:${webData.port}/`);
  }

  if (protoData?.resetAdvice) {
    advice.push(`📱 ${protoData.resetAdvice}`);
  }

  if (portData.some((p: any) => p.port === 9530)) {
    advice.push('⚠️ Port 9530 (XM backdoor) mở — camera có thể là XiongMai, thử bật telnet qua port này.');
  }

  if (advice.length === 0) {
    advice.push(getResetAdvice(brand));
    advice.push(`🔧 Reset cứng: giữ nút reset 10-15 giây khi camera đang bật, sau đó quét lại.`);
  }

  return advice;
}
