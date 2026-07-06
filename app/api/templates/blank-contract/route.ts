import { NextResponse } from 'next/server';
import { readBlankContract } from '@/lib/store';

/** Download the blank rent-contract template — available to any signed-in user (workers included). */
export async function GET() {
  const template = readBlankContract();
  if (!template) {
    return NextResponse.json({ ok: false, error: 'לא הועלה טופס חוזה שכירות ריק' }, { status: 404 });
  }
  const encodedName = encodeURIComponent(template.meta.originalName);
  return new NextResponse(new Uint8Array(template.buffer), {
    headers: {
      'Content-Type': template.meta.mimeType,
      'Content-Length': String(template.buffer.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
