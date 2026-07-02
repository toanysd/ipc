import { discoverCameras } from './discovery';
// @ts-ignore
import onvif from 'node-onvif';

jest.mock('node-onvif');

describe('discoverCameras', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return empty array if no cameras found', async () => {
    (onvif.startProbe as jest.Mock).mockResolvedValue([]);
    const result = await discoverCameras();
    expect(result).toEqual([]);
  });

  it('should return empty array if startProbe resolves to null', async () => {
    (onvif.startProbe as jest.Mock).mockResolvedValue(null);
    const result = await discoverCameras();
    expect(result).toEqual([]);
  });

  it('should ignore cameras missing xaddrs', async () => {
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      { xaddrs: [] },
      { xaddrs: undefined }
    ]);
    const result = await discoverCameras();
    expect(result).toEqual([]);
  });

  it('should handle device initialization timeout and use fallbacks', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.useFakeTimers();
    (onvif.startProbe as jest.Mock).mockResolvedValue([{ xaddrs: ['http://192.168.1.100/onvif/device_service'] }]);
    
    const mockInit = jest.fn(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
    }));

    const promise = discoverCameras();
    
    await Promise.resolve(); // allow microtasks to run so setTimeout is called
    // Fast-forward timeout
    jest.runAllTimers();
    
    const result = await promise;
    expect(result).toEqual([{
      ip: '192.168.1.100',
      port: 80,
      name: 'ONVIF Camera',
      rtspUrl: 'rtsp://192.168.1.100:554/live/ch00_0',
      serviceUrl: 'http://192.168.1.100/onvif/device_service'
    }]);

    jest.useRealTimers();
    consoleWarnSpy.mockRestore();
  });

  it('should deduplicate multiple responses from the same IP', async () => {
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      { xaddrs: ['http://192.168.1.100:80/onvif/device_service'] },
      { xaddrs: ['http://192.168.1.100:80/onvif/device_service_2'] }
    ]);

    const mockInit = jest.fn().mockResolvedValue(true);
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
      information: { Manufacturer: 'TestCorp', Model: 'Cam1' },
      getCurrentProfile: () => ({ stream: { rtsp: 'rtsp://192.168.1.100/test' } })
    }));

    const result = await discoverCameras();
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('192.168.1.100');
    expect(result[0].name).toBe('TestCorp Cam1');
  });

  it('should prevent unhandled promise rejection for delayed failures', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.useFakeTimers();
    (onvif.startProbe as jest.Mock).mockResolvedValue([{ xaddrs: ['http://192.168.1.100/onvif/device_service'] }]);
    
    const mockInit = jest.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed failure')), 5000)));
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
    }));

    const promise = discoverCameras();
    
    await Promise.resolve(); // allow setTimeout to be called
    jest.advanceTimersByTime(3000);
    const result = await promise;
    
    expect(result).toEqual([{
      ip: '192.168.1.100',
      port: 80,
      name: 'ONVIF Camera',
      rtspUrl: 'rtsp://192.168.1.100:554/live/ch00_0',
      serviceUrl: 'http://192.168.1.100/onvif/device_service'
    }]);

    // Fast-forward to trigger the delayed rejection and make sure it does not cause unhandled rejection
    jest.runAllTimers();
    
    jest.useRealTimers();
    consoleWarnSpy.mockRestore();
  });
  it('should throw an error if onvif.startProbe throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Probe failed');
    (onvif.startProbe as jest.Mock).mockRejectedValue(error);
    await expect(discoverCameras()).rejects.toThrow('Probe failed');
    consoleErrorSpy.mockRestore();
  });

  it('should gracefully handle invalid xaddr URLs', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      { xaddrs: ['invalid-url'] }
    ]);
    const result = await discoverCameras();
    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid xaddr URL: invalid-url'));
    consoleWarnSpy.mockRestore();
  });

  it('should ignore falsy elements in the startProbe response array', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      null,
      undefined,
      { xaddrs: ['http://192.168.1.100/onvif/device_service'] }
    ]);
    const mockInit = jest.fn().mockResolvedValue(true);
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
    }));
    const result = await discoverCameras();
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('192.168.1.100');
    consoleWarnSpy.mockRestore();
  });

  it('should handle immediate rejection of device.init() and use fallbacks', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      { xaddrs: ['http://192.168.1.100/onvif/device_service'] }
    ]);
    const mockInit = jest.fn().mockRejectedValue(new Error('Init failed'));
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
    }));
    
    const result = await discoverCameras();
    expect(result).toEqual([{
      ip: '192.168.1.100',
      port: 80,
      name: 'ONVIF Camera',
      rtspUrl: 'rtsp://192.168.1.100:554/live/ch00_0',
      serviceUrl: 'http://192.168.1.100/onvif/device_service'
    }]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('should fallback to port 443 for https xaddr without explicit port', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (onvif.startProbe as jest.Mock).mockResolvedValue([
      { xaddrs: ['https://192.168.1.100/onvif/device_service'] }
    ]);
    const mockInit = jest.fn().mockResolvedValue(true);
    (onvif.OnvifDevice as jest.Mock).mockImplementation(() => ({
      init: mockInit,
    }));
    const result = await discoverCameras();
    expect(result).toHaveLength(1);
    expect(result[0].port).toBe(443);
    expect(result[0].rtspUrl).toBe('rtsp://192.168.1.100:554/live/ch00_0');
    consoleWarnSpy.mockRestore();
  });
});
