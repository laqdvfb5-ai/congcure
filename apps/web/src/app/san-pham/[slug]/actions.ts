"use server";

import { redirect } from "next/navigation";
import { fail } from "@/lib/action-error";
import { core } from "@/lib/core";
import { requireUser } from "@/lib/session";

export async function buyAction(form: FormData) {
  const user = await requireUser();
  const slug = String(form.get("slug") ?? "");
  let destination: string;
  try {
    const method = String(form.get("paymentMethod") ?? "WALLET");
    if (method !== "BANK" && method !== "WALLET")
      throw new core.AppError(
        "INVALID_INPUT",
        "Phương thức thanh toán không hợp lệ",
      );
    if (method === "BANK") {
      const payment = await core.createBankPayment(
        user.id,
        Number(form.get("productId")),
        Number(form.get("quantity") ?? 1),
        {
          preorder: form.get("preorder") === "true",
          requestKey: String(form.get("requestId") ?? ""),
          bankId: process.env.BANK_ID ?? "",
          bankAccount: process.env.BANK_ACCOUNT ?? "",
          bankAccountName: process.env.BANK_ACCOUNT_NAME ?? "",
        },
      );
      destination = `/thanh-toan/${payment.code}`;
    } else {
      const order = await core.purchase(
        user.id,
        Number(form.get("productId")),
        Number(form.get("quantity") ?? 1),
        {
          source: "WEB",
          preorder: form.get("preorder") === "true",
          idempotencyKey: String(form.get("requestId") ?? "") || null,
        },
      );
      destination = `/don-hang/${order.id}`;
    }
  } catch (e) {
    fail(`/san-pham/${slug}`, e);
  }
  redirect(destination);
}
