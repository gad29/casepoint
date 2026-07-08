'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SearchClient = { id: string; fullName: string; phone: string; idNumber?: string };
type SearchCase = { id: string; title: string; clientName: string; stage: string };
type BellTask = { id: string; title: string; dueAt?: string; priority: string; status: string; clientName?: string };

function SearchIcon() {
  return (
    <svg className="topbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Topbar({ userName, onMenuClick }: { userName: string; onMenuClick?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<SearchClient[]>([]);
  const [cases, setCases] = useState<SearchCase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellTasks, setBellTasks] = useState<BellTask[]>([]);
  const [dark, setDark] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  // Load search data lazily, once, on first focus.
  async function ensureData() {
    if (loaded) return;
    setLoaded(true);
    try {
      const [c1, c2] = await Promise.all([
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/cases').then((r) => r.json()),
      ]);
      if (c1.ok) setClients(c1.data);
      if (c2.ok) setCases(c2.data);
    } catch {
      setLoaded(false);
    }
  }

  // Bell: overdue / urgent open tasks.
  useEffect(() => {
    let cancelled = false;
    async function loadBell() {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        if (!data.ok || cancelled) return;
        const now = Date.now();
        const attention = (data.data as BellTask[]).filter(
          (t) => t.status === 'open' && ((t.dueAt && new Date(t.dueAt).getTime() <= now) || t.priority === 'urgent'),
        );
        setBellTasks(attention.slice(0, 6));
      } catch {
        /* ignore */
      }
    }
    void loadBell();
    const interval = setInterval(loadBell, 90_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Close popovers on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setShowResults(false);
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return { clients: [], cases: [] };
    return {
      clients: clients
        .filter((c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(q) || (c.idNumber || '').includes(q))
        .slice(0, 5),
      cases: cases
        .filter((c) => c.title.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .slice(0, 5),
    };
  }, [query, clients, cases]);

  function go(path: string) {
    setShowResults(false);
    setQuery('');
    router.push(path as never);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('casepoint-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('casepoint-theme', 'light');
    }
  }

  const hasResults = results.clients.length > 0 || results.cases.length > 0;

  return (
    <header className="topbar" dir="rtl">
      <button type="button" className="icon-button menu-button" onClick={onMenuClick} title="תפריט">
        <MenuIcon />
      </button>
      <div className="topbar-search" ref={wrapRef}>
        <SearchIcon />
        <input
          placeholder="חיפוש לקוח או תיק… (שם, טלפון, ת.ז, מספר תיק)"
          value={query}
          onFocus={() => {
            void ensureData();
            setShowResults(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
        />
        {showResults && query.trim() && (
          <div className="search-results">
            {!hasResults && <div className="search-empty">לא נמצאו תוצאות עבור &quot;{query}&quot;</div>}
            {results.clients.map((c) => (
              <div key={c.id} className="search-result" onClick={() => go(`/clients/${c.id}`)}>
                <span className="search-result-kind">לקוח</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{c.fullName}</strong>
                  <span className="muted" style={{ fontSize: 12 }}> · <span dir="ltr">{c.phone}</span></span>
                </span>
              </div>
            ))}
            {results.cases.map((c) => (
              <div key={c.id} className="search-result" onClick={() => go(`/cases/${c.id}`)}>
                <span className="search-result-kind">תיק</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{c.clientName}</strong>
                  <span className="muted" style={{ fontSize: 12 }}> · {c.title} · {c.id}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <button type="button" className="icon-button" onClick={toggleTheme} title={dark ? 'מצב בהיר' : 'מצב כהה'}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>

        <div style={{ position: 'relative' }} ref={bellRef}>
          <button type="button" className="icon-button" onClick={() => setBellOpen((v) => !v)} title="התראות">
            <BellIcon />
            {bellTasks.length > 0 && <span className="bell-dot">{bellTasks.length}</span>}
          </button>
          {bellOpen && (
            <div className="bell-dropdown" dir="rtl">
              <div className="bell-dropdown-header">משימות שדורשות טיפול</div>
              {bellTasks.length === 0 ? (
                <div className="bell-empty">אין התראות — הכל בשליטה ✓</div>
              ) : (
                bellTasks.map((t) => {
                  const overdue = t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                  return (
                    <div
                      key={t.id}
                      className="bell-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setBellOpen(false);
                        router.push('/tasks' as never);
                      }}
                    >
                      <span>{t.priority === 'urgent' ? '🚨' : '⏰'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: 13 }}>{t.title}</strong>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {overdue ? 'באיחור' : 'דחוף'}
                          {t.clientName ? ` · ${t.clientName}` : ''}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="avatar" title={userName}>{(userName || 'מ')[0].toUpperCase()}</div>
      </div>
    </header>
  );
}
