import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function detectWebcams() {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-PnpDevice -Class Camera,Image -Status OK -ErrorAction SilentlyContinue | Select-Object FriendlyName, InstanceId, Status, Class | ConvertTo-Json -Compress"',
      { timeout: 10000 }
    );
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image' } | Select-Object Name, DeviceID, Status | ConvertTo-Json -Compress"`,
        { timeout: 10000 }
      );
      const parsed = JSON.parse(stdout || '[]');
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch {
      return [];
    }
  }
}

async function detectDisplays() {
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, AdapterRAM, Status | ConvertTo-Json -Compress"`,
      { timeout: 10000 }
    );
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch {
    return [];
  }
}

export async function GET() {
  const [webcams, displays] = await Promise.all([
    detectWebcams(),
    detectDisplays()
  ]);

  return NextResponse.json({
    webcams: webcams.map((w: any) => ({
      name: w.FriendlyName || w.Name || 'Unknown Camera',
      id: w.InstanceId || w.DeviceID || '',
      status: w.Status || 'Unknown',
      class: w.Class || w.PNPClass || 'Camera'
    })),
    displays: displays.map((d: any) => ({
      name: d.Name || 'Unknown Display',
      resolution: d.CurrentHorizontalResolution && d.CurrentVerticalResolution
        ? `${d.CurrentHorizontalResolution}x${d.CurrentVerticalResolution}`
        : 'Unknown',
      refreshRate: d.CurrentRefreshRate ? `${d.CurrentRefreshRate}Hz` : 'Unknown',
      vram: d.AdapterRAM ? `${Math.round(d.AdapterRAM / 1073741824 * 10) / 10}GB` : 'Unknown',
      status: d.Status || 'Unknown'
    }))
  });
}
