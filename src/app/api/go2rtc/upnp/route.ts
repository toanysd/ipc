import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// GET /api/go2rtc/upnp - Returns UPnP/network status
export async function GET() {
  try {
    // Read UPnP status from shared status file written by Electron main process
    const statusPath = join(process.env.APPDATA || '', 'ipc', 'upnp-status.json');
    let upnpData = { available: false, externalIp: null, mappings: [], cgnat: false };
    
    if (existsSync(statusPath)) {
      try {
        upnpData = JSON.parse(readFileSync(statusPath, 'utf-8'));
      } catch (e) {}
    }
    
    // Also check go2rtc health
    let go2rtcRunning = false;
    try {
      const res = await fetch('http://127.0.0.1:1984/api/streams', { cache: 'no-store' });
      go2rtcRunning = res.ok;
    } catch (e) {}
    
    return NextResponse.json({
      ...upnpData,
      go2rtcRunning
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
