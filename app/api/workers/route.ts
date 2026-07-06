import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createWorker, listCases, listWorkers } from '@/lib/store';

/** Admin-only (enforced by middleware). */
export async function GET() {
  const cases = listCases();
  const workers = listWorkers().map(({ passwordHash: _hash, ...worker }) => ({
    ...worker,
    openCases: cases.filter(
      (c) => c.stage !== 'closed' && (c.openedBy === worker.id || c.assignedTo === worker.id),
    ).length,
  }));
  return NextResponse.json({ ok: true, data: workers });
}

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 6) {
    return NextResponse.json({ ok: false, error: 'שם, אימייל וסיסמה (6 תווים לפחות) הם שדות חובה' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const record = createWorker({ name: body.name, email: body.email, passwordHash });
  if (!record) {
    return NextResponse.json({ ok: false, error: 'האימייל כבר קיים במערכת' }, { status: 400 });
  }
  const { passwordHash: _hash, ...safe } = record;
  return NextResponse.json({ ok: true, data: safe }, { status: 201 });
}
