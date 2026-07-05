import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasN8nConfig } from '@/lib/env';
import { triggerN8n } from '@/lib/n8n';

/**
 * Generic forwarder: lets the UI (or an authenticated caller) push an arbitrary
 * event to n8n, e.g. { "path": "casepoint/meeting-request", "payload": {...} }.
 * Auth is enforced by the middleware (admin session or x-casepoint-api-key).
 */
export async function POST(request: NextRequest) {
  if (!hasN8nConfig()) {
    return NextResponse.json({ ok: false, error: 'N8N_WEBHOOK_BASE_URL is not configured' }, { status: 503 });
  }

  let body: { path?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const path = (body.path || '').trim();
  if (!path || path.includes('..') || path.startsWith('http')) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook path' }, { status: 400 });
  }

  const result = await triggerN8n(path, { ...body.payload, firedAt: new Date().toISOString() });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: result.data ?? null });
}
