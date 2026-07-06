import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/admin-session';
import { env } from '@/lib/env';

/** Paths that stay reachable without a session. */
function isPublicPath(pathname: string) {
  if (pathname === '/login') return true;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/me') return true;
  return false;
}

/** Pages and APIs reserved for the admin (workers are redirected / rejected). */
function isAdminOnlyPath(pathname: string) {
  return (
    pathname === '/payments' ||
    pathname.startsWith('/payments/') ||
    pathname === '/workers' ||
    pathname.startsWith('/workers/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/connections' ||
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/workers') ||
    pathname.startsWith('/api/settings') ||
    pathname.startsWith('/api/import') ||
    pathname.startsWith('/api/summary')
  );
}

/** Integration endpoints n8n calls with the shared API token instead of a session cookie. */
function hasValidApiToken(request: NextRequest) {
  if (!env.apiAccessToken) return false;
  const header = request.headers.get('x-casepoint-api-key');
  return Boolean(header && header === env.apiAccessToken);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(request);

  if (session) {
    if (session.scope === 'worker' && isAdminOnlyPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // n8n may read summaries / post webhooks using the shared token.
  if (pathname.startsWith('/api/') && hasValidApiToken(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Sign-in required' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protect everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
