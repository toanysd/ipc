import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class RecordService {
  private activeRecordings: Map<string, ChildProcess> = new Map();

  constructor() {
    const cleanup = () => {
      this.activeRecordings.forEach((ffmpegProcess, recordId) => {
        console.log(`Killing FFmpeg process for recording ${recordId} on exit`);
        ffmpegProcess.kill('SIGKILL');
      });
    };
    
    process.on('exit', cleanup);
  }

  public startRecording(rtspUrl: string): { recordId: string; filename: string } {
    if (!rtspUrl) {
      throw new Error("rtspUrl is required");
    }

    const recordId = crypto.randomUUID();
    const filename = `recording_${recordId}.mp4`;
    const recordingsDir = path.join(__dirname, '../../recordings');
    const outputPath = path.join(recordingsDir, filename);

    fs.mkdirSync(recordingsDir, { recursive: true });

    const args = [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c', 'copy',
      '-f', 'mp4',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['pipe', 'ignore', 'ignore']
    });

    if (ffmpegProcess.stdin) {
      ffmpegProcess.stdin.on('error', (err) => {
        console.error(`FFmpeg stdin error for recording ${recordId}:`, err);
      });
    }

    ffmpegProcess.on('error', (err) => {
      console.error(`FFmpeg process error for recording ${recordId}:`, err);
    });

    ffmpegProcess.on('exit', (code, signal) => {
      console.log(`FFmpeg process exited for recording ${recordId} with code ${code} and signal ${signal}`);
      this.activeRecordings.delete(recordId);
    });

    this.activeRecordings.set(recordId, ffmpegProcess);

    return { recordId, filename };
  }

  public stopRecording(recordId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpegProcess = this.activeRecordings.get(recordId);
      if (ffmpegProcess && ffmpegProcess.stdin) {
        let isResolved = false;

        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            console.warn(`stopRecording timeout for ${recordId}, using SIGKILL`);
            ffmpegProcess.kill('SIGKILL');
            isResolved = true;
            resolve(true);
          }
        }, 3000);

        ffmpegProcess.once('exit', () => {
          if (!isResolved) {
            clearTimeout(timeoutId);
            isResolved = true;
            resolve(true);
          }
        });
        ffmpegProcess.stdin.write('q\n');
      } else {
        resolve(false);
      }
    });
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down RecordService...');
    const stopPromises: Promise<void>[] = [];
    
    this.activeRecordings.forEach((ffmpegProcess, recordId) => {
      if (ffmpegProcess.exitCode === null && !ffmpegProcess.killed) {
        stopPromises.push(this.stopRecording(recordId).then(() => {}));
      }
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('FFmpeg shutdown timed out, proceeding...');
        resolve();
      }, 5000);
    });

    await Promise.race([Promise.all(stopPromises), timeoutPromise]);

    this.activeRecordings.forEach((ffmpegProcess, recordId) => {
      if (ffmpegProcess.exitCode === null && !ffmpegProcess.killed) {
        console.warn(`Aggressively killing FFmpeg process for recording ${recordId}`);
        ffmpegProcess.kill('SIGKILL');
      }
    });

    console.log('RecordService shutdown complete.');
  }
}

export const recordService = new RecordService();
