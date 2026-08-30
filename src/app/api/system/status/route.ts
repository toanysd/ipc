import { NextResponse } from 'next/server';
import os from 'os';
import fs from 'fs';
import path from 'path';

function parseConfig(configPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(configPath)) return result;
  const lines = fs.readFileSync(configPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      result[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
    }
  }
  return result;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'MB';
  return (bytes / 1073741824).toFixed(1) + 'GB';
}

export async function GET() {
  // Check system install first, then local
  const systemConfigPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager', 'ndm.conf');
  const localConfigPath = path.join(process.cwd(), 'CoreService', 'config.ini');
  const configPath = fs.existsSync(systemConfigPath) ? systemConfigPath : localConfigPath;
  const config = parseConfig(configPath);
  const installed = fs.existsSync(systemConfigPath);

  const portFile = path.join(process.cwd(), 'ipc_port.txt');
  let port = parseInt(config.PORT || '4200');
  if (fs.existsSync(portFile)) {
    try { port = parseInt(fs.readFileSync(portFile, 'utf-8').trim()); } catch {}
  }

  const systemFirewallDone = fs.existsSync(path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager', '.state', 'firewall.done'));
  const localFirewallDone = fs.existsSync(
    path.join(process.cwd(), 'CoreService', '.state', 'firewall.done')
  );
  const firewallDone = systemFirewallDone || localFirewallDone;

  const mem = process.memoryUsage();

  return NextResponse.json({
    server: {
      running: true,
      installed,
      installDir: installed ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager') : null,
      uptime: formatUptime(process.uptime()),
      uptimeSeconds: Math.floor(process.uptime()),
      port,
      mode: config.MODE || 'dev',
      pid: process.pid
    },
    node: {
      version: process.version,
      memory: {
        rss: formatBytes(mem.rss),
        heapUsed: formatBytes(mem.heapUsed),
        heapTotal: formatBytes(mem.heapTotal)
      }
    },
    os: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem()),
      uptime: formatUptime(os.uptime()),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown'
    },
    firewall: {
      installed: firewallDone,
      ruleName: 'Network Device Manager',
      portRange: `${config.PORT_RANGE_START || '4200'}-${config.PORT_RANGE_END || '4220'}`
    }
  });
}
