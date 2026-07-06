import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteDocument, documentVisibleTo, getDocument, readDocumentFile, updateDocumentMeta } from '@/lib/store';
import { getViewer } from '@/lib/viewer';

type Params = { params: Promise<{ documentId: string }> };

async function guardedDocument(documentId: string) {
  const auth = await getViewer();
  if (!auth) return undefined;
  const record = getDocument(documentId);
  if (!record || !documentVisibleTo(record, auth.viewer)) return undefined;
  return record;
}

/** GET returns the raw file (inline by default, attachment with ?download=1). Add ?meta=1 for the JSON record. */
export async function GET(request: NextRequest, { params }: Params) {
  const { documentId } = await params;
  const record = await guardedDocument(documentId);
  if (!record) return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });

  if (request.nextUrl.searchParams.get('meta') === '1') {
    return NextResponse.json({ ok: true, data: record });
  }

  const file = readDocumentFile(record);
  if (!file) return NextResponse.json({ ok: false, error: 'File missing on disk' }, { status: 404 });

  const download = request.nextUrl.searchParams.get('download') === '1';
  const encodedName = encodeURIComponent(record.originalName);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': record.mimeType || 'application/octet-stream',
      'Content-Length': String(file.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { documentId } = await params;
  if (!(await guardedDocument(documentId))) {
    return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  }
  let body: { label?: string; caseId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
  const updated = updateDocumentMeta(documentId, body);
  if (!updated) return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { documentId } = await params;
  if (!(await guardedDocument(documentId))) {
    return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  }
  const deleted = deleteDocument(documentId);
  if (!deleted) return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
