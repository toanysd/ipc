import { discoverCameras } from '../services/discovery';
// @ts-ignore
import onvif from 'node-onvif';

jest.mock('node-onvif');

describe('stress test', () => {
  it('should handle 1000 cameras discovered simultaneously', async () => {
    const infos = [];
    for (let i = 0; i < 1000; i++) {
      infos.push({ xaddrs: [`http://192.168.1.${i % 254}/onvif`] });
    }
    
    (onvif.startProbe as jest.Mock).mockResolvedValue(infos);
    
    const mockInit = jest.fn().mockResolvedValue(true);
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
      information: { Manufacturer: 'TestCorp', Model: 'Cam1' },
      getCurrentProfile: () => ({ stream: { rtsp: 'rtsp://test' } })
    }));

    const start = Date.now();
    const result = await discoverCameras();
    const duration = Date.now() - start;
    
    expect(result.length).toBe(254);
    console.log(`Stress test completed in ${duration}ms`);
  });
});
