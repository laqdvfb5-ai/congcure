'use server';

import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireUser } from '@/lib/session';

export async function createApiKeyAction(form: FormData) {
  const user = await requireUser();
  let key: string;
  try {
    ({ key } = await core.createApiKey(user.id, String(form.get('name') ?? '')));
  } catch (e) {
    fail('/tai-khoan', e);
  }
  // Shown once: the plaintext key is never stored.
  redirect(`/tai-khoan?newKey=${encodeURIComponent(key)}`);
}

export async function revokeApiKeyAction(form: FormData) {
  const user = await requireUser();
  try {
    await core.revokeApiKey(user.id, Number(form.get('id')));
  } catch (e) {
    fail('/tai-khoan', e);
  }
  redirect('/tai-khoan?ok=' + encodeURIComponent('Đã thu hồi khóa'));
}
