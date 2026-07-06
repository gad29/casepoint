'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CASE_KIND_LABELS,
  COMPANY_LABELS,
  DEFAULT_CHECKLIST_CODES,
  documentTemplates,
  OFFICE_LABELS,
  PAYMENT_STATUS_LABELS,
  STAGE_LABELS,
  type CaseKind,
  type CaseStage,
  type GovernmentOffice,
  type OperatingCompany,
} from '@/data/domain';

type CaseRow = {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  office: GovernmentOffice;
  officeName: string;
  stage: CaseStage;
  missingItems: number;
  nextAction?: string;
  openedAt: string;
  company?: OperatingCompany;
  caseKind?: CaseKind;
  troubleFlag?: boolean;
  openedByName?: string;
  assignedToName?: string;
  finance: { fee: number; paid: number; balance: number; status: 'paid' | 'partial' | 'unpaid' };
};

type ClientOption = { id: string; fullName: string };

function shekel(amount: number) {
  return `₪${amount.toLocaleString('he-IL')}`;
}

const FILTERS = [
  { id: 'open', label: 'פעילים' },
  { id: 'trouble', label: '🚩 דורשים טיפול' },
  { id: 'stuck', label: 'חסרים מסמכים' },
  { id: 'waiting', label: 'ממתינים למשרד' },
  { id: 'closed', label: 'סגורים' },
  { id: 'all', label: 'הכל' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

function NewCaseForm({
  clients,
  initialClientId,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  initialClientId: string;
  onClose: () => void;
  onCreated: (caseId: string) => void;
}) {
  const [form, setForm] = useState({
    clientId: initialClientId,
    title: 'סיוע בשכר דירה',
    office: 'housing-ministry' as GovernmentOffice,
    officeOther: '',
    description: '',
    fee: '',
    nextAction: '',
    company: 'milgam' as OperatingCompany,
    caseKind: 'new' as CaseKind,
  });
  const [checklistCodes, setChecklistCodes] = useState<string[]>(DEFAULT_CHECKLIST_CODES);
  const [customItems, setCustomItems] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleCode(code: string) {
    setChecklistCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const suggested = documentTemplates;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fee: form.fee ? Number(form.fee) : 0,
          checklistCodes,
          customChecklist: customItems.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'פתיחת התיק נכשלה');
        return;
      }
      onCreated(data.data.id);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-heading">
        <h3 style={{ margin: 0 }}>פתיחת תיק חדש</h3>
        <button type="button" className="doc-action-btn" onClick={onClose}>✕ סגור</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid cols-2">
          <div className="field">
            <label>לקוח *</label>
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
              <option value="">בחר לקוח…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>נושא התיק *</label>
            <input
              placeholder='למשל: "קצבת נכות כללית"'
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>חברה מטפלת *</label>
            <select value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value as OperatingCompany })}>
              {Object.entries(COMPANY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>סוג התיק</label>
            <div className="language-switch">
              {(Object.entries(CASE_KIND_LABELS) as [CaseKind, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`language-option ${form.caseKind === value ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, caseKind: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>משרד ממשלתי</label>
            <select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value as GovernmentOffice })}>
              {Object.entries(OFFICE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {form.office === 'other' && (
            <div className="field">
              <label>שם המשרד</label>
              <input value={form.officeOther} onChange={(e) => setForm({ ...form, officeOther: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label>שכר טרחה (₪)</label>
            <input type="number" min="0" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          </div>
          <div className="field">
            <label>פעולה הבאה</label>
            <input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>תיאור</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="doc-group-title">מסמכים נדרשים לתיק</div>
        <div className="choice-grid" style={{ marginBottom: 14 }}>
          {suggested.map((template) => (
            <label key={template.code} className={`choice-card ${checklistCodes.includes(template.code) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={checklistCodes.includes(template.code)}
                onChange={() => toggleCode(template.code)}
              />
              <span>{template.label}</span>
            </label>
          ))}
        </div>
        <div className="field">
          <label>מסמכים נוספים (שורה לכל מסמך)</label>
          <textarea
            rows={2}
            placeholder={'למשל:\nאישור רופא תעסוקתי\nצילום המחאה מבוטלת'}
            value={customItems}
            onChange={(e) => setCustomItems(e.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'פותח תיק…' : 'פתח תיק'}
        </button>
      </form>
    </div>
  );
}

function CasesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('open');
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1');

  useEffect(() => {
    Promise.all([
      fetch('/api/cases').then((r) => r.json()),
      fetch('/api/clients').then((r) => r.json()),
    ])
      .then(([casesRes, clientsRes]) => {
        if (casesRes.ok) setCases(casesRes.data);
        if (clientsRes.ok) setClients(clientsRes.data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'open':
        return cases.filter((c) => c.stage !== 'closed');
      case 'trouble':
        return cases.filter((c) => c.troubleFlag && c.stage !== 'closed');
      case 'stuck':
        return cases.filter((c) => c.stage !== 'closed' && (c.missingItems > 0 || c.stage === 'action-required'));
      case 'waiting':
        return cases.filter((c) => c.stage === 'submitted' || c.stage === 'in-government-review');
      case 'closed':
        return cases.filter((c) => c.stage === 'closed');
      default:
        return cases;
    }
  }, [cases, filter]);

  return (
    <div>
      <div className="hero">
        <div>
          <p className="eyebrow">תיקים</p>
          <h1 style={{ margin: '6px 0 4px' }}>כל התיקים</h1>
          <p className="muted" style={{ margin: 0 }}>{cases.filter((c) => c.stage !== 'closed').length} פעילים מתוך {cases.length}</p>
        </div>
        <div className="hero-actions">
          <button className="button" type="button" onClick={() => setShowNew(true)}>+ תיק חדש</button>
        </div>
      </div>

      {showNew && (
        <NewCaseForm
          clients={clients}
          initialClientId={searchParams.get('clientId') || ''}
          onClose={() => setShowNew(false)}
          onCreated={(caseId) => router.push(`/cases/${caseId}` as never)}
        />
      )}

      <div className="tab-bar">
        {FILTERS.map(({ id, label }) => (
          <button key={id} type="button" className={`tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card muted" style={{ padding: 24 }}>טוען תיקים…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24 }}>אין תיקים בסינון הנוכחי.</div>
      ) : (
        <div className="office-case-list">
          {filtered.map((c) => (
            <Link key={c.id} className={`case-list-item ${c.troubleFlag ? 'case-trouble' : ''}`} href={`/cases/${c.id}` as never}>
              <span className="cli-name">
                {c.troubleFlag && '🚩 '}
                {c.clientName} · {c.title}
                {c.caseKind === 'renewal' && <span className="kind-badge">חידוש</span>}
              </span>
              <span className="cli-stage">{STAGE_LABELS[c.stage]}</span>
              <span className="cli-meta">
                <span className="case-id-badge">{c.id}</span>
                {c.company && c.company !== 'none' && <span>{COMPANY_LABELS[c.company]}</span>}
                {(!c.company || c.company === 'none') && <span>{c.officeName}</span>}
                {c.assignedToName && <span>· 👤 {c.assignedToName}</span>}
                {!c.assignedToName && c.openedByName && <span>· 👤 {c.openedByName}</span>}
                {c.missingItems > 0 && <span className="cli-missing">· {c.missingItems} מסמכים חסרים</span>}
                <span>
                  · {PAYMENT_STATUS_LABELS[c.finance.status]}
                  {c.finance.balance > 0 && ` (${shekel(c.finance.balance)})`}
                </span>
                {c.nextAction && <span>· ➜ {c.nextAction}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CasesPage() {
  return (
    <Suspense>
      <CasesPageInner />
    </Suspense>
  );
}
