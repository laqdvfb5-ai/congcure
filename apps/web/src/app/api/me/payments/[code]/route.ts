import { core } from "@/lib/core";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { code } = await ctx.params;
  try {
    const payment = await core.getBankPaymentForUser(code, user.id);
    return Response.json(
      {
        status: payment.status,
        receivedAmount: payment.receivedAmount,
        creditedAmount: payment.creditedAmount,
        orderId: payment.orderId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (core.isAppError(error))
      return Response.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
