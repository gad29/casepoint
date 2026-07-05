import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countMissingItems } from '@/data/domain';
import { createClient, getCaseFinance, listCases, listClients, listPayments } from '@/lib/store';

export async function GET() {
  const clients = listClients();
  const cases = listCases();
  const payments = listPayments();

  const enriched = clients.map((client) => {
    const clientCases = cases.filter((c) => c.clientId === client.id);
    const openCases = clientCases.filter((c) => c.stage !== 'closed');
    const missingItems = openCases.reduce((sum, c) => sum + countMissingItems(c), 0);
    const finance = clientCases.map((c) => getCaseFinance(c, payments));
    const balance = finance.reduce((sum, f) => sum + f.balance, 0);
    return {
      ...client,
      caseCount: clientCases.length,
      openCaseCount: openCases.length,
      missingItems,
      outstandingBalance: balance,
    };
  });

  return NextResponse.json({ ok: true, data: enriched });
}

export async function POST(request: NextRequest) {
  let body: { fullName?: string; phone?: string; idNumber?: string; email?: string; address?: string; city?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.fullName?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ ok: false, error: 'שם מלא וטלפון הם שדות חובה' }, { status: 400 });
  }

  const record = createClient({
    fullName: body.fullName,
    phone: body.phone,
    idNumber: body.idNumber,
    email: body.email,
    address: body.address,
    city: body.city,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true, data: record }, { status: 201 });
}
