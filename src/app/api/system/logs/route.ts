import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lines = Math.min(parseInt(searchParams.get('lines') || '50'), 500);
  const level = (searchParams.get('level') || 'ALL').toUpperCase();

  const systemLogPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'NetworkDeviceManager', '.state', 'service.log');
  const localLogPath = path.join(process.cwd(), 'CoreService', '.state', 'service.log');
  const logPath = fs.existsSync(systemLogPath) ? systemLogPath : localLogPath;

  if (!fs.existsSync(logPath)) {
    return NextResponse.json({
      content: 'Log file chưa tồn tại. Service chưa chạy lần nào.',
      totalLines: 0,
      showing: 0
    });
  }

  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    let logLines = content.split('\n').filter(l => l.trim());

    const totalLines = logLines.length;

    if (level !== 'ALL') {
      logLines = logLines.filter(l =>
        l.toUpperCase().includes(level) ||
        l.startsWith('===') // Keep separator lines
      );
    }

    const result = logLines.slice(-lines);

    return NextResponse.json({
      content: result.join('\n'),
      totalLines,
      showing: result.length,
      level
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Cannot read log file', message: err.message },
      { status: 500 }
    );
  }
}
