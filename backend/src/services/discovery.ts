// @ts-ignore
import onvif from 'node-onvif';

export interface DiscoveredCamera {
  ip: string;
  port: number;
  name: string;
  rtspUrl: string;
}

export async function discoverCameras(): Promise<DiscoveredCamera[]> {
  try {
    const infos = await onvif.startProbe();
    
    if (!Array.isArray(infos)) {
      return [];
    }

    const promises = infos.map(async (info: any): Promise<DiscoveredCamera | null> => {
      if (!info || !info.xaddrs || !info.xaddrs[0]) {
        return null;
      }
      
      const xaddr = info.xaddrs[0];
      let url: URL;
      try {
        url = new URL(xaddr);
      } catch (e) {
        console.warn(`Invalid xaddr URL: ${xaddr}`);
        return null;
      }
      
      const ip = url.hostname;
      const port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);

      const device = new onvif.OnvifDevice({ xaddr });

      let name = 'ONVIF Camera';
      // Fallback RTSP URL using host (which includes port if present)
      let rtspUrl = `rtsp://${url.host}/live/ch00_0`;

      const initPromise = device.init();
      initPromise.catch(() => {});

      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Device initialization timeout')), 3000);
      });

      try {
        await Promise.race([initPromise, timeoutPromise]);

        if (device.information && device.information.Manufacturer) {
          name = device.information.Manufacturer;
          if (device.information.Model) {
            name += ` ${device.information.Model}`;
          }
        }

        const profile = device.getCurrentProfile();
        if (profile && profile.stream && profile.stream.rtsp) {
          rtspUrl = profile.stream.rtsp;
        }
      } catch (err: any) {
        console.warn(`Failed to initialize device at ${xaddr}:`, err.message || err);
        // Uses fallback name and rtspUrl
      } finally {
        clearTimeout(timeoutId!); // Clean up timer whether success or fail
      }

      return {
        ip,
        port,
        name,
        rtspUrl
      };
    });

    const results = await Promise.allSettled(promises);
    const uniqueCameras = new Map<string, DiscoveredCamera>();
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        uniqueCameras.set(result.value.ip, result.value);
      }
    }
    return Array.from(uniqueCameras.values());
  } catch (error) {
    console.error('Error during ONVIF discovery:', error);
    throw error;
  }
}
