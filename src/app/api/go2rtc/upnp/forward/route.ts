import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// POST /api/go2rtc/upnp/forward - Request port forwarding for a camera
// Body: { cameraIp, cameraPort, externalPort, description }
// This writes a request file that Electron main process picks up
export async function POST(req: NextRequest) {
  try {
    const { cameraIp, cameraPort, externalPort, description } = await req.json();
    if (!cameraIp || !cameraPort || !externalPort) {
      return NextResponse.json({ error: 'cameraIp, cameraPort, and externalPort are required' }, { status: 400 });
    }
    
    const requestPath = join(process.env.APPDATA || '', 'ipc', 'upnp-forward-request.json');
    const dir = dirname(requestPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    
    writeFileSync(requestPath, JSON.stringify({
      cameraIp,
      cameraPort: Number(cameraPort),
      externalPort: Number(externalPort),
      description: description || `Camera ${cameraIp}`,
      timestamp: Date.now()
    }));
    
    return NextResponse.json({ 
      success: true, 
      message: 'Port forward request submitted. Electron main process will handle it.' 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
