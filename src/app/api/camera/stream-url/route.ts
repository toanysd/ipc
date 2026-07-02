import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
const onvif = require('node-onvif');

export async function POST(req: NextRequest) {
  try {
    const { ip, port, user, pass, serviceUrl } = await req.json();

    console.log(`Connecting to ONVIF device: ${ip} ...`);
    
    let streamUrl = '';

    // Create ONVIF device instance
    const device = new onvif.OnvifDevice({
      xaddr: serviceUrl || `http://${ip}:${port}/onvif/device_service`,
      user: user || 'admin',
      pass: pass || ''
    });

    // Initialize device
    await device.init();
    
    // Get stream URL
    streamUrl = device.getUdpStreamUrl();
    
    if (streamUrl) {
      // Inject credentials into URL if not present
      let finalUrl = streamUrl;
      if (!finalUrl.includes('@') && user && pass) {
        const protocol = finalUrl.split('://')[0];
        const rest = finalUrl.split('://')[1];
        finalUrl = `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${rest}`;
      }
      return NextResponse.json({ success: true, url: finalUrl });
    } else {
      return NextResponse.json({ success: false, error: 'Cannot resolve RTSP stream from camera profiles' });
    }
  } catch (error: any) {
    console.error('ONVIF Error:', error);
    // If ONVIF fails, we can guess a fallback RTSP URL
    return NextResponse.json({ success: false, error: error.message });
  }
}
