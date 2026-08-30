import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.antitheft');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDevices(): Record<string, any> {
  ensureDir();
  if (!fs.existsSync(DEVICES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8')); } catch { return {}; }
}

function writeDevices(data: Record<string, any>) {
  ensureDir();
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
}

// POST — Client sends heartbeat
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId, hostname, ip, platform, uptime, battery, nodeVersion } = body;
    if (!deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 });

    const devices = readDevices();
    devices[deviceId] = {
      deviceId,
      hostname: hostname || 'Unknown',
      ip: ip || request.headers.get('x-forwarded-for') || 'Unknown',
      platform: platform || 'Unknown',
      uptime: uptime || 0,
      battery: battery || null,
      nodeVersion: nodeVersion || '',
      lastSeen: new Date().toISOString(),
      online: true,
      firstSeen: devices[deviceId]?.firstSeen || new Date().toISOString(),
    };
    writeDevices(devices);

    return NextResponse.json({ ok: true, serverTime: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — Dashboard gets device list
export async function GET() {
  const devices = readDevices();
  const now = Date.now();
  
  // Mark offline if not seen for 90 seconds
  for (const id in devices) {
    const lastSeen = new Date(devices[id].lastSeen).getTime();
    devices[id].online = (now - lastSeen) < 90000;
  }

  const list = Object.values(devices).sort((a: any, b: any) => 
    new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  );

  return NextResponse.json({ devices: list, count: list.length });
}
