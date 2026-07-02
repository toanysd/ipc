// @ts-ignore
import onvif from 'node-onvif';
import os from 'os';
import net from 'net';

export interface DiscoveredCamera {
  ip: string;
  port: number;
  name: string;
  rtspUrl: string;
  serviceUrl?: string;
}

let activeProbe: Promise<any[]> | null = null;

// Helper to convert IP to long integer
function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

// Helper to convert long integer to IP
function longToIp(long: number): string {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255
  ].join('.');
}

// Get all IPs in the subnet
function getSubnetIPs(ip: string, netmask: string): string[] {
  if (netmask === '255.255.255.0') {
    const parts = ip.split('.');
    const base = parts.slice(0, 3).join('.');
    const ips = [];
    for (let i = 1; i <= 254; i++) {
      ips.push(`${base}.${i}`);
    }
    return ips;
  }
  
  try {
    const ipInt = ipToLong(ip);
    const maskInt = ipToLong(netmask);
    const network = ipInt & maskInt;
    const broadcast = network | (~maskInt);
    const ips = [];
    for (let i = network + 1; i < broadcast; i++) {
      ips.push(longToIp(i));
    }
    return ips;
  } catch (e) {
    return [];
  }
}

// Check if a specific TCP port is open on an IP
function checkPort(ip: string, port: number, timeout = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;
    
    socket.setTimeout(timeout);
    
    socket.once('connect', () => {
      status = true;
      socket.destroy();
    });
    
    socket.once('timeout', () => {
      socket.destroy();
    });
    
    socket.once('error', () => {
      socket.destroy();
    });
    
    socket.once('close', () => {
      resolve(status);
    });
    
    socket.connect(port, ip);
  });
}

// Scan a list of IPs and ports with a concurrency limit
async function scanIPs(ips: string[], ports: number[], concurrency = 60): Promise<{ip: string, port: number}[]> {
  const tasks: {ip: string, port: number}[] = [];
  for (const ip of ips) {
    for (const port of ports) {
      tasks.push({ ip, port });
    }
  }
  
  const openTargets: {ip: string, port: number}[] = [];
  let index = 0;
  
  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index++];
      if (!task) break;
      const isOpen = await checkPort(task.ip, task.port);
      if (isOpen) {
        openTargets.push(task);
      }
    }
  }
  
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return openTargets;
}

export async function discoverCameras(): Promise<DiscoveredCamera[]> {
  try {
    let infos: any[] = [];
    
    // 1. Run ONVIF WS-Discovery probe
    if (process.env.STATIC_ONVIF_CAMERAS) {
      // Skip UDP probe if static cameras are defined (CI/Test mode)
    } else {
      try {
        if (process.env.NODE_ENV === 'test') {
          infos = await onvif.startProbe();
        } else {
          if (!activeProbe) {
            activeProbe = Promise.race([
              onvif.startProbe().catch((e: any) => { 
                console.warn('Probe failed:', e?.message || e); 
                return []; 
              }),
              new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3000))
            ]) as Promise<any[]>;
            
            activeProbe.finally(() => {
              activeProbe = null;
            }).catch(() => {});
          }
          infos = await activeProbe;
        }
      } catch (e: any) {
        console.warn('Probe threw error:', e?.message || e);
        if (process.env.NODE_ENV === 'test') {
          throw e;
        }
        infos = [];
      }
    }

    infos = Array.isArray(infos) ? [...infos] : [];

    // 2. Perform Subnet TCP scan as a reliable fallback/addition for WiFi client discovery
    if (!process.env.STATIC_ONVIF_CAMERAS && process.env.NODE_ENV !== 'test') {
      try {
        const interfaces = os.networkInterfaces();
        const subnetIPs: string[] = [];
        for (const name in interfaces) {
          const iface = interfaces[name];
          if (!iface) continue;
          for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
              const ips = getSubnetIPs(alias.address, alias.netmask);
              subnetIPs.push(...ips);
            }
          }
        }
        
        const uniqueSubnetIPs = Array.from(new Set(subnetIPs));
        const portsToScan = [80, 554, 8080, 8899];
        
        console.log(`Subnet scan: scanning ${uniqueSubnetIPs.length} IPs on ports ${portsToScan.join(', ')}...`);
        const openTargets = await scanIPs(uniqueSubnetIPs, portsToScan, 60);
        console.log(`Subnet scan found open ports:`, JSON.stringify(openTargets));
        
        for (const target of openTargets) {
          const serviceUrl = target.port === 554 
            ? `http://${target.ip}:554/cam/realmonitor`
            : `http://${target.ip}:${target.port}/onvif/device_service`;
          
          infos.push({ xaddrs: [serviceUrl] });
        }
      } catch (e: any) {
        console.warn('Subnet scan failed:', e.message);
      }
    }

    // Add static cameras from environment variable
    console.log("STATIC_ONVIF_CAMERAS: ", process.env.STATIC_ONVIF_CAMERAS);
    if (process.env.STATIC_ONVIF_CAMERAS) {
      const staticUrls = process.env.STATIC_ONVIF_CAMERAS.split(',');
      for (const url of staticUrls) {
        if (url.trim()) {
          infos.push({ xaddrs: [url.trim()] });
        }
      }
    }
    console.log("INFOS AFTER STATIC PUSH: ", JSON.stringify(infos, null, 2));

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

      let name = port === 554 ? 'Generic RTSP Camera' : 'ONVIF Camera';
      let rtspUrl = process.env.MOCK_STREAM_URL || `rtsp://${url.hostname}:554/live/ch00_0`;

      const initPromise = device.init();
      initPromise.catch((e: any) => { console.warn('Device init error:', e?.message || e); });

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
        rtspUrl,
        serviceUrl: xaddr
      };
    });

    const results = await Promise.allSettled(promises);
    const uniqueCameras = new Map<string, DiscoveredCamera>();
    console.log("RESULTS: ", JSON.stringify(results, null, 2));
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
