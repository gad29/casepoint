import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requestHasAdminSession } from '@/lib/admin-session';
import { env } from '@/lib/env';

/** Paths that stay reachable without an admin session. */
function isPublicPath(pathname: string) {
  if (pathname === '/login') return true;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/me') return true;
  return false;
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

  if (await requestHasAdminSession(request)) {
    return NextResponse.next();
  }

  // n8n may read summaries / post webhooks using the shared token.
  if (pathname.startsWith('/api/') && hasValidApiToken(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Admin sign-in required' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protect everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
