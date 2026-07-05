import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ChecklistStatus } from '@/data/domain';
import { addChecklistItem, getCase, removeChecklistItem, updateChecklistItem } from '@/lib/store';

type Params = { params: Promise<{ caseId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { caseId } = await params;
  if (!getCase(caseId)) return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });

  let body: { label?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const item = addChecklistItem(caseId, body.label || '', body.code);
  if (!item) return NextResponse.json({ ok: false, error: 'הוספת פריט נכשלה (אולי כבר קיים)' }, { status: 400 });
  return NextResponse.json({ ok: true, data: item }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { caseId } = await params;
  let body: { code?: string; status?: ChecklistStatus; note?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.code) return NextResponse.json({ ok: false, error: 'Missing checklist item code' }, { status: 400 });
  const item = updateChecklistItem(caseId, body.code, { status: body.status, note: body.note, label: body.label });
  if (!item) return NextResponse.json({ ok: false, error: 'Checklist item not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: item });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { caseId } = await params;
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ ok: false, error: 'Missing checklist item code' }, { status: 400 });
  const removed = removeChecklistItem(caseId, code);
  if (!removed) return NextResponse.json({ ok: false, error: 'Checklist item not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
