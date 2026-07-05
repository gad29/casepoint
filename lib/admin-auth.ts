// Password verification for the single-admin login (Node runtime only — uses bcryptjs).
import bcrypt from 'bcryptjs';
import { env } from '@/lib/env';

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyAdminPassword(password: string) {
  if (!password) return false;
  if (env.adminPasswordHash) {
    try {
      return await bcrypt.compare(password, env.adminPasswordHash);
    } catch {
      return false;
    }
  }
  if (env.adminPassword) {
    return constantTimeEqual(password, env.adminPassword);
  }
  return false;
}
