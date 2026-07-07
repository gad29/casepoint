import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/data/domain';
import { deletePayment, updatePayment } from '@/lib/store';

type Params = { params: Promise<{ paymentId: string }> };

/** Admin-only (enforced by middleware): fix a wrongly-recorded payment. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { paymentId } = await params;
  let body: { amount?: number; method?: PaymentMethod; paidAt?: string; note?: string; caseId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (body.amount !== undefined && (!Number.isFinite(body.amount) || body.amount <= 0)) {
    return NextResponse.json({ ok: false, error: 'סכום חייב להיות חיובי (למחיקת תשלום השתמש בכפתור המחיקה)' }, { status: 400 });
  }
  if (body.method && !(body.method in PAYMENT_METHOD_LABELS)) {
    return NextResponse.json({ ok: false, error: 'אמצעי תשלום לא מוכר' }, { status: 400 });
  }

  const updated = updatePayment(paymentId, body);
  if (!updated) return NextResponse.json({ ok: false, error: 'Payment not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { paymentId } = await params;
  const deleted = deletePayment(paymentId);
  if (!deleted) return NextResponse.json({ ok: false, error: 'Payment not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
