import request from 'supertest';
import app from '../../app';
import * as discoveryService from '../../services/discovery';

jest.mock('../../services/discovery');

describe('Cameras Router', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/cameras', () => {
    it('should return 200 OK with the discovered camera array', async () => {
      const mockCameras = [
        {
          ip: '192.168.1.100',
          port: 80,
          name: 'Test Camera',
          rtspUrl: 'rtsp://192.168.1.100/stream'
        }
      ];
      
      (discoveryService.discoverCameras as jest.Mock).mockResolvedValue(mockCameras);

      const response = await request(app).get('/api/cameras');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCameras);
    });

    it('should return 500 when discoverCameras throws an error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (discoveryService.discoverCameras as jest.Mock).mockRejectedValue(new Error('Discovery failed'));

      const response = await request(app).get('/api/cameras');
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to discover cameras' });
      
      consoleErrorSpy.mockRestore();
    });
  });
});
