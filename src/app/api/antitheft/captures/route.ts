import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.antitheft');
const CAPTURES_DIR = path.join(DATA_DIR, 'captures');

function ensureDir() {
  if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

// POST — Client uploads a capture (webcam photo or screenshot)
export async function POST(request: Request) {
  try {
    const { deviceId, type, image, timestamp } = await request.json();
    if (!deviceId || !type || !image) {
      return NextResponse.json({ error: 'deviceId, type, image required' }, { status: 400 });
    }

    ensureDir();

    const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${deviceId}_${type}_${ts}.jpg`;
    const filepath = path.join(CAPTURES_DIR, filename);

    // image is base64
    const buffer = Buffer.from(image, 'base64');
    fs.writeFileSync(filepath, buffer);

    // Save metadata
    const metaFile = path.join(DATA_DIR, 'captures_meta.json');
    let meta: any[] = [];
    if (fs.existsSync(metaFile)) {
      try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
    }
    meta.push({
      deviceId,
      type,
      filename,
      timestamp: timestamp || new Date().toISOString(),
      size: buffer.length,
    });
    // Keep last 200 entries
    if (meta.length > 200) meta = meta.slice(-200);
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    return NextResponse.json({ ok: true, filename, size: buffer.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — Dashboard retrieves capture list or a specific image
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  const filename = searchParams.get('file');

  ensureDir();

  // Return specific image
  if (filename) {
    const filepath = path.join(CAPTURES_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const buffer = fs.readFileSync(filepath);
    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // Return capture list
  const metaFile = path.join(DATA_DIR, 'captures_meta.json');
  let meta: any[] = [];
  if (fs.existsSync(metaFile)) {
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
  }

  if (deviceId) {
    meta = meta.filter((m: any) => m.deviceId === deviceId);
  }

  // Most recent first
  meta.reverse();

  return NextResponse.json({ captures: meta.slice(0, 50), total: meta.length });
}
