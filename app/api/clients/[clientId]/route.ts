import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countMissingItems } from '@/data/domain';
import {
  getCaseFinance,
  getClient,
  listActivity,
  listClientCases,
  listClientDocuments,
  listClientPayments,
  listPayments,
  updateClient,
} from '@/lib/store';

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { clientId } = await params;
  const client = getClient(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });

  const payments = listPayments();
  const cases = listClientCases(clientId).map((c) => ({
    ...c,
    missingItems: countMissingItems(c),
    finance: getCaseFinance(c, payments),
  }));

  return NextResponse.json({
    ok: true,
    data: {
      client,
      cases,
      documents: listClientDocuments(clientId),
      payments: listClientPayments(clientId),
      activity: listActivity({ clientId, limit: 30 }),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { clientId } = await params;
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const updated = updateClient(clientId, {
    fullName: body.fullName,
    phone: body.phone,
    idNumber: body.idNumber,
    email: body.email,
    address: body.address,
    city: body.city,
    notes: body.notes,
  });
  if (!updated) return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: updated });
}
