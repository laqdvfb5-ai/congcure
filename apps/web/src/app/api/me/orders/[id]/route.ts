import { getCurrentUser } from "@/lib/session";
import { core } from "@/lib/core";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const order = await core.getOrderForUser(id, user.id);
    return Response.json(
      { status: order.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (core.isAppError(error))
      return Response.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
