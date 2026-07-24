// Signed, expiring links for sharing a document with a client without login.
import crypto from 'node:crypto';
import { env } from '@/lib/env';

function shareSecret() {
  return env.adminSessionSecret || env.adminPasswordHash || env.adminPassword || 'crmye-share-secret';
}

function base64url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(encoded: string) {
  return crypto.createHmac('sha256', shareSecret()).update(encoded).digest('base64url');
}

/** Create a share token for a document, valid for `ttlDays` (default 14). */
export function signDocumentShareToken(documentId: string, ttlDays = 14) {
  const payload = { d: documentId, exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000 };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Verify a share token; returns the document id when valid and unexpired. */
export function parseDocumentShareToken(token: string): { documentId: string } | null {
  const [encoded, signature] = (token || '').split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const actual = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (actual.length !== want.length || !crypto.timingSafeEqual(actual, want)) return null;

  try {
    const payload = JSON.parse(decodeBase64url(encoded)) as { d?: string; exp?: number };
    if (!payload.d || !payload.exp || Date.now() > payload.exp) return null;
    return { documentId: payload.d };
  } catch {
    return null;
  }
}
