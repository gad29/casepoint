import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { listDueReminders } from '@/lib/store';
import { getViewer } from '@/lib/viewer';

/**
 * Due reminders feed for the n8n scheduler.
 * GET /api/tasks/due?markSent=1 returns each due reminder exactly once,
 * with the assignee's email/phone and requested channels.
 * Auth: admin session, or the x-crmye-api-key token (n8n).
 */
export async function GET(request: NextRequest) {
  const providedToken = request.headers.get('x-crmye-api-key') || request.headers.get('x-casepoint-api-key');
  const hasToken = Boolean(env.apiAccessToken && providedToken === env.apiAccessToken);
  if (!hasToken) {
    const auth = await getViewer();
    if (!auth || auth.viewer.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin or API token required' }, { status: 403 });
    }
  }

  const markSent = request.nextUrl.searchParams.get('markSent') === '1';
  const reminders = listDueReminders(markSent);
  return NextResponse.json({ ok: true, data: { reminders, count: reminders.length, generatedAt: new Date().toISOString() } });
}
