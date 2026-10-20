'use server';

import { redirect } from 'next/navigation';
import { fail } from '@/lib/action-error';
import { core } from '@/lib/core';
import { requireUser } from '@/lib/session';

export async function buyAction(form: FormData) {
  const user = await requireUser();
  const slug = String(form.get('slug') ?? '');
  let orderId: number;
  try {
    const order = await core.purchase(user.id, Number(form.get('productId')), Number(form.get('quantity') ?? 1), {
      source: 'WEB',
      idempotencyKey: String(form.get('requestId') ?? '') || null,
    });
    orderId = order.id;
  } catch (e) {
    fail(`/san-pham/${slug}`, e);
  }
  redirect(`/don-hang/${orderId}`);
}
