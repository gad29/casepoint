import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyAdminPassword } from '@/lib/admin-auth';
import { ADMIN_AUTH_COOKIE, adminCookieOptions, createSessionToken, isAdminAuthEnabled } from '@/lib/admin-session';
import { env } from '@/lib/env';
import { getAdminByEmail, getWorkerByEmail } from '@/lib/store';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';

  // Email login: additional admins first, then workers.
  if (email) {
    const admin = getAdminByEmail(email);
    if (admin) {
      if (!admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
        return NextResponse.json({ ok: false, error: 'אימייל או סיסמה שגויים' }, { status: 401 });
      }
      const token = await createSessionToken({ scope: 'admin', email: admin.email, name: admin.name });
      const response = NextResponse.json({ ok: true, role: 'admin', name: admin.name, email: admin.email });
      response.cookies.set(ADMIN_AUTH_COOKIE, token, adminCookieOptions());
      return response;
    }

    const worker = getWorkerByEmail(email);
    if (!worker || !worker.active) {
      return NextResponse.json({ ok: false, error: 'אימייל או סיסמה שגויים' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, worker.passwordHash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'אימייל או סיסמה שגויים' }, { status: 401 });
    }
    const token = await createSessionToken({ scope: 'worker', workerId: worker.id, name: worker.name, email: worker.email });
    const response = NextResponse.json({ ok: true, role: 'worker', name: worker.name, email: worker.email });
    response.cookies.set(ADMIN_AUTH_COOKIE, token, adminCookieOptions());
    return response;
  }

  // Admin login: password only.
  if (!isAdminAuthEnabled()) {
    // No password configured yet — treat as signed in (local first-run mode).
    return NextResponse.json({ ok: true, role: 'admin', authDisabled: true });
  }

  const valid = await verifyAdminPassword(password);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'סיסמה שגויה' }, { status: 401 });
  }

  const token = await createSessionToken({ scope: 'admin', email: env.adminEmail });
  const response = NextResponse.json({ ok: true, role: 'admin', email: env.adminEmail });
  response.cookies.set(ADMIN_AUTH_COOKIE, token, adminCookieOptions());
  return response;
}
