import { NextResponse } from 'next/server';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  // Network interfaces (IPv4, non-internal)
  const ifaces = os.networkInterfaces();
  const interfaces: any[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        interfaces.push({
          name,
          ip: addr.address,
          mac: addr.mac,
          netmask: addr.netmask
        });
      }
    }
  }

  // Listening ports in range 4200-4220
  const listeningPorts: any[] = [];
  try {
    const { stdout } = await execAsync('netstat -ano | findstr LISTENING', { timeout: 10000 });
    const lines = stdout.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const addr = parts[1];
        const colonIdx = addr.lastIndexOf(':');
        if (colonIdx > 0) {
          const port = parseInt(addr.substring(colonIdx + 1));
          if (port >= 4200 && port <= 4220) {
            listeningPorts.push({
              port,
              address: addr.substring(0, colonIdx),
              pid: parseInt(parts[4])
            });
          }
        }
      }
    }
  } catch {}

  // Firewall rule status
  let firewall = { exists: false, enabled: false, ports: '', profiles: '' };
  try {
    const { stdout } = await execAsync(
      'netsh advfirewall firewall show rule name="IPC_CoreService"',
      { timeout: 10000 }
    );
    firewall.exists = true;
    firewall.enabled = stdout.toLowerCase().includes('yes');
    const portMatch = stdout.match(/LocalPort:\s*(\S+)/i);
    if (portMatch) firewall.ports = portMatch[1];
    const profileMatch = stdout.match(/Profiles:\s*(.+)/i);
    if (profileMatch) firewall.profiles = profileMatch[1].trim();
  } catch {}

  return NextResponse.json({ interfaces, listeningPorts, firewall });
}
