import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_AUTH_COOKIE, isAdminAuthEnabled, parseSessionToken } from '@/lib/admin-session';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const session = await parseSessionToken(request.cookies.get(ADMIN_AUTH_COOKIE)?.value);
  if (session) {
    return NextResponse.json({
      ok: true,
      role: session.scope,
      email: session.email || '',
      name: session.name || (session.scope === 'admin' ? 'מנהל' : ''),
      authDisabled: false,
    });
  }
  if (!isAdminAuthEnabled()) {
    return NextResponse.json({ ok: true, role: 'admin', email: env.adminEmail, name: 'מנהל', authDisabled: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
