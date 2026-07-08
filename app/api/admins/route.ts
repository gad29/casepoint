import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { env } from '@/lib/env';
import { createAdmin, listAdmins } from '@/lib/store';

/** Admin-only (enforced by middleware). */
export async function GET() {
  const admins = listAdmins().map(({ passwordHash: _hash, ...admin }) => admin);
  return NextResponse.json({ ok: true, data: { admins, rootEmail: env.adminEmail } });
}

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; password?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 6) {
    return NextResponse.json({ ok: false, error: 'שם, אימייל וסיסמה (6 תווים לפחות) הם שדות חובה' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const record = createAdmin({ name: body.name, email: body.email, passwordHash, phone: body.phone });
  if (!record) {
    return NextResponse.json({ ok: false, error: 'האימייל כבר קיים במערכת (כמנהל או כעובד)' }, { status: 400 });
  }
  const { passwordHash: _hash, ...safe } = record;
  return NextResponse.json({ ok: true, data: safe }, { status: 201 });
}
