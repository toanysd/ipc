import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function parseConfig(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
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

function buildConfigContent(data: Record<string, string>): string {
  const lines = [
    '[CoreService]',
    '; IPC CORE SERVICE - CẤU HÌNH',
    '',
    `; Đường dẫn đến thư mục dự án IPC`,
    `PROJECT_DIR=${data.PROJECT_DIR || ''}`,
    '',
    `; Port ưu tiên`,
    `PORT=${data.PORT || '4200'}`,
    '',
    `; Dải port mở firewall`,
    `PORT_RANGE_START=${data.PORT_RANGE_START || '4200'}`,
    `PORT_RANGE_END=${data.PORT_RANGE_END || '4220'}`,
    '',
    `; Chế độ chạy: dev hoặc production`,
    `MODE=${data.MODE || 'dev'}`,
    ''
  ];
  return lines.join('\n');
}

export async function GET() {
  const systemConfigPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager', 'ndm.conf');
  const localConfigPath = path.join(process.cwd(), 'CoreService', 'config.ini');
  const configPath = fs.existsSync(systemConfigPath) ? systemConfigPath : localConfigPath;

  if (!fs.existsSync(configPath)) {
    return NextResponse.json({ error: 'config not found' }, { status: 404 });
  }
  const config = parseConfig(configPath);
  const raw = fs.readFileSync(configPath, 'utf-8');
  const installed = fs.existsSync(systemConfigPath);
  return NextResponse.json({ config, raw, installed, configPath });
}

export async function PUT(request: Request) {
  const systemConfigPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager', 'ndm.conf');
  const localConfigPath = path.join(process.cwd(), 'CoreService', 'config.ini');
  const configPath = fs.existsSync(systemConfigPath) ? systemConfigPath : localConfigPath;
  
  try {
    const body = await request.json();
    const content = buildConfigContent(body);
    // Remove ReadOnly attribute if exists (system install sets +R)
    fs.writeFileSync(configPath, content, 'utf-8');
    return NextResponse.json({ success: true, message: 'Config updated', configPath });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Cannot write config', message: err.message },
      { status: 500 }
    );
  }
}
