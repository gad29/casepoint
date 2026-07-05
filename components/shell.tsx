'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type AdminInfo = { email: string; authDisabled: boolean };

function HomeIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const primaryNav = [
  { href: '/dashboard', label: 'לוח בקרה', Icon: HomeIcon },
  { href: '/clients', label: 'לקוחות', Icon: UsersIcon },
  { href: '/cases', label: 'תיקים', Icon: FolderIcon },
  { href: '/payments', label: 'תשלומים', Icon: CoinsIcon },
];

const secondaryNav = [
  { href: '/connections', label: 'חיבורים ואוטומציה', Icon: LinkIcon },
];

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAdmin({ email: d.email, authDisabled: Boolean(d.authDisabled) });
      })
      .catch(() => null);
  }, []);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="shell" dir="rtl">
      <aside className="sidebar sidebar-flex">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">C</span>
          <div>
            <div className="sidebar-brand-name">CasePoint</div>
            <div className="sidebar-brand-sub">ליווי תיקים מול משרדי ממשלה</div>
          </div>
        </div>

        <div className="sidebar-scroll">
          <nav className="nav" aria-label="ניווט ראשי">
            {primaryNav.map(({ href, label, Icon }) => (
              <Link key={href} href={href as never} className={isActive(href) ? 'active' : undefined}>
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="nav-divider" />
          <nav className="nav">
            {secondaryNav.map(({ href, label, Icon }) => (
              <Link key={href} href={href as never} className={isActive(href) ? 'active' : undefined}>
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {admin?.authDisabled && (
            <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 16, padding: '0 4px' }}>
              ⚠️ לא הוגדרה סיסמת מנהל — המערכת פתוחה. הגדר ADMIN_PASSWORD בקובץ ‎.env.local.
            </p>
          )}
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">{admin?.email?.[0]?.toUpperCase() ?? 'מ'}</div>
            <div className="sidebar-user-meta">
              <div className="sidebar-user-email">{admin?.email ?? 'מנהל'}</div>
              <div className="sidebar-user-role">מנהל המערכת</div>
            </div>
          </div>
          <button type="button" className="sidebar-signout" onClick={signOut}>
            <LogOutIcon />
            יציאה
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
