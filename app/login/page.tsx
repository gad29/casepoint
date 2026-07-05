'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'הכניסה נכשלה');
        return;
      }
      const next = searchParams.get('next');
      router.push((next && next.startsWith('/') ? next : '/dashboard') as never);
      router.refresh();
    } catch {
      setError('שגיאת תקשורת, נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="landing" dir="rtl">
      <div className="landing-hero" style={{ width: '100%', maxWidth: 420 }}>
        <div className="sidebar-brand" style={{ justifyContent: 'center', borderBottom: 'none' }}>
          <span className="sidebar-brand-mark">C</span>
          <div style={{ textAlign: 'start' }}>
            <div className="sidebar-brand-name">CasePoint</div>
            <div className="sidebar-brand-sub">ניהול תיקי לקוחות מול משרדי ממשלה</div>
          </div>
        </div>
        <div className="card staff-login-card" style={{ marginTop: 20, textAlign: 'start' }}>
          <h2 style={{ marginTop: 0 }}>כניסת מנהל</h2>
          <p className="muted" style={{ marginTop: -6 }}>המערכת פרטית — כניסה למנהל בלבד.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="admin-password">סיסמה</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="button" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'מתחבר…' : 'כניסה'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
