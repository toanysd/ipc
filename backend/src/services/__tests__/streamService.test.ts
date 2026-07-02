import { streamService } from '../streamService';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true)
}));

describe('StreamService', () => {
  let mockProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockProcess = {
      on: jest.fn(),
      kill: jest.fn()
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
  });

  describe('startStream', () => {
    it('should require rtspUrl', () => {
      expect(() => {
        streamService.startStream('');
      }).toThrow('rtspUrl is required');
    });

    it('should reject invalid protocol', () => {
      expect(() => {
        streamService.startStream('file:///etc/passwd');
      }).toThrow('Invalid protocol. Only rtsp:// and rtsps:// are allowed.');
    });

    it('should enforce maximum concurrent streams', () => {
      const rtspUrl = 'rtsp://test.url';
      
      // Start 10 streams
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(streamService.startStream(rtspUrl));
      }
      
      // 11th stream should fail
      expect(() => {
        streamService.startStream(rtspUrl);
      }).toThrow('Maximum concurrent streams reached');
      
      // Cleanup
      results.forEach(res => streamService.stopStream(res.streamId));
    });

    it('should start a stream and return streamId and hlsUrl', () => {
      const rtspUrl = 'rtsp://test.url';
      const result = streamService.startStream(rtspUrl);
      
      expect(result).toHaveProperty('streamId');
      expect(result).toHaveProperty('hlsUrl');
      expect(typeof result.streamId).toBe('string');
      expect(result.hlsUrl).toBe(`/hls/${result.streamId}/index.m3u8`);
      
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
        '-i', rtspUrl,
        '-f', 'hls'
      ]));
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('stopStream', () => {
    it('should return false for non-existent stream', () => {
      const result = streamService.stopStream('non-existent');
      expect(result).toBe(false);
    });

    it('should return true and kill process for existing stream', () => {
      const result = streamService.startStream('rtsp://test.url');
      const stopResult = streamService.stopStream(result.streamId);
      
      expect(stopResult).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');
    });
  });
});
