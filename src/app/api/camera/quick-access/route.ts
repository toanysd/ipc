import { NextRequest, NextResponse } from 'next/server';
import * as net from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategyResult {
  name: string;
  success: boolean;
  rtspUrl?: string;
  rtspUrls?: string[];
  snapshotUrl?: string;
  mjpegUrl?: string;
  info?: string;
  error?: string;
}

interface QuickAccessResponse {
  success: boolean;
  strategies: StrategyResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

// ---------------------------------------------------------------------------
// Strategy 1 – ONVIF GetDeviceInformation (usually pre-auth)
// Then GetProfiles → GetStreamUri with real profile tokens
// ---------------------------------------------------------------------------

function buildSoap(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <s:Body>${bodyXml}</s:Body>
</s:Envelope>`;
}

async function soapRequest(serviceUrl: string, bodyXml: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      serviceUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
        body: buildSoap(bodyXml),
      },
      timeoutMs,
    );
    if (res.ok || res.status === 500) { // Some cameras return 500 with valid SOAP fault
      return await res.text();
    }
    return null;
  } catch {
    return null;
  }
}

async function strategyOnvifSmart(ip: string, port: number, serviceUrl: string): Promise<StrategyResult> {
  const name = 'ONVIF thông minh (GetProfiles → GetStreamUri)';

  // Try multiple ONVIF service URLs
  const serviceUrls = [
    serviceUrl,
    `http://${ip}:${port}/onvif/device_service`,
    `http://${ip}:80/onvif/device_service`,
    `http://${ip}:8080/onvif/device_service`,
    `http://${ip}:2020/onvif/device_service`,
    `http://${ip}:${port}/onvif/media_service`,
  ];
  // Deduplicate
  const uniqueUrls = [...new Set(serviceUrls)];

  for (const svcUrl of uniqueUrls) {
    console.log(`[quick-access] S1 – trying ONVIF at ${svcUrl}`);

    // Step 1: GetDeviceInformation (usually allowed without auth)
    const devInfoXml = await soapRequest(svcUrl,
      `<tds:GetDeviceInformation/>`, 4000);

    if (devInfoXml) {
      const modelMatch = devInfoXml.match(/<tds:Model>(.*?)<\/tds:Model>/i) ||
                          devInfoXml.match(/<tt:Model>(.*?)<\/tt:Model>/i);
      if (modelMatch) {
        console.log(`[quick-access] S1 – Device model: ${modelMatch[1]}`);
      }
    }

    // Step 2: GetProfiles to get REAL profile tokens
    const mediaUrl = svcUrl.replace('/device_service', '/media_service');
    const profileUrls = [svcUrl, mediaUrl];

    for (const pUrl of [...new Set(profileUrls)]) {
      const profilesXml = await soapRequest(pUrl,
        `<trt:GetProfiles/>`, 5000);

      if (profilesXml) {
        // Extract all profile tokens
        const tokenMatches = [...profilesXml.matchAll(/<trt:Profiles[^>]*\s+token="([^"]+)"/gi)];
        // Also try alternate format
        const tokenMatches2 = [...profilesXml.matchAll(/token="([^"]+)"/gi)];
        const allTokens = new Set([
          ...tokenMatches.map(m => m[1]),
          ...tokenMatches2.map(m => m[1]),
        ]);

        if (allTokens.size > 0) {
          console.log(`[quick-access] S1 – Found ${allTokens.size} profile tokens: ${[...allTokens].join(', ')}`);

          // Step 3: GetStreamUri with real tokens
          for (const token of allTokens) {
            const streamXml = await soapRequest(pUrl,
              `<trt:GetStreamUri>
                <trt:StreamSetup>
                  <tt:Stream>RTP-Unicast</tt:Stream>
                  <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
                </trt:StreamSetup>
                <trt:ProfileToken>${token}</trt:ProfileToken>
              </trt:GetStreamUri>`, 5000);

            if (streamXml) {
              const uriMatch = streamXml.match(/<tt:Uri>(.*?)<\/tt:Uri>/i);
              if (uriMatch && uriMatch[1]) {
                console.log(`[quick-access] S1 – SUCCESS: ${uriMatch[1]}`);
                return { name, success: true, rtspUrl: uriMatch[1], info: `Profile: ${token}` };
              }
            }
          }
        }
      }
    }

    // Step 4: Try Media2 service (newer cameras)
    const media2Url = svcUrl.replace('/device_service', '/media2_service')
                            .replace('/media_service', '/media2_service');
    const profiles2Xml = await soapRequest(media2Url,
      `<tr2:GetProfiles/>`, 4000);

    if (profiles2Xml) {
      const tokenMatches = [...profiles2Xml.matchAll(/token="([^"]+)"/gi)];
      for (const match of tokenMatches) {
        const token = match[1];
        const stream2Xml = await soapRequest(media2Url,
          `<tr2:GetStreamUri>
            <tr2:Protocol>RtspUnicast</tr2:Protocol>
            <tr2:ProfileToken>${token}</tr2:ProfileToken>
          </tr2:GetStreamUri>`, 4000);

        if (stream2Xml) {
          const uriMatch = stream2Xml.match(/<tr2:Uri>(.*?)<\/tr2:Uri>/i) ||
                           stream2Xml.match(/<tt:Uri>(.*?)<\/tt:Uri>/i);
          if (uriMatch && uriMatch[1]) {
            console.log(`[quick-access] S1 – SUCCESS via Media2: ${uriMatch[1]}`);
            return { name, success: true, rtspUrl: uriMatch[1], info: `Media2 Profile: ${token}` };
          }
        }
      }
    }

    // Step 5: Fallback – try guessed tokens if GetProfiles failed
    const guessedTokens = ['Profile_1', 'profile_1', '000', 'MediaProfile00001', 'MainStream', 'SubStream', 'VideoSource_1'];
    for (const token of guessedTokens) {
      for (const pUrl of [...new Set(profileUrls)]) {
        const streamXml = await soapRequest(pUrl,
          `<trt:GetStreamUri>
            <trt:StreamSetup>
              <tt:Stream>RTP-Unicast</tt:Stream>
              <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
            </trt:StreamSetup>
            <trt:ProfileToken>${token}</trt:ProfileToken>
          </trt:GetStreamUri>`, 3000);

        if (streamXml) {
          const uriMatch = streamXml.match(/<tt:Uri>(.*?)<\/tt:Uri>/i);
          if (uriMatch && uriMatch[1]) {
            console.log(`[quick-access] S1 – SUCCESS (guessed token "${token}"): ${uriMatch[1]}`);
            return { name, success: true, rtspUrl: uriMatch[1], info: `Guessed token: ${token}` };
          }
        }
      }
    }
  }

  return { name, success: false, error: 'Không lấy được RTSP URI qua ONVIF' };
}

// ---------------------------------------------------------------------------
// Strategy 2 – ONVIF GetSnapshotUri (unauthenticated)
// ---------------------------------------------------------------------------

async function strategyOnvifSnapshot(ip: string, port: number, serviceUrl: string): Promise<StrategyResult> {
  const name = 'ONVIF GetSnapshotUri (không xác thực)';
  const urls = [...new Set([
    serviceUrl,
    `http://${ip}:${port}/onvif/device_service`,
    serviceUrl.replace('/device_service', '/media_service'),
  ])];

  const tokens = ['Profile_1', 'profile_1', '000', 'MediaProfile00001'];

  for (const svcUrl of urls) {
    for (const token of tokens) {
      const xml = await soapRequest(svcUrl,
        `<trt:GetSnapshotUri>
          <trt:ProfileToken>${token}</trt:ProfileToken>
        </trt:GetSnapshotUri>`, 4000);

      if (xml) {
        const match = xml.match(/<tt:Uri>(.*?)<\/tt:Uri>/i);
        if (match && match[1]) {
          console.log(`[quick-access] S2 – Found snapshot: ${match[1]}`);
          return { name, success: true, snapshotUrl: match[1] };
        }
      }
    }
  }

  return { name, success: false, error: 'Không lấy được Snapshot URI' };
}

// ---------------------------------------------------------------------------
// Strategy 3 – RTSP Path Probing (comprehensive, Cameradar-style)
// ---------------------------------------------------------------------------

async function strategyRtspProbe(ip: string): Promise<StrategyResult> {
  const name = 'Dò RTSP paths (kiểu Cameradar)';

  // Check both common RTSP ports
  const rtspPorts = [554, 8554, 10554];
  const openPorts: number[] = [];

  for (const p of rtspPorts) {
    console.log(`[quick-access] S3 – probing RTSP port ${p} on ${ip}`);
    if (await tcpProbe(ip, p, 2000)) {
      openPorts.push(p);
      console.log(`[quick-access] S3 – port ${p} OPEN`);
    }
  }

  if (openPorts.length === 0) {
    return { name, success: false, error: 'Không tìm thấy cổng RTSP mở (554, 8554, 10554)' };
  }

  // Comprehensive RTSP path list from Cameradar/Nmap/CamioCam databases
  const paths = [
    '/',
    '/live/ch00_0',
    '/live/ch00_1',
    '/cam/realmonitor?channel=1&subtype=0',
    '/cam/realmonitor?channel=1&subtype=1',
    '/h264Preview_01_main',
    '/h264Preview_01_sub',
    '/Streaming/Channels/101',
    '/Streaming/Channels/102',
    '/Streaming/Channels/1',
    '/stream1',
    '/stream2',
    '/video1',
    '/video1s1',
    '/1',
    '/11',
    '/12',
    '/live0',
    '/live/main',
    '/live/sub',
    '/MediaInput/h264',
    '/MediaInput/h264/stream_1',
    '/media/video1',
    '/user=&password=&channel=1&stream=0.sdp',
    '/onvif1',
    '/onvif2',
    '/0/video/main',
    '/0/video/sub',
    '/live.sdp',
    '/play1.sdp',
    '/ch0_0.264',
    '/ch01.264',
    '/video.h264',
    '/mpeg4/media.amp',
    '/nphMpeg4/nil-640x480',
    '/img/video.sav',
  ];

  const rtspUrls: string[] = [];
  for (const port of openPorts) {
    for (const path of paths) {
      rtspUrls.push(`rtsp://${ip}:${port}${path}`);
    }
  }

  console.log(`[quick-access] S3 – returning ${rtspUrls.length} candidate URLs`);
  return { name, success: true, rtspUrls, info: `${openPorts.length} cổng mở, ${rtspUrls.length} đường dẫn` };
}

// ---------------------------------------------------------------------------
// Strategy 4 – HTTP MJPEG / Snapshot Probing (comprehensive)
// ---------------------------------------------------------------------------

async function strategyHttpProbe(ip: string, port: number): Promise<StrategyResult> {
  const name = 'Dò HTTP Video/Snapshot endpoints';

  // Check common HTTP ports
  const httpPorts = [...new Set([port, 80, 8080, 8899, 8088, 81, 9000])];
  const openHttpPorts: number[] = [];

  for (const p of httpPorts) {
    if (await tcpProbe(ip, p, 1500)) {
      openHttpPorts.push(p);
    }
  }

  if (openHttpPorts.length === 0) {
    return { name, success: false, error: 'Không tìm thấy cổng HTTP mở' };
  }

  console.log(`[quick-access] S4 – open HTTP ports: ${openHttpPorts.join(', ')}`);

  // Comprehensive endpoint list from professional tools
  const endpoints = [
    // MJPEG streams (highest priority - continuous video)
    '/cgi-bin/mjpg/video.cgi',                    // Axis, Panasonic
    '/axis-cgi/mjpg/video.cgi',                   // Axis
    '/mjpg/video.mjpg',                            // Generic
    '/video.mjpg',                                 // Generic
    '/videostream.cgi',                            // Foscam, DLink
    '/mjpeg.cgi',                                  // Generic
    '/video/mjpg.cgi',                             // Generic
    '/video1s1.mjpg',                              // Vivotek
    '/?action=stream',                             // MJPG-Streamer
    '/?action=snapshot',                           // MJPG-Streamer snapshot
    '/live',                                       // Generic
    '/live.mjpg',                                  // Generic
    '/stream.mjpg',                                // Generic
    '/GetData.cgi',                                // Some Chinese cameras

    // Snapshot endpoints
    '/cgi-bin/snapshot.cgi',                       // Dahua
    '/snap.jpg',                                   // Generic
    '/webcapture.jpg?command=snap&channel=1',      // Dahua
    '/onvif-http/snapshot',                        // ONVIF standard
    '/ISAPI/Streaming/channels/101/picture',       // Hikvision
    '/ISAPI/Streaming/channels/101/httpPreview',   // Hikvision MJPEG
    '/cgi-bin/images_cgi?channel=0',               // Generic
    '/snap.cgi?channel=0',                         // Generic
    '/image/jpeg.cgi',                             // Axis
    '/jpg/image.jpg',                              // Generic
    '/snapshot.jpg',                               // Generic
    '/capture.jpg',                                // Generic
    '/still.jpg',                                  // Generic
    '/img/snapshot.cgi',                           // Generic
    '/web/cgi-bin/hi3510/snap.cgi',               // Hi3510 chipset
    '/tmpfs/snap.jpg',                             // XiongMai
    '/tmpfs/auto.jpg',                             // XiongMai

    // Vatilon-specific (CVE-2025-67159)
    '/web.cgi?action=getconfig',                   // Vatilon cleartext
  ];

  let foundMjpeg: string | null = null;
  let foundSnapshot: string | null = null;

  for (const p of openHttpPorts) {
    for (const path of endpoints) {
      const url = `http://${ip}:${p}${path}`;
      try {
        const res = await fetchWithTimeout(url, { method: 'GET' }, 3000);
        const ct = (res.headers.get('content-type') ?? '').toLowerCase();

        if (res.status === 200) {
          if (ct.includes('multipart/x-mixed-replace') || ct.includes('video')) {
            // MJPEG stream found!
            console.log(`[quick-access] S4 – MJPEG stream found: ${url}`);
            return { name, success: true, mjpegUrl: url, info: 'MJPEG stream trực tiếp!' };
          }
          if (ct.includes('image') && !foundSnapshot) {
            console.log(`[quick-access] S4 – Snapshot found: ${url}`);
            foundSnapshot = url;
            // Don't return yet, keep looking for MJPEG
          }
          if (ct.includes('text/html') && path.includes('web.cgi')) {
            // Vatilon config — may contain credentials in cleartext
            const body = await res.text();
            if (body.includes('password') || body.includes('passwd')) {
              console.log(`[quick-access] S4 – Vatilon config found at ${url}`);
              return { name, success: true, info: `Cấu hình camera tìm thấy tại ${url}`, snapshotUrl: url };
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  if (foundSnapshot) {
    return { name, success: true, snapshotUrl: foundSnapshot };
  }

  return { name, success: false, error: 'Không tìm thấy HTTP video/snapshot endpoint' };
}

// ---------------------------------------------------------------------------
// Strategy 5 – UPnP/SSDP Device Description
// ---------------------------------------------------------------------------

async function strategyUpnpDescription(ip: string, port: number): Promise<StrategyResult> {
  const name = 'UPnP Device Description';

  const descPaths = [
    '/upnp/description.xml',
    '/description.xml',
    '/DeviceDescription.xml',
    '/gatedesc.xml',
    '/rootDesc.xml',
  ];

  const httpPorts = [...new Set([port, 80, 8080, 49152])];

  for (const p of httpPorts) {
    for (const path of descPaths) {
      const url = `http://${ip}:${p}${path}`;
      try {
        const res = await fetchWithTimeout(url, { method: 'GET' }, 3000);
        if (res.ok) {
          const xml = await res.text();
          if (xml.includes('<device>') || xml.includes('<Device>')) {
            // Try to extract presentation URL or other useful info
            const presMatch = xml.match(/<presentationURL>(.*?)<\/presentationURL>/i);
            const modelMatch = xml.match(/<modelName>(.*?)<\/modelName>/i);
            const mfrMatch = xml.match(/<manufacturer>(.*?)<\/manufacturer>/i);

            const info = [
              mfrMatch ? `Hãng: ${mfrMatch[1]}` : null,
              modelMatch ? `Model: ${modelMatch[1]}` : null,
              presMatch ? `Web UI: ${presMatch[1]}` : null,
            ].filter(Boolean).join(' | ');

            console.log(`[quick-access] S5 – UPnP info found: ${info}`);
            return { name, success: true, info: info || `UPnP description tại ${url}` };
          }
        }
      } catch {
        // Continue
      }
    }
  }

  return { name, success: false, error: 'Không tìm thấy UPnP description' };
}

// ---------------------------------------------------------------------------
// Strategy 6 – Web Interface Login Page Scan
// ---------------------------------------------------------------------------

async function strategyWebInterface(ip: string, port: number): Promise<StrategyResult> {
  const name = 'Web Interface (trang quản trị)';

  const httpPorts = [...new Set([port, 80, 8080, 443, 8443, 81, 8899])];

  for (const p of httpPorts) {
    try {
      const url = `http://${ip}:${p}/`;
      const res = await fetchWithTimeout(url, { method: 'GET' }, 3000);

      if (res.ok || res.status === 401) {
        const info = res.status === 401
          ? `Trang quản trị tại ${url} (cần đăng nhập)`
          : `Trang quản trị mở tại ${url}`;

        // Check for known camera web UIs
        if (res.ok) {
          const html = await res.text();
          const isCamera = html.toLowerCase().includes('camera') ||
                          html.toLowerCase().includes('nvr') ||
                          html.toLowerCase().includes('dvr') ||
                          html.toLowerCase().includes('ipc') ||
                          html.toLowerCase().includes('surveillance') ||
                          html.toLowerCase().includes('video');

          if (isCamera) {
            console.log(`[quick-access] S6 – Camera web UI at ${url}`);
            return { name, success: true, info, snapshotUrl: url };
          }
        } else {
          console.log(`[quick-access] S6 – Auth-required web UI at ${url}`);
          return { name, success: true, info };
        }
      }
    } catch {
      // Continue
    }
  }

  return { name, success: false, error: 'Không tìm thấy trang quản trị web' };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { ip, port, serviceUrl } = await request.json();

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tham số ip' },
        { status: 400 },
      );
    }

    const cameraPort = port ? parseInt(port) : 80;
    const onvifServiceUrl =
      serviceUrl ?? `http://${ip}:${cameraPort}/onvif/device_service`;

    console.log(`[quick-access] ═══ Starting ENHANCED multi-strategy probe for ${ip}:${cameraPort} ═══`);

    const strategies: StrategyResult[] = [];

    // Strategy 1: Smart ONVIF (GetProfiles → GetStreamUri, multi-port)
    const s1 = await strategyOnvifSmart(ip, cameraPort, onvifServiceUrl);
    strategies.push(s1);
    if (s1.success && s1.rtspUrl) {
      // Early return if we got RTSP
      console.log(`[quick-access] ═══ Early success via Strategy 1 ═══`);
      return NextResponse.json({ success: true, strategies } as QuickAccessResponse);
    }

    // Strategy 2: ONVIF Snapshot
    const s2 = await strategyOnvifSnapshot(ip, cameraPort, onvifServiceUrl);
    strategies.push(s2);

    // Strategy 3: Comprehensive RTSP Path Probing
    const s3 = await strategyRtspProbe(ip);
    strategies.push(s3);

    // Strategy 4: HTTP MJPEG/Snapshot Probing
    const s4 = await strategyHttpProbe(ip, cameraPort);
    strategies.push(s4);

    // Strategy 5: UPnP Description
    const s5 = await strategyUpnpDescription(ip, cameraPort);
    strategies.push(s5);

    // Strategy 6: Web Interface
    const s6 = await strategyWebInterface(ip, cameraPort);
    strategies.push(s6);

    const anySuccess = strategies.some((s) => s.success);

    console.log(
      `[quick-access] ═══ Completed – ${strategies.filter((s) => s.success).length}/${strategies.length} strategies succeeded ═══`,
    );

    return NextResponse.json({ success: anySuccess, strategies } as QuickAccessResponse);
  } catch (err) {
    console.error('[quick-access] Unhandled error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
