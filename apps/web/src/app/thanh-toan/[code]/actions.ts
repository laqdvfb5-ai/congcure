"use server";

import { redirect } from "next/navigation";
import { core } from "@/lib/core";
import { requireUser } from "@/lib/session";
import { fail } from "@/lib/action-error";

export async function cancelPaymentAction(form: FormData) {
  const user = await requireUser();
  const code = String(form.get("code") ?? "");
  if (!/^DH[A-F0-9]{16}$/.test(code)) redirect("/don-hang");
  try {
    await core.cancelBankPayment(code, user.id);
  } catch (error) {
    fail(`/thanh-toan/${code}`, error);
  }
  redirect(`/thanh-toan/${code}`);
}
