import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAdminAuthEnabled, parseAdminSessionToken, ADMIN_AUTH_COOKIE } from '@/lib/admin-session';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  if (!isAdminAuthEnabled()) {
    return NextResponse.json({ ok: true, email: env.adminEmail, authDisabled: true });
  }
  const session = await parseAdminSessionToken(request.cookies.get(ADMIN_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, email: session.email || env.adminEmail, authDisabled: false });
}
