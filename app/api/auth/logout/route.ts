import { NextResponse } from 'next/server';
import { ADMIN_AUTH_COOKIE } from '@/lib/admin-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_AUTH_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
