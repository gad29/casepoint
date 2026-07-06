'use client';

import { useEffect, useMemo, useState } from 'react';

type BlankContractMeta = { originalName: string; mimeType: string; uploadedAt: string } | null;

type ParsedRow = {
  fullName: string;
  phone: string;
  idNumber?: string;
  email?: string;
  city?: string;
  address?: string;
  notes?: string;
  caseTitle?: string;
  company?: string;
  caseKind?: string;
  stage?: string;
  fee?: number;
  paid?: number;
  trouble?: boolean;
};

/** Header aliases → field keys (Hebrew as it usually appears in the advisor's Excel). */
const HEADER_MAP: Array<{ keys: string[]; field: keyof ParsedRow }> = [
  { keys: ['שם', 'שם מלא', 'שם לקוח', 'לקוח', 'name', 'fullname'], field: 'fullName' },
  { keys: ['טלפון', 'נייד', 'פלאפון', 'phone'], field: 'phone' },
  { keys: ['ת.ז', 'ת"ז', 'תז', 'תעודת זהות', 'id'], field: 'idNumber' },
  { keys: ['אימייל', 'מייל', 'email'], field: 'email' },
  { keys: ['עיר', 'ישוב', 'city'], field: 'city' },
  { keys: ['כתובת', 'address'], field: 'address' },
  { keys: ['הערות', 'הערה', 'notes'], field: 'notes' },
  { keys: ['תיק', 'נושא', 'נושא התיק', 'case'], field: 'caseTitle' },
  { keys: ['חברה', 'חברה מטפלת', 'company'], field: 'company' },
  { keys: ['סוג', 'סוג תיק', 'חדש/חידוש', 'kind'], field: 'caseKind' },
  { keys: ['שלב', 'סטטוס', 'מצב', 'stage', 'status'], field: 'stage' },
  { keys: ['שכר טרחה', 'שכ"ט', 'מחיר', 'fee'], field: 'fee' },
  { keys: ['שולם', 'תשלום', 'paid'], field: 'paid' },
  { keys: ['בעיה', 'תקוע', 'דגל', 'trouble'], field: 'trouble' },
];

function matchHeader(header: string): keyof ParsedRow | null {
  const normalized = header.trim().toLowerCase().replace(/["'״׳]/g, '');
  for (const { keys, field } of HEADER_MAP) {
    if (keys.some((k) => normalized === k || normalized.includes(k))) return field;
  }
  return null;
}

/** Splits pasted text into rows; supports tab-separated (Excel paste) and CSV. */
function parseTable(text: string): ParsedRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  function splitLine(line: string): string[] {
    if (delimiter === '\t') return line.split('\t');
    // Basic CSV with quoted-field support.
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        out.push(current);
        current = '';
      } else current += ch;
    }
    out.push(current);
    return out;
  }

  const headers = splitLine(lines[0]).map(matchHeader);
  const rows: ParsedRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((field, i) => {
      if (!field) return;
      const value = (cells[i] || '').trim();
      if (!value) return;
      if (field === 'fee' || field === 'paid') {
        const num = Number(value.replace(/[₪, ]/g, ''));
        if (Number.isFinite(num)) row[field] = num;
      } else if (field === 'trouble') {
        row[field] = ['כן', 'yes', 'true', '1', 'v', '✓'].includes(value.toLowerCase());
      } else {
        row[field] = value;
      }
    });
    if (row.fullName) rows.push(row as unknown as ParsedRow);
  }
  return rows;
}

function BlankContractSection() {
  const [meta, setMeta] = useState<BlankContractMeta>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    fetch('/api/settings/blank-contract')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setMeta(d.data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', files[0]);
      const res = await fetch('/api/settings/blank-contract', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'ההעלאה נכשלה');
        return;
      }
      reload();
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!window.confirm('להסיר את טופס חוזה השכירות הריק?')) return;
    await fetch('/api/settings/blank-contract', { method: 'DELETE' });
    reload();
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>טופס חוזה שכירות ריק</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        מעלים פעם אחת טופס ריק — והוא זמין להורדה מכל תיק, בשורת המסמך &quot;חוזה שכירות&quot; ברשימת המסמכים הנדרשים.
      </p>
      {loading ? (
        <p className="muted">טוען…</p>
      ) : meta ? (
        <div className="split" style={{ padding: '10px 0' }}>
          <span>
            📄 <strong>{meta.originalName}</strong>
            <span className="muted" style={{ fontSize: 12 }}> · הועלה {new Date(meta.uploadedAt).toLocaleDateString('he-IL')}</span>
          </span>
          <div className="doc-actions">
            <a className="doc-action-btn" href="/api/templates/blank-contract">⬇ הורדה</a>
            <label className="doc-action-btn approve" style={{ cursor: 'pointer' }}>
              החלפה
              <input type="file" style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} />
            </label>
            <button type="button" className="doc-action-btn reject" onClick={remove}>הסרה</button>
          </div>
        </div>
      ) : (
        <label className="button button-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
          {uploading ? 'מעלה…' : '⬆ העלאת טופס ריק (PDF / תמונה / וורד)'}
          <input type="file" style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function ImportSection() {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ clientsCreated: number; casesCreated: number; paymentsCreated: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');

  const rows = useMemo(() => parseTable(text), [text]);

  async function readFile(files: FileList | null) {
    if (!files || !files.length) return;
    const content = await files[0].text();
    setText(content);
  }

  async function runImport() {
    if (!rows.length) return;
    if (!window.confirm(`לייבא ${rows.length} לקוחות? לכל לקוח ייפתח תיק אוטומטית.`)) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'הייבוא נכשל');
        return;
      }
      setResult(data.data);
      setText('');
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>ייבוא לקוחות ותיקים ישנים</h3>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        פותחים את קובץ האקסל עם הלקוחות הישנים, מסמנים את הטבלה (כולל שורת הכותרות) ומדביקים כאן —
        או מעלים קובץ CSV. עמודות מזוהות אוטומטית לפי הכותרת:
        <strong> שם</strong> (חובה), <strong>טלפון</strong>, ת.ז, אימייל, עיר, כתובת, הערות,
        נושא התיק, חברה (מילגם/אלונים/מעוף), סוג (חדש/חידוש), שלב, שכר טרחה, שולם, בעיה (כן/לא).
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <label className="button button-secondary button-compact" style={{ cursor: 'pointer' }}>
          📂 העלאת קובץ CSV
          <input type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }} onChange={(e) => readFile(e.target.files)} />
        </label>
      </div>
      <div className="field">
        <textarea
          rows={7}
          placeholder={'הדבק כאן טבלה מאקסל…\nשם\tטלפון\tת.ז\tחברה\tשלב\tשכר טרחה\tשולם\nישראל ישראלי\t050-1234567\t012345678\tמילגם\tהוגש\t2500\t1000'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="rtl"
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="doc-group-title">תצוגה מקדימה — {rows.length} לקוחות</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>שם</th>
                  <th>טלפון</th>
                  <th>ת.ז</th>
                  <th>תיק</th>
                  <th>חברה</th>
                  <th>שלב</th>
                  <th>שכ"ט</th>
                  <th>שולם</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 15).map((row, i) => (
                  <tr key={i}>
                    <td>{row.fullName}</td>
                    <td dir="ltr">{row.phone || '—'}</td>
                    <td dir="ltr">{row.idNumber || '—'}</td>
                    <td>{row.caseTitle || 'סיוע בשכר דירה'}</td>
                    <td>{row.company || '—'}</td>
                    <td>{row.stage || 'איסוף מסמכים'}</td>
                    <td>{row.fee ?? 0}</td>
                    <td>{row.paid ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 15 && <p className="muted" style={{ fontSize: 12 }}>…ועוד {rows.length - 15} שורות</p>}
          </div>
          <button className="button" type="button" onClick={runImport} disabled={importing} style={{ marginTop: 12 }}>
            {importing ? 'מייבא…' : `ייבא ${rows.length} לקוחות`}
          </button>
        </>
      )}

      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="editor-saved-banner" style={{ marginTop: 14, borderRadius: 12 }}>
          ✓ יובאו {result.clientsCreated} לקוחות, {result.casesCreated} תיקים ו-{result.paymentsCreated} תשלומים.
          {result.errors.length > 0 && ` (${result.errors.length} שגיאות: ${result.errors.slice(0, 3).join('; ')})`}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <div className="hero">
        <div>
          <p className="eyebrow">ניהול</p>
          <h1 style={{ margin: '6px 0 4px' }}>הגדרות וייבוא</h1>
        </div>
      </div>
      <div className="grid" style={{ maxWidth: 860 }}>
        <BlankContractSection />
        <ImportSection />
      </div>
    </div>
  );
}
