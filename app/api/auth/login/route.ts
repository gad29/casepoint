import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminPassword } from '@/lib/admin-auth';
import { ADMIN_AUTH_COOKIE, adminCookieOptions, createAdminSessionToken, isAdminAuthEnabled } from '@/lib/admin-session';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!isAdminAuthEnabled()) {
    // No password configured yet — treat as signed in (local first-run mode).
    return NextResponse.json({ ok: true, authDisabled: true });
  }

  const valid = await verifyAdminPassword(body.password || '');
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'סיסמה שגויה' }, { status: 401 });
  }

  const token = await createAdminSessionToken();
  const response = NextResponse.json({ ok: true, email: env.adminEmail });
  response.cookies.set(ADMIN_AUTH_COOKIE, token, adminCookieOptions());
  return response;
}
