import { NextRequest, NextResponse } from 'next/server';

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

declare global {
  var recorders: { [key: string]: any };
}
global.recorders = global.recorders || Object.create(null);

const MAX_CONCURRENT_RECORDS = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cameraId, rtspUrl } = body;

    if (!cameraId || !rtspUrl) {
      return NextResponse.json({ success: false, error: 'Thiếu cameraId hoặc rtspUrl' }, { status: 400 });
    }

    if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://') && !rtspUrl.startsWith('http://')) {
      return NextResponse.json({ success: false, error: 'Invalid protocol. Only rtsp://, rtsps://, and http:// are allowed.' }, { status: 400 });
    }

    if (global.recorders[cameraId]) {
      return NextResponse.json({ success: false, error: 'Camera is already recording' }, { status: 429 });
    }

    if (Object.keys(global.recorders).length >= MAX_CONCURRENT_RECORDS) {
      return NextResponse.json({ success: false, error: 'Maximum concurrent recordings reached' }, { status: 429 });
    }

    const recordDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordDir)) {
      fs.mkdirSync(recordDir, { recursive: true });
    }

    // Check permissions
    try {
      fs.accessSync(recordDir, fs.constants.W_OK);
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Không có quyền ghi' }, { status: 500 });
    }

    // Check disk space (simulate requirement or use statfsSync)
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(recordDir);
        const freeSpace = stats.bavail * stats.bsize;
        if (freeSpace < 100 * 1024 * 1024) { // less than 100MB
          return NextResponse.json({ success: false, error: 'Không đủ dung lượng' }, { status: 500 });
        }
      }
    } catch (e) {
      // ignore
    }

    const safeCameraId = cameraId.replace(/[^a-zA-Z0-9_-]/g, '');
    const outputPath = path.join(recordDir, `${safeCameraId}-${Date.now()}.mp4`);

    // Spawn ffmpeg
    const ffmpegArgs: string[] = [
      '-analyzeduration', '1000000',
      '-probesize', '1000000',
      '-i', rtspUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-f', 'mp4',
      '-y',
      outputPath
    ];

    console.log('[API START RECORD] args:', ffmpegArgs);
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    if (ffmpeg.stdin) {
      ffmpeg.stdin.on('error', (err) => console.log(`[ffmpeg stdin error]`, err.message));
    }
    if (ffmpeg.stdout) {
      ffmpeg.stdout.on('error', (err) => console.log(`[ffmpeg stdout error]`, err.message));
    }
    if (ffmpeg.stderr) {
      ffmpeg.stderr.on('error', (err) => console.log(`[ffmpeg stderr error]`, err.message));
    }

    ffmpeg.stderr.on('data', (data) => {
      console.log(`[ffmpeg stderr] ${data.toString()}`);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[ffmpeg] exited with code ${code}`);
      if (global.recorders[cameraId] === ffmpeg) {
        delete global.recorders[cameraId];
      }
    });

    ffmpeg.on('error', () => {
      if (global.recorders[cameraId] === ffmpeg) {
        delete global.recorders[cameraId];
      }
    });

    global.recorders[cameraId] = ffmpeg;

    return NextResponse.json({ success: true, message: 'Recording started' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
