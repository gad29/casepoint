import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CASE_STAGES,
  countMissingItems,
  officeDisplayName,
  type CaseKind,
  type CaseStage,
  type GovernmentOffice,
  type OperatingCompany,
} from '@/data/domain';
import {
  caseVisibleTo,
  getCase,
  getCaseFinance,
  getClient,
  getSettings,
  listActivity,
  listCaseDocuments,
  listCasePayments,
  listWorkers,
  updateCase,
} from '@/lib/store';
import { getViewer } from '@/lib/viewer';

type Params = { params: Promise<{ caseId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const { caseId } = await params;
  const caseRecord = getCase(caseId);
  if (!caseRecord || !caseVisibleTo(caseRecord, auth.viewer)) {
    return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });
  }

  const isAdmin = auth.viewer.role === 'admin';
  const workers = listWorkers().map(({ passwordHash: _hash, ...worker }) => worker);
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
      payments: isAdmin ? listCasePayments(caseId) : [],
      activity: listActivity({ caseId, limit: 30 }),
      workers: isAdmin ? workers.filter((w) => w.active) : [],
      canManagePayments: isAdmin,
      canAssign: isAdmin,
      hasBlankContract: Boolean(getSettings().blankContract),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const { caseId } = await params;
  const existing = getCase(caseId);
  if (!existing || !caseVisibleTo(existing, auth.viewer)) {
    return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });
  }

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
    company?: OperatingCompany;
    caseKind?: CaseKind;
    troubleFlag?: boolean;
    troubleNote?: string;
    assignedTo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (body.stage && !CASE_STAGES.includes(body.stage)) {
    return NextResponse.json({ ok: false, error: `Unknown stage: ${body.stage}` }, { status: 400 });
  }

  // Only the admin can assign cases to workers.
  if (body.assignedTo !== undefined && auth.viewer.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'רק מנהל יכול לשייך תיקים לעובדים' }, { status: 403 });
  }

  const updated = updateCase(caseId, body);
  if (!updated) return NextResponse.json({ ok: false, error: 'Case not found' }, { status: 404 });
  return NextResponse.json({ ok: true, data: updated });
}
