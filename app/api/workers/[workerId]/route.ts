import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { updateWorker } from '@/lib/store';

type Params = { params: Promise<{ workerId: string }> };

/** Admin-only (enforced by middleware): rename, activate/deactivate, reset password. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { workerId } = await params;
  let body: { name?: string; active?: boolean; password?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  let passwordHash: string | undefined;
  if (body.password) {
    if (body.password.length < 6) {
      return NextResponse.json({ ok: false, error: 'סיסמה חייבת להיות באורך 6 תווים לפחות' }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(body.password, 10);
  }

  const updated = updateWorker(workerId, { name: body.name, active: body.active, passwordHash, phone: body.phone });
  if (!updated) return NextResponse.json({ ok: false, error: 'Worker not found' }, { status: 404 });
  const { passwordHash: _hash, ...safe } = updated;
  return NextResponse.json({ ok: true, data: safe });
}
