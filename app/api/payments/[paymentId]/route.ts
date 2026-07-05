import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deletePayment } from '@/lib/store';

type Params = { params: Promise<{ paymentId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { paymentId } = await params;
  const deleted = deletePayment(paymentId);
  if (!deleted) return NextResponse.json({ ok: false, error: 'Payment not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
