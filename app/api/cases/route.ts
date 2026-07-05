import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countMissingItems, officeDisplayName, type GovernmentOffice } from '@/data/domain';
import { createCase, getCaseFinance, listCases, listClients, listPayments } from '@/lib/store';

export async function GET() {
  const cases = listCases();
  const clients = listClients();
  const payments = listPayments();

  const enriched = cases.map((caseRecord) => {
    const client = clients.find((c) => c.id === caseRecord.clientId);
    return {
      ...caseRecord,
      clientName: client?.fullName || '',
      clientPhone: client?.phone || '',
      officeName: officeDisplayName(caseRecord),
      missingItems: countMissingItems(caseRecord),
      finance: getCaseFinance(caseRecord, payments),
    };
  });

  return NextResponse.json({ ok: true, data: enriched });
}

export async function POST(request: NextRequest) {
  let body: {
    clientId?: string;
    title?: string;
    office?: GovernmentOffice;
    officeOther?: string;
    description?: string;
    fee?: number;
    nextAction?: string;
    checklistCodes?: string[];
    customChecklist?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.clientId || !body.title?.trim() || !body.office) {
    return NextResponse.json({ ok: false, error: 'לקוח, כותרת תיק ומשרד ממשלתי הם שדות חובה' }, { status: 400 });
  }

  const record = createCase({
    clientId: body.clientId,
    title: body.title,
    office: body.office,
    officeOther: body.officeOther,
    description: body.description,
    fee: body.fee,
    nextAction: body.nextAction,
    checklistCodes: body.checklistCodes,
    customChecklist: body.customChecklist,
  });
  if (!record) return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: record }, { status: 201 });
}
