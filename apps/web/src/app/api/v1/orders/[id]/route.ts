import { apiError, serializeOrder, withApiUser } from '@/lib/api';
import { core } from '@/lib/core';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  return withApiUser(async (user) => {
    if (!Number.isSafeInteger(id)) return apiError('INVALID_INPUT', 'id không hợp lệ', 400);
    const order = await core.getOrderForUser(id, user.id);
    return Response.json({ order: await serializeOrder(order) });
  })(req);
}
