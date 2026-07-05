// Edge-safe admin session helpers (imported by middleware — keep free of Node-only deps).
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { env, hasAdminPassword, isProductionLike } from '@/lib/env';

export const ADMIN_AUTH_COOKIE = 'casepoint-admin-session';
const DEFAULT_SESSION_HOURS = 24;
const encoder = new TextEncoder();

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

export async function createAdminSessionToken() {
  const payload = {
    scope: 'admin',
    email: env.adminEmail,
    expiresAt: new Date(Date.now() + getSessionHours() * 60 * 60 * 1000).toISOString(),
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function parseAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = await signPayload(encodedPayload);
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(decodeBase64url(encodedPayload)) as { scope?: string; email?: string; expiresAt?: string };
    if (payload.scope !== 'admin' || !payload.expiresAt) return null;
    if (new Date(payload.expiresAt).getTime() < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requestHasAdminSession(request: NextRequest) {
  if (!isAdminAuthEnabled()) return true;
  return Boolean(await parseAdminSessionToken(request.cookies.get(ADMIN_AUTH_COOKIE)?.value));
}

export async function currentRequestHasAdminSession() {
  if (!isAdminAuthEnabled()) return true;
  const cookieStore = await cookies();
  return Boolean(await parseAdminSessionToken(cookieStore.get(ADMIN_AUTH_COOKIE)?.value));
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
