import { NextRequest, NextResponse } from 'next/server';

const GO2RTC_API = 'http://127.0.0.1:1984';

// GET /api/go2rtc/streams - List all streams
export async function GET() {
  try {
    const res = await fetch(`${GO2RTC_API}/api/streams`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

// POST /api/go2rtc/streams - Add a stream { name, url }
export async function POST(req: NextRequest) {
  try {
    const { name, url } = await req.json();
    if (!name || !url) {
      return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
    }
    const res = await fetch(`${GO2RTC_API}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`, {
      method: 'PUT',
    });
    return NextResponse.json({ success: true, status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

// DELETE /api/go2rtc/streams?name=xxx - Remove a stream
export async function DELETE(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'name parameter is required' }, { status: 400 });
    }
    const res = await fetch(`${GO2RTC_API}/api/streams?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    return NextResponse.json({ success: true, status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
