import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const recordDir = path.join(process.cwd(), 'recordings');

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');

    if (!fs.existsSync(recordDir)) {
      fs.mkdirSync(recordDir, { recursive: true });
    }

    // Direct file serve mode
    if (filename) {
      const safeFilename = path.basename(filename);
      const filePath = path.join(recordDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }

      const fileBuffer = fs.readFileSync(filePath);
      let contentType = 'application/octet-stream';
      if (safeFilename.endsWith('.mp4')) contentType = 'video/mp4';
      else if (safeFilename.endsWith('.webm')) contentType = 'video/webm';
      else if (safeFilename.endsWith('.png')) contentType = 'image/png';
      else if (safeFilename.endsWith('.jpg') || safeFilename.endsWith('.jpeg')) contentType = 'image/jpeg';

      return new Response(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache'
        }
      });
    }

    // List files mode with categorization
    const files = fs.readdirSync(recordDir);
    const mediaList = files.map((file) => {
      const filePath = path.join(recordDir, file);
      const stats = fs.statSync(filePath);
      const isVideo = file.endsWith('.mp4') || file.endsWith('.webm');
      const isImage = file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
      const isEncrypted = file.endsWith('.enc');

      // Category detection
      let category: 'recording' | 'motion' | 'snapshot' = 'recording';
      if (isVideo) {
        category = 'recording';
      } else if (file.toLowerCase().includes('motion')) {
        category = 'motion';
      } else {
        category = 'snapshot';
      }

      return {
        name: file,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
        type: isVideo ? 'video' : isImage ? 'image' : 'file',
        category,
        isEncrypted,
        url: `/api/media?file=${encodeURIComponent(file)}`
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, media: mediaList });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');

    if (!filename) {
      return NextResponse.json({ success: false, error: 'Tên file không hợp lệ' }, { status: 400 });
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(recordDir, safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: 'Đã xóa file thành công' });
    } else {
      return NextResponse.json({ success: false, error: 'File không tồn tại' }, { status: 404 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
