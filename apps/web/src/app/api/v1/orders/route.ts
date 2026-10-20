import { apiError, serializeOrder, withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export const POST = withApiUser(async (user, req) => {
  const body = (await req.json().catch(() => null)) as { productId?: unknown; quantity?: unknown } | null;
  const productId = Number(body?.productId);
  const quantity = Number(body?.quantity ?? 1);
  if (!Number.isSafeInteger(productId)) return apiError('INVALID_INPUT', 'productId không hợp lệ', 400);

  // Same Idempotency-Key → core returns the existing order instead of charging again.
  const idempotencyKey = req.headers.get('idempotency-key');
  const order = await core.purchase(user.id, productId, quantity, { source: 'API', idempotencyKey });
  return Response.json({ order: await serializeOrder(order) });
});
