import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_CONCURRENT_STREAMS = 10;

export class StreamService {
  private activeStreams: Map<string, ChildProcess> = new Map();

  constructor() {
    const cleanup = () => {
      this.activeStreams.forEach((ffmpegProcess, streamId) => {
        console.log(`Killing FFmpeg process for stream ${streamId} on shutdown`);
        ffmpegProcess.kill('SIGKILL');
      });
    };
    
    // Ensure all running streams are killed if the process exits or is interrupted
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  public startStream(rtspUrl: string): { streamId: string; hlsUrl: string } {
    if (!rtspUrl) {
      throw new Error("rtspUrl is required");
    }
    if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
      throw new Error("Invalid protocol. Only rtsp:// and rtsps:// are allowed.");
    }
    if (this.activeStreams.size >= MAX_CONCURRENT_STREAMS) {
      throw new Error("Maximum concurrent streams reached");
    }

    const streamId = crypto.randomUUID();
    const hlsDir = path.join(__dirname, '../../public/hls', streamId);

    // Create the output directory
    fs.mkdirSync(hlsDir, { recursive: true });

    const outputPath = path.join(hlsDir, 'index.m3u8');

    // Spawn FFmpeg process
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments+append_list',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.on('error', (err) => {
      console.error(`FFmpeg process error for stream ${streamId}:`, err);
    });

    ffmpegProcess.on('exit', (code, signal) => {
      console.log(`FFmpeg process exited for stream ${streamId} with code ${code} and signal ${signal}`);
      this.activeStreams.delete(streamId);
      
      // Clean up the HLS directory asynchronously to avoid Windows EBUSY locking errors
      setTimeout(() => {
        try {
          if (fs.existsSync(hlsDir)) {
            fs.rmSync(hlsDir, { recursive: true, force: true });
            console.log(`Cleaned up hls directory for stream ${streamId}`);
          }
        } catch (err) {
          console.error(`Failed to clean up hls directory for stream ${streamId}:`, err);
        }
      }, 1000);
    });

    this.activeStreams.set(streamId, ffmpegProcess);

    return {
      streamId,
      hlsUrl: `/hls/${streamId}/index.m3u8`
    };
  }

  public stopStream(streamId: string): boolean {
    const ffmpegProcess = this.activeStreams.get(streamId);
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGINT');
      this.activeStreams.delete(streamId);
      return true;
    }
    return false;
  }
}

export const streamService = new StreamService();
