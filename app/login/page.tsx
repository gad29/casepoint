'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordInput } from '@/components/password-input';

type Mode = 'admin' | 'worker';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>('admin');
  const [email, setEmail] = useState('');
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
        body: JSON.stringify({ email: mode === 'worker' ? email : '', password }),
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
            <div className="sidebar-brand-name">CRM_YE</div>
            <div className="sidebar-brand-sub">ניהול תיקי לקוחות מול משרדי ממשלה</div>
          </div>
        </div>
        <div className="card staff-login-card" style={{ marginTop: 20, textAlign: 'start' }}>
          <div className="language-switch" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`language-option ${mode === 'admin' ? 'active' : ''}`}
              onClick={() => setMode('admin')}
            >
              מנהל ראשי
            </button>
            <button
              type="button"
              className={`language-option ${mode === 'worker' ? 'active' : ''}`}
              onClick={() => setMode('worker')}
            >
              עובד / מנהל נוסף
            </button>
          </div>
          <h2 style={{ marginTop: 0 }}>{mode === 'admin' ? 'כניסת מנהל ראשי' : 'כניסה עם אימייל'}</h2>
          <form onSubmit={submit}>
            {mode === 'worker' && (
              <div className="field">
                <label htmlFor="worker-email">אימייל</label>
                <input
                  id="worker-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                  autoComplete="username"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="login-password">סיסמה</label>
              <PasswordInput
                id="login-password"
                value={password}
                onChange={setPassword}
                autoFocus={mode === 'admin'}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="button" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'מתחבר…' : 'כניסה'}
            </button>
            <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
              <Link className="mini-link" href={'/forgot' as never} style={{ fontSize: 13 }}>
                שכחתי סיסמה
              </Link>
            </p>
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
