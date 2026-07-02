import { NextRequest, NextResponse } from 'next/server';

declare global {
  var recorders: { [key: string]: any };
}
global.recorders = global.recorders || Object.create(null);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cameraId } = body;

    if (!cameraId) {
      return NextResponse.json({ success: false, error: 'Thiếu cameraId' }, { status: 400 });
    }

    const command = global.recorders[cameraId];
    if (command) {
      try {
        if (command.stdin && command.stdin.writable) {
          // Attach error listener to catch async EPIPE or write-after-end
          command.stdin.on('error', (err: any) => {
            console.log('[ffmpeg stop stdin error]', err?.message);
          });
          command.stdin.write('q\n');
        } else {
          command.kill('SIGINT');
        }
      } catch (err: any) {
        console.log('[ffmpeg stop error]', err?.message);
        try {
          // Fallback to forcefully kill if stdin write throws synchronously
          command.kill('SIGINT');
        } catch (killErr) {
          // Ignore process already dead errors
        }
      }
      delete global.recorders[cameraId];
      return NextResponse.json({ success: true, message: 'Recording stopped' });
    }

    return NextResponse.json({ success: true, message: 'Process already stopped' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
