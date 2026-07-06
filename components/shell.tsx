'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type AdminInfo = { email: string; name: string; role: 'admin' | 'worker'; authDisabled: boolean };

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

function SettingsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const primaryNav = [
  { href: '/dashboard', label: 'לוח בקרה', Icon: HomeIcon, adminOnly: false },
  { href: '/clients', label: 'לקוחות', Icon: UsersIcon, adminOnly: false },
  { href: '/cases', label: 'תיקים', Icon: FolderIcon, adminOnly: false },
  { href: '/payments', label: 'תשלומים', Icon: CoinsIcon, adminOnly: true },
  { href: '/workers', label: 'עובדים', Icon: UsersIcon, adminOnly: true },
];

const secondaryNav = [
  { href: '/settings', label: 'הגדרות וייבוא', Icon: SettingsIcon, adminOnly: true },
  { href: '/connections', label: 'חיבורים ואוטומציה', Icon: LinkIcon, adminOnly: true },
];

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAdmin({ email: d.email, name: d.name || '', role: d.role === 'worker' ? 'worker' : 'admin', authDisabled: Boolean(d.authDisabled) });
      })
      .catch(() => null);
  }, []);

  const isAdmin = !admin || admin.role === 'admin';
  const visiblePrimary = primaryNav.filter((item) => isAdmin || !item.adminOnly);
  const visibleSecondary = secondaryNav.filter((item) => isAdmin || !item.adminOnly);

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
            {visiblePrimary.map(({ href, label, Icon }) => (
              <Link key={href} href={href as never} className={isActive(href) ? 'active' : undefined}>
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {visibleSecondary.length > 0 && (
            <>
              <div className="nav-divider" />
              <nav className="nav">
                {visibleSecondary.map(({ href, label, Icon }) => (
                  <Link key={href} href={href as never} className={isActive(href) ? 'active' : undefined}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            </>
          )}

          {admin?.authDisabled && (
            <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 16, padding: '0 4px' }}>
              ⚠️ לא הוגדרה סיסמת מנהל — המערכת פתוחה. הגדר ADMIN_PASSWORD בקובץ ‎.env.local.
            </p>
          )}
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">{(admin?.name || admin?.email || 'מ')[0].toUpperCase()}</div>
            <div className="sidebar-user-meta">
              <div className="sidebar-user-email">{admin?.name || admin?.email || 'מנהל'}</div>
              <div className="sidebar-user-role">{admin?.role === 'worker' ? 'עובד' : 'מנהל המערכת'}</div>
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
