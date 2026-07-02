import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { discoverCameras } from '@/services/discovery';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    console.log('Bắt đầu quét mạng tìm IP Camera (ONVIF)...');
    const discovered = await discoverCameras();
    
    const cameras = discovered.map((cam, index) => ({
      id: `cam-${index}`,
      name: cam.name,
      hardware: 'Generic', // Assuming generic for now or parse from name
      ip: cam.ip,
      port: cam.port.toString(),
      serviceUrl: cam.serviceUrl || '',
      status: 'online',
      rtspUrl: cam.rtspUrl,
    }));

    return NextResponse.json({ success: true, cameras });
  } catch (error: any) {
    console.error('Lỗi khi quét ONVIF:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
