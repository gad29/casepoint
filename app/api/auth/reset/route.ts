import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { completePasswordReset } from '@/lib/store';

/** Public: completes a password reset with the emailed/SMSed code. */
export async function POST(request: NextRequest) {
  let body: { email?: string; code?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const code = (body.code || '').trim();
  if (!email || !code || !body.newPassword || body.newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: 'אימייל, קוד וסיסמה חדשה (6 תווים לפחות) הם שדות חובה' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  const result = completePasswordReset(email, code, passwordHash);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
