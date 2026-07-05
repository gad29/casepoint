import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/data/domain';
import { createPayment, listPayments } from '@/lib/store';

export async function GET() {
  return NextResponse.json({ ok: true, data: listPayments() });
}

export async function POST(request: NextRequest) {
  let body: { clientId?: string; caseId?: string; amount?: number; method?: PaymentMethod; paidAt?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.clientId || !body.amount || body.amount <= 0) {
    return NextResponse.json({ ok: false, error: 'לקוח וסכום חיובי הם שדות חובה' }, { status: 400 });
  }
  const method: PaymentMethod = body.method && body.method in PAYMENT_METHOD_LABELS ? body.method : 'other';

  const record = createPayment({
    clientId: body.clientId,
    caseId: body.caseId,
    amount: body.amount,
    method,
    paidAt: body.paidAt,
    note: body.note,
  });
  if (!record) return NextResponse.json({ ok: false, error: 'Client not found or invalid amount' }, { status: 400 });
  return NextResponse.json({ ok: true, data: record }, { status: 201 });
}
