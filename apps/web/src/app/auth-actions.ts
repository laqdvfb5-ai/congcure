'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { rateLimit } from '@/lib/rate-limit';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '@/lib/session';

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export async function registerAction(form: FormData) {
  try {
    if (!rateLimit(`register:${await clientIp()}`, 10, 60 * 60_000)) {
      throw new core.AppError('RATE_LIMITED', 'Thử lại sau ít phút');
    }
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    await core.registerUser({ email, password, name: String(form.get('name') ?? '') });
    const { token } = await core.login(email, password);
    await setSessionCookie(token);
  } catch (e) {
    fail('/dang-ky', e);
  }
  redirect('/');
}

export async function loginAction(form: FormData) {
  try {
    if (!rateLimit(`login:${await clientIp()}`, 10, 10 * 60_000)) {
      throw new core.AppError('RATE_LIMITED', 'Đăng nhập sai quá nhiều lần, thử lại sau 10 phút');
    }
    const { token } = await core.login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
    await setSessionCookie(token);
  } catch (e) {
    fail('/dang-nhap', e);
  }
  redirect('/');
}

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await core.logout(token);
  await clearSessionCookie();
  redirect('/');
}
