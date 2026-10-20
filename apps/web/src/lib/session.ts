import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@web12/core';
import { core } from './core';

const COOKIE = 'sid';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: core.SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await readSessionToken();
  return token ? core.getSessionUser(token) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/dang-nhap');
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role === 'CUSTOMER') redirect('/');
  return user;
}
