import Link from 'next/link';
import { countMissingItems, officeDisplayName, STAGE_LABELS, type CaseStage } from '@/data/domain';
import { getCaseFinance, getDashboardSummary, listActivity, listCases, listClients, listPayments } from '@/lib/store';

export const dynamic = 'force-dynamic';

function shekel(amount: number) {
  return `₪${amount.toLocaleString('he-IL')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const summary = getDashboardSummary();
  const clients = listClients();
  const payments = listPayments();
  const cases = listCases();
  const activity = listActivity({ limit: 12 });

  const attention = cases
    .filter((c) => c.stage !== 'closed' && (countMissingItems(c) > 0 || c.stage === 'action-required'))
    .slice(0, 8)
    .map((c) => ({
      ...c,
      clientName: clients.find((cl) => cl.id === c.clientId)?.fullName || '',
      missing: countMissingItems(c),
    }));

  const unpaidClosed = cases
    .filter((c) => c.stage === 'closed')
    .map((c) => ({ ...c, finance: getCaseFinance(c, payments), clientName: clients.find((cl) => cl.id === c.clientId)?.fullName || '' }))
    .filter((c) => c.finance.balance > 0)
    .slice(0, 5);

  const stageOrder = Object.keys(STAGE_LABELS) as CaseStage[];

  return (
    <div>
      <div className="hero">
        <div>
          <p className="eyebrow">לוח בקרה</p>
          <h1 style={{ margin: '6px 0 4px' }}>שלום 👋</h1>
          <p className="muted" style={{ margin: 0 }}>תמונת מצב של כל הלקוחות והתיקים.</p>
        </div>
        <div className="hero-actions">
          <Link className="button" href={'/clients?new=1' as never}>+ לקוח חדש</Link>
          <Link className="button button-secondary" href={'/cases?new=1' as never}>+ תיק חדש</Link>
        </div>
      </div>

      <div className="pipeline-cards" style={{ marginBottom: 20 }}>
        <div className="pipeline-card pc-active">
          <div className="pc-label">תיקים פעילים</div>
          <div className="pc-count">{summary.openCases}</div>
          <div className="muted" style={{ fontSize: 12 }}>מתוך {summary.cases} תיקים · {summary.clients} לקוחות</div>
        </div>
        <div className="pipeline-card pc-new">
          <div className="pc-label">ממתינים למסמכים</div>
          <div className="pc-count">{summary.missingDocsCases}</div>
          <div className="muted" style={{ fontSize: 12 }}>תיקים פתוחים עם מסמכים חסרים</div>
        </div>
        <div className="pipeline-card pc-stuck">
          <div className="pc-label">נדרשת השלמה</div>
          <div className="pc-count">{summary.actionRequired}</div>
          <div className="muted" style={{ fontSize: 12 }}>המשרד ביקש השלמות</div>
        </div>
        <div className="pipeline-card pc-done">
          <div className="pc-label">יתרה לגבייה</div>
          <div className="pc-count" style={{ fontSize: 34 }}>{shekel(summary.totalOutstanding)}</div>
          <div className="muted" style={{ fontSize: 12 }}>שולם {shekel(summary.totalPaid)} מתוך {shekel(summary.totalFees)}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="section-heading">
            <h3 style={{ margin: 0 }}>דורשים טיפול</h3>
            <Link className="mini-link" href="/cases">כל התיקים ←</Link>
          </div>
          {attention.length === 0 ? (
            <p className="muted">אין תיקים שדורשים טיפול כרגע. 🎉</p>
          ) : (
            <div className="urgent-list">
              {attention.map((c) => (
                <Link key={c.id} className="urgent-item" href={`/cases/${c.id}` as never}>
                  <span className={`urgent-dot ${c.stage === 'action-required' ? 'danger' : ''}`} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{c.clientName}</strong> · {c.title}
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {officeDisplayName(c)} · {STAGE_LABELS[c.stage]}
                    </span>
                  </span>
                  {c.missing > 0 && <span className="badge danger">{c.missing} חסרים</span>}
                </Link>
              ))}
            </div>
          )}

          {unpaidClosed.length > 0 && (
            <>
              <div className="doc-group-title" style={{ marginTop: 22 }}>תיקים סגורים שטרם שולמו</div>
              <div className="urgent-list">
                {unpaidClosed.map((c) => (
                  <Link key={c.id} className="urgent-item" href={`/cases/${c.id}` as never}>
                    <span className="urgent-dot danger" />
                    <span style={{ flex: 1 }}>
                      <strong>{c.clientName}</strong> · {c.title}
                    </span>
                    <span className="badge warn">יתרה {shekel(c.finance.balance)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="section-heading">
              <h3 style={{ margin: 0 }}>תיקים לפי שלב</h3>
            </div>
            {stageOrder.map((stage) => (
              <div key={stage} className="split" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 14 }}>{STAGE_LABELS[stage]}</span>
                <strong>{summary.byStage[stage] ?? 0}</strong>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="section-heading">
              <h3 style={{ margin: 0 }}>פעילות אחרונה</h3>
            </div>
            {activity.length === 0 ? (
              <p className="muted">אין פעילות עדיין — התחל בהוספת לקוח ראשון.</p>
            ) : (
              <ul className="list">
                {activity.map((entry) => (
                  <li key={entry.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <span className="muted" style={{ fontSize: 11 }}>{formatDate(entry.at)}</span>
                    <br />
                    {entry.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
