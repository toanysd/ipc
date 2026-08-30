import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.antitheft');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCommands(): Record<string, any[]> {
  ensureDir();
  if (!fs.existsSync(COMMANDS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(COMMANDS_FILE, 'utf-8')); } catch { return {}; }
}

function writeCommands(data: Record<string, any[]>) {
  ensureDir();
  fs.writeFileSync(COMMANDS_FILE, JSON.stringify(data, null, 2));
}

// POST — Dashboard queues a command for a device
export async function POST(request: Request) {
  try {
    const { deviceId, command, params } = await request.json();
    if (!deviceId || !command) {
      return NextResponse.json({ error: 'deviceId and command required' }, { status: 400 });
    }

    const validCommands = ['snap-webcam', 'snap-screen', 'location', 'start-stream', 'stop-stream'];
    if (!validCommands.includes(command)) {
      return NextResponse.json({ error: `Invalid command. Valid: ${validCommands.join(', ')}` }, { status: 400 });
    }

    const commands = readCommands();
    if (!commands[deviceId]) commands[deviceId] = [];
    commands[deviceId].push({
      command,
      params: params || {},
      timestamp: new Date().toISOString(),
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    });
    writeCommands(commands);

    return NextResponse.json({ ok: true, queued: command });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — Client polls for pending commands (and clears them)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
  }

  const commands = readCommands();
  const pending = commands[deviceId] || [];

  // Clear after reading
  if (pending.length > 0) {
    commands[deviceId] = [];
    writeCommands(commands);
  }

  return NextResponse.json({ commands: pending });
}
