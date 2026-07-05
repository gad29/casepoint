'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type ClientRow = {
  id: string;
  fullName: string;
  phone: string;
  idNumber?: string;
  email?: string;
  city?: string;
  caseCount: number;
  openCaseCount: number;
  missingItems: number;
  outstandingBalance: number;
  createdAt: string;
};

function shekel(amount: number) {
  return `₪${amount.toLocaleString('he-IL')}`;
}

function NewClientForm({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: '', phone: '', idNumber: '', email: '', city: '', address: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירת הלקוח נכשלה');
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
        <h3 style={{ margin: 0 }}>לקוח חדש</h3>
        <button type="button" className="doc-action-btn" onClick={onClose}>✕ סגור</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid cols-2">
          <div className="field">
            <label>שם מלא *</label>
            <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
          </div>
          <div className="field">
            <label>טלפון *</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} required dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div className="field">
            <label>תעודת זהות</label>
            <input value={form.idNumber} onChange={(e) => set('idNumber', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div className="field">
            <label>אימייל</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div className="field">
            <label>עיר</label>
            <input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="field">
            <label>כתובת</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>הערות</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'שומר…' : 'שמור לקוח'}
        </button>
      </form>
    </div>
  );
}

function ClientsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1');

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setClients(d.data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.idNumber || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div>
      <div className="hero">
        <div>
          <p className="eyebrow">לקוחות</p>
          <h1 style={{ margin: '6px 0 4px' }}>כל הלקוחות</h1>
          <p className="muted" style={{ margin: 0 }}>{clients.length} לקוחות במערכת</p>
        </div>
        <div className="hero-actions">
          <button className="button" type="button" onClick={() => setShowNew(true)}>+ לקוח חדש</button>
        </div>
      </div>

      {showNew && (
        <NewClientForm
          onClose={() => setShowNew(false)}
          onCreated={(id) => router.push(`/clients/${id}` as never)}
        />
      )}

      <div className="field" style={{ maxWidth: 420 }}>
        <input placeholder="חיפוש לפי שם, טלפון, ת.ז או אימייל…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="card muted" style={{ padding: 24 }}>טוען לקוחות…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24 }}>
          {clients.length === 0 ? 'אין עדיין לקוחות. הוסף את הלקוח הראשון כדי להתחיל.' : 'לא נמצאו תוצאות לחיפוש.'}
        </div>
      ) : (
        <div className="office-case-list">
          {filtered.map((client) => (
            <Link key={client.id} className="case-list-item" href={`/clients/${client.id}` as never}>
              <span className="cli-name">{client.fullName}</span>
              <span className="cli-meta">
                <span dir="ltr">{client.phone}</span>
                {client.city && <span>· {client.city}</span>}
                <span>· {client.openCaseCount} תיקים פתוחים</span>
                {client.missingItems > 0 && <span className="cli-missing">· {client.missingItems} מסמכים חסרים</span>}
                {client.outstandingBalance > 0 && <span className="cli-missing">· יתרה {shekel(client.outstandingBalance)}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsPageInner />
    </Suspense>
  );
}
