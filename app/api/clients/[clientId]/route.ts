import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countMissingItems } from '@/data/domain';
import {
  caseVisibleTo,
  clientVisibleTo,
  getCaseFinance,
  getClient,
  listActivity,
  listClientCases,
  listClientDocuments,
  listClientPayments,
  listPayments,
  listWorkers,
  updateClient,
} from '@/lib/store';
import { getViewer } from '@/lib/viewer';

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = getClient(clientId);
  if (!client || !clientVisibleTo(client, auth.viewer)) {
    return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
  }

  const payments = listPayments();
  const workers = listWorkers();
  const workerName = (id?: string) => (id && id !== 'admin' ? workers.find((w) => w.id === id)?.name || '' : '');
  const cases = listClientCases(clientId)
    .filter((c) => caseVisibleTo(c, auth.viewer))
    .map((c) => ({
      ...c,
      missingItems: countMissingItems(c),
      finance: getCaseFinance(c, payments),
      assignedToName: workerName(c.assignedTo),
      openedByName: workerName(c.openedBy),
    }));

  const isAdmin = auth.viewer.role === 'admin';
  return NextResponse.json({
    ok: true,
    data: {
      client,
      cases,
      documents: listClientDocuments(clientId),
      payments: isAdmin ? listClientPayments(clientId) : [],
      activity: listActivity({ clientId, limit: 30 }),
      canManagePayments: isAdmin,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getViewer();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = getClient(clientId);
  if (!client || !clientVisibleTo(client, auth.viewer)) {
    return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
  }

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
