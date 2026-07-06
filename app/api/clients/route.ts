import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countMissingItems, DEFAULT_CHECKLIST_CODES, type CaseKind, type OperatingCompany } from '@/data/domain';
import { createCase, createClient, getCaseFinance, listCases, listPayments, listVisibleClients } from '@/lib/store';
import { actorId, getViewer } from '@/lib/viewer';

export async function GET() {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const clients = listVisibleClients(auth.viewer);
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
      hasTrouble: openCases.some((c) => c.troubleFlag),
      outstandingBalance: balance,
    };
  });

  return NextResponse.json({ ok: true, data: enriched });
}

export async function POST(request: NextRequest) {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  let body: {
    fullName?: string;
    phone?: string;
    idNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    notes?: string;
    /** Creating a client always opens a case; these fields configure it. */
    case?: {
      title?: string;
      company?: OperatingCompany;
      caseKind?: CaseKind;
      fee?: number;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.fullName?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ ok: false, error: 'שם מלא וטלפון הם שדות חובה' }, { status: 400 });
  }

  const creator = actorId(auth.session);
  const record = createClient({
    fullName: body.fullName,
    phone: body.phone,
    idNumber: body.idNumber,
    email: body.email,
    address: body.address,
    city: body.city,
    notes: body.notes,
    createdBy: creator,
  });

  // Every new client automatically gets a case with the full default checklist.
  const caseRecord = createCase({
    clientId: record.id,
    title: body.case?.title?.trim() || 'סיוע בשכר דירה',
    office: 'housing-ministry',
    company: body.case?.company,
    caseKind: body.case?.caseKind || 'new',
    fee: body.case?.fee,
    openedBy: creator,
    checklistCodes: DEFAULT_CHECKLIST_CODES,
  });

  return NextResponse.json({ ok: true, data: { client: record, case: caseRecord } }, { status: 201 });
}
