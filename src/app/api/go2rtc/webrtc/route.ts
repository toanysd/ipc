import { NextRequest, NextResponse } from 'next/server';

const GO2RTC_API = 'http://127.0.0.1:1984';

// POST /api/go2rtc/webrtc - Exchange WebRTC SDP { name, offer }
export async function POST(req: NextRequest) {
  try {
    const { name, offer } = await req.json();
    if (!name || !offer) {
      return NextResponse.json({ error: 'name and offer are required' }, { status: 400 });
    }
    const res = await fetch(`${GO2RTC_API}/api/webrtc?src=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer,
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `go2rtc error: ${text}` }, { status: res.status });
    }
    const sdpAnswer = await res.text();
    return new NextResponse(sdpAnswer, {
      status: 200,
      headers: { 'Content-Type': 'application/sdp' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
