import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasN8nConfig } from '@/lib/env';
import { requestPasswordReset } from '@/lib/store';

/**
 * Public: requests a password-reset code, delivered via n8n on the chosen
 * channel. Responds identically whether or not the email exists.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; channel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'נא להזין כתובת אימייל תקינה' }, { status: 400 });
  }

  if (!hasN8nConfig()) {
    return NextResponse.json(
      { ok: false, error: 'שליחת קוד איפוס דורשת חיבור n8n מוגדר (N8N_WEBHOOK_BASE_URL). פנה למנהל המערכת.' },
      { status: 503 },
    );
  }

  const channel = body.channel === 'sms' || body.channel === 'whatsapp' ? body.channel : 'email';
  await requestPasswordReset(email, channel);
  // Always the same answer — email enumeration is not possible.
  return NextResponse.json({ ok: true });
}
