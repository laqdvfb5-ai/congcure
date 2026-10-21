import type { Order, User } from "@web12/core";
import { core } from "./core";
import { rateLimit } from "./rate-limit";
import { ORDER_REFUND_MESSAGE } from "./format";

export interface ApiOrder {
  id: number;
  status: Order["status"];
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  error: string | null;
  created_at: string;
  accounts?: string[];
}

export function apiError(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function withApiUser(
  handler: (user: User, req: Request) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    const key = req.headers.get("x-api-key") ?? "";
    if (!key) return apiError("UNAUTHORIZED", "Thiếu header X-API-Key", 401);
    if (!rateLimit(`api:${key}`, 60, 60_000))
      return apiError("RATE_LIMITED", "Quá 60 request/phút", 429);
    try {
      const user = await core.getUserByApiKey(key);
      if (!user)
        return apiError(
          "UNAUTHORIZED",
          "API key không hợp lệ hoặc đã bị thu hồi",
          401,
        );
      return await handler(user, req);
    } catch (e) {
      if (core.isAppError(e)) return apiError(e.code, e.message, e.status);
      console.error("api error", e);
      return apiError("INTERNAL", "Lỗi hệ thống", 500);
    }
  };
}

export async function serializeOrder(o: Order): Promise<ApiOrder> {
  return {
    id: o.id,
    status: o.status,
    product_id: o.productId,
    product_name: o.productName,
    quantity: o.quantity,
    unit_price: o.unitPrice,
    total: o.total,
    error: o.status === "REFUNDED" ? ORDER_REFUND_MESSAGE : null,
    created_at: new Date(o.createdAt).toISOString(),
    ...(o.status === "COMPLETED"
      ? { accounts: await core.getOrderSecrets(o.id) }
      : {}),
  };
}
