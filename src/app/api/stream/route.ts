import { NextRequest } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';

// Prevents Next.js from caching this API route
export const dynamic = 'force-dynamic';

let activeStreamsCount = 0;
const MAX_CONCURRENT_STREAMS = 10;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new Response('Missing RTSP URL parameter', { status: 400 });
  }

  if (!url.startsWith('rtsp://') && !url.startsWith('rtsps://') && !url.startsWith('http://') && !url.startsWith('https://')) {
    return new Response('Invalid protocol. Only rtsp://, rtsps://, http://, and https:// are allowed.', { status: 400 });
  }

  if (activeStreamsCount >= MAX_CONCURRENT_STREAMS) {
    return new Response('Maximum concurrent streams reached', { status: 429 });
  }

  activeStreamsCount++;
  let isClosed = false;
  const decrementCounter = () => {
    if (!isClosed) {
      isClosed = true;
      activeStreamsCount--;
    }
  };

  let command: any;
  let isAborted = false;
  let controllerClosed = false;

  req.signal.addEventListener('abort', () => {
    console.log('Client ngắt kết nối (abort), đang dừng FFmpeg...');
    isAborted = true;
    controllerClosed = true;
    decrementCounter();
    if (command) command.kill('SIGKILL');
  });

  const quality = req.nextUrl.searchParams.get('quality') || 'hd';

  // Dynamic output options based on quality setting
  const fpsOption = quality === 'sd' ? '10' : quality === 'hd' ? '25' : '15';
  const qualityOption = quality === 'sd' ? '6' : quality === 'hd' ? '2' : '3';
  const scaleOption = quality === 'sd' ? '640x360' : quality === 'hd' ? '1920x1080' : '1280x720';

  // Create a Web API ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      console.log(`Bắt đầu proxy luồng RTSP: ${url} (Chất lượng: ${quality.toUpperCase()})`);

      command = ffmpeg()
        .input(url)
        .inputOptions([
          ...(url.startsWith('rtsp') ? ['-rtsp_transport', 'tcp'] : []),
          '-analyzeduration', '1000000',
          '-probesize', '1000000'
        ])
        .outputOptions([
          '-f mpjpeg',       // Multipart JPEG format
          `-r ${fpsOption}`,  // Frame rate
          `-q:v ${qualityOption}`, // Quality (1-31, 2 is high quality)
          '-an',             // Disable audio
          `-s ${scaleOption}`// Resolution
        ])
        .on('start', (cmdLine) => {
          console.log(`FFmpeg started: ${cmdLine}`);
        })
        .on('error', (err: any) => {
          console.error(`FFmpeg Error: ${err.message}`);
          decrementCounter();
          if (!isAborted) {
            isAborted = true;
            if (!controllerClosed) {
              controllerClosed = true;
              try { controller.close(); } catch (e: any) { console.warn('Stream already closed', e.message); }
            }
          }
        })
        .on('end', () => {
          console.log('FFmpeg stream ended');
          decrementCounter();
          if (!req.signal.aborted && !isAborted) {
            isAborted = true;
            if (!controllerClosed) {
              controllerClosed = true;
              try { controller.close(); } catch (e: any) { console.warn('Stream already closed', e.message); }
            }
          }
        });

      // Get the Node.js pass-through stream
      const ffstream = command.pipe();
      ffstream.on('error', (err: any) => {
        console.error(`[ffstream error]`, err.message);
        decrementCounter();
        if (!isAborted) {
          isAborted = true;
          if (!controllerClosed) {
            controllerClosed = true;
            try { controller.close(); } catch (e: any) { console.warn('Stream already closed', e.message); }
          }
        }
      });

      ffstream.on('data', (chunk: any) => {
        if (isAborted || req.signal.aborted || controllerClosed) return;
        try {
          controller.enqueue(chunk);
        } catch (e: any) {
          console.warn('Stream enqueue failed', e.message);
          controllerClosed = true;
        }
      });

      // Handle client disconnects via cancel() instead of req.signal
    },
    cancel() {
      console.log('Client ngắt kết nối (cancel), đang dừng FFmpeg...');
      isAborted = true;
      controllerClosed = true;
      decrementCounter();
      if (command) {
        command.kill('SIGKILL');
      }
    }
  });

  // Return the stream with the specific MJPEG multipart content type
  return new Response(stream, {
    headers: {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
      'Pragma': 'no-cache'
    },
  });
}
