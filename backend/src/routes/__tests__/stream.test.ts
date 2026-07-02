import request from 'supertest';
import express from 'express';
import streamRoutes from '../stream';
import { streamService } from '../../services/streamService';

// Mock the stream service
jest.mock('../../services/streamService', () => ({
  streamService: {
    startStream: jest.fn(),
    stopStream: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/stream', streamRoutes);

describe('Stream API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/stream/start', () => {
    it('should reject requests with no rtspUrl', async () => {
      const res = await request(app)
        .post('/api/stream/start')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject requests with non-string rtspUrl', async () => {
      const res = await request(app)
        .post('/api/stream/start')
        .send({ rtspUrl: 123 });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject requests with invalid protocol', async () => {
      const res = await request(app)
        .post('/api/stream/start')
        .send({ rtspUrl: 'file:///etc/passwd' });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid protocol. Only rtsp:// and rtsps:// are allowed.');
    });

    it('should handle maximum concurrent streams error', async () => {
      (streamService.startStream as jest.Mock).mockImplementation(() => {
        throw new Error('Maximum concurrent streams reached');
      });

      const res = await request(app)
        .post('/api/stream/start')
        .send({ rtspUrl: 'rtsp://test.url' });
      
      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('error', 'Maximum concurrent streams reached');
    });

    it('should successfully start a stream with a valid string rtspUrl', async () => {
      (streamService.startStream as jest.Mock).mockReturnValue({
        streamId: 'test-stream-id',
        hlsUrl: '/hls/test-stream-id/index.m3u8'
      });

      const res = await request(app)
        .post('/api/stream/start')
        .send({ rtspUrl: 'rtsp://test.url' });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        streamId: 'test-stream-id',
        hlsUrl: '/hls/test-stream-id/index.m3u8'
      });
      expect(streamService.startStream).toHaveBeenCalledWith('rtsp://test.url');
    });

    it('should handle errors thrown by streamService.startStream', async () => {
      (streamService.startStream as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });

      const res = await request(app)
        .post('/api/stream/start')
        .send({ rtspUrl: 'rtsp://test.url' });
      
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Test error');
    });
  });

  describe('POST /api/stream/stop', () => {
    it('should reject requests with no streamId', async () => {
      const res = await request(app)
        .post('/api/stream/stop')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject requests with non-string streamId', async () => {
      const res = await request(app)
        .post('/api/stream/stop')
        .send({ streamId: 123 });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should successfully stop an existing stream', async () => {
      (streamService.stopStream as jest.Mock).mockReturnValue(true);

      const res = await request(app)
        .post('/api/stream/stop')
        .send({ streamId: 'valid-stream-id' });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(streamService.stopStream).toHaveBeenCalledWith('valid-stream-id');
    });

    it('should return 404 when trying to stop a non-existent stream', async () => {
      (streamService.stopStream as jest.Mock).mockReturnValue(false);

      const res = await request(app)
        .post('/api/stream/stop')
        .send({ streamId: 'invalid-stream-id' });
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Stream not found');
    });

    it('should handle errors thrown by streamService.stopStream', async () => {
      (streamService.stopStream as jest.Mock).mockImplementation(() => {
        throw new Error('Stop error');
      });

      const res = await request(app)
        .post('/api/stream/stop')
        .send({ streamId: 'valid-stream-id' });
      
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Stop error');
    });
  });
});
