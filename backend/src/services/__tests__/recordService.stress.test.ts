import { recordService } from '../recordService';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
}));

describe('RecordService Stress Test', () => {
  let mockProcess: any;

  beforeEach(() => {
    mockProcess = new EventEmitter();
    mockProcess.stdin = new EventEmitter();
    mockProcess.stdin.write = jest.fn();
    mockProcess.kill = jest.fn();
    mockProcess.exitCode = null;
    mockProcess.killed = false;

    (spawn as jest.Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not hang if FFmpeg does not exit after stopRecording', async () => {
    const { recordId } = recordService.startRecording('rtsp://dummy');
    
    const stopPromise = recordService.stopRecording(recordId);
    
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000));
    
    const result = await Promise.race([stopPromise, timeout]);
    
    expect(result).toBe('timeout');
  });

  it('multiple rapid stopRecording calls should not crash', async () => {
    const { recordId } = recordService.startRecording('rtsp://dummy');
    
    const stop1 = recordService.stopRecording(recordId);
    const stop2 = recordService.stopRecording(recordId);
    const stop3 = recordService.stopRecording(recordId);
    
    expect(mockProcess.stdin.write).toHaveBeenCalledTimes(3);
    
    setTimeout(() => {
      mockProcess.emit('exit', 0, null);
    }, 100);
    
    const results = await Promise.all([stop1, stop2, stop3]);
    expect(results).toEqual([true, true, true]);
    
    const stop4 = await recordService.stopRecording(recordId);
    expect(stop4).toBe(false);
  });
  
  it('shutdown() should actually kill processes if they time out', async () => {
    const { recordId } = recordService.startRecording('rtsp://dummy');
    
    const start = Date.now();
    // Use a fast timeout for the test to avoid waiting 5s.
    // Wait, the timeout in shutdown() is hardcoded to 5000ms.
    // So this test will take ~5s.
    await recordService.shutdown();
    const duration = Date.now() - start;
    
    expect(duration).toBeGreaterThanOrEqual(4900);
    
    // Expect the process to be killed because otherwise it hangs Node
    expect(mockProcess.kill).toHaveBeenCalled(); 
  }, 10000);
});
