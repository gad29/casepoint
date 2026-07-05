import { NextResponse } from 'next/server';
import { countMissingItems, officeDisplayName, STAGE_LABELS } from '@/data/domain';
import { getCaseFinance, getDashboardSummary, listCases, listClients, listPayments } from '@/lib/store';

/**
 * Aggregated snapshot of the whole practice.
 * Used by the dashboard UI, and by n8n (with the x-casepoint-api-key header)
 * for Google Sheets summaries, daily briefings, etc.
 */
export async function GET() {
  const summary = getDashboardSummary();
  const clients = listClients();
  const payments = listPayments();

  const cases = listCases().map((caseRecord) => {
    const client = clients.find((c) => c.id === caseRecord.clientId);
    const finance = getCaseFinance(caseRecord, payments);
    return {
      caseId: caseRecord.id,
      title: caseRecord.title,
      clientId: caseRecord.clientId,
      clientName: client?.fullName || '',
      clientPhone: client?.phone || '',
      clientEmail: client?.email || '',
      office: officeDisplayName(caseRecord),
      stage: caseRecord.stage,
      stageLabel: STAGE_LABELS[caseRecord.stage],
      missingItems: countMissingItems(caseRecord),
      referenceNumber: caseRecord.referenceNumber || '',
      nextAction: caseRecord.nextAction || '',
      fee: finance.fee,
      paid: finance.paid,
      balance: finance.balance,
      paymentStatus: finance.status,
      openedAt: caseRecord.openedAt,
      submittedAt: caseRecord.submittedAt || '',
      closedAt: caseRecord.closedAt || '',
    };
  });

  return NextResponse.json({ ok: true, data: { summary, cases, generatedAt: new Date().toISOString() } });
}
