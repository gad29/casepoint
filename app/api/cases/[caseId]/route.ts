import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CASE_STAGES, countMissingItems, officeDisplayName, type CaseStage, type GovernmentOffice } from '@/data/domain';
import {
  getCase,
  getCaseFinance,
  getClient,
  listActivity,
  listCaseDocuments,
  listCasePayments,
  updateCase,
} from '@/lib/store';

type Params = { params: Promise<{ caseId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { caseId } = await params;
  const caseRecord = getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });

  const client = getClient(caseRecord.clientId);
  return NextResponse.json({
    ok: true,
    data: {
      case: {
        ...caseRecord,
        officeName: officeDisplayName(caseRecord),
        missingItems: countMissingItems(caseRecord),
        finance: getCaseFinance(caseRecord),
      },
      client,
      documents: listCaseDocuments(caseId),
      payments: listCasePayments(caseId),
      activity: listActivity({ caseId, limit: 30 }),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { caseId } = await params;
  let body: {
    title?: string;
    office?: GovernmentOffice;
    officeOther?: string;
    description?: string;
    stage?: CaseStage;
    fee?: number;
    referenceNumber?: string;
    nextAction?: string;
    notes?: string;
    decision?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (body.stage && !CASE_STAGES.includes(body.stage)) {
    return NextResponse.json({ ok: false, error: `Unknown stage: ${body.stage}` }, { status: 400 });
  }

  const updated = updateCase(caseId, body);
  if (!updated) return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: updated });
}
