// Edge-safe session helpers (imported by middleware — keep free of Node-only deps).
// One signed cookie serves both the admin and worker logins; `scope` tells them apart.
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { env, hasAdminPassword, isProductionLike } from '@/lib/env';

export const ADMIN_AUTH_COOKIE = 'casepoint-admin-session';
const DEFAULT_SESSION_HOURS = 24;
const encoder = new TextEncoder();

export type SessionPayload = {
  scope: 'admin' | 'worker';
  email?: string;
  /** Set when scope === 'worker'. */
  workerId?: string;
  name?: string;
  expiresAt: string;
};

function base64url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSessionSecret() {
  return env.adminSessionSecret || env.adminPasswordHash || env.adminPassword || 'casepoint-admin-change-me';
}

async function signPayload(encodedPayload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  return Buffer.from(signature).toString('base64url');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function getSessionHours() {
  const parsed = Number(env.adminSessionHours || DEFAULT_SESSION_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_HOURS;
}

/** True when an admin password is configured. When false (fresh local setup), login is not enforced. */
export function isAdminAuthEnabled() {
  return hasAdminPassword();
}

export async function createSessionToken(input: Omit<SessionPayload, 'expiresAt'>) {
  const payload: SessionPayload = {
    ...input,
    expiresAt: new Date(Date.now() + getSessionHours() * 60 * 60 * 1000).toISOString(),
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function parseSessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = await signPayload(encodedPayload);
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(decodeBase64url(encodedPayload)) as SessionPayload;
    if ((payload.scope !== 'admin' && payload.scope !== 'worker') || !payload.expiresAt) return null;
    if (payload.scope === 'worker' && !payload.workerId) return null;
    if (new Date(payload.expiresAt).getTime() < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Session for the current request; falls back to an implicit admin session when no password is configured. */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const parsed = await parseSessionToken(request.cookies.get(ADMIN_AUTH_COOKIE)?.value);
  if (parsed) return parsed;
  if (!isAdminAuthEnabled()) {
    return { scope: 'admin', email: env.adminEmail, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }
  return null;
}

/** Session in a server component / route handler context (reads cookies()). */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const parsed = await parseSessionToken(cookieStore.get(ADMIN_AUTH_COOKIE)?.value);
  if (parsed) return parsed;
  if (!isAdminAuthEnabled()) {
    return { scope: 'admin', email: env.adminEmail, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }
  return null;
}

export async function requestHasAdminSession(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  return Boolean(session);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProductionLike(),
    path: '/',
    maxAge: getSessionHours() * 60 * 60,
  };
}
