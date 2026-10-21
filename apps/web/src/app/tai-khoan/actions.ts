"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail } from "@/lib/action-error";
import { core } from "@/lib/core";
import { requireUser } from "@/lib/session";

export async function createApiKeyAction(
  _state: { key: string; error: string },
  form: FormData,
): Promise<{ key: string; error: string }> {
  const user = await requireUser();
  try {
    const { key } = await core.createApiKey(
      user.id,
      String(form.get("name") ?? ""),
    );
    revalidatePath("/tai-khoan");
    return { key, error: "" };
  } catch (e) {
    if (!core.isAppError(e)) console.error(e);
    return {
      key: "",
      error: core.isAppError(e)
        ? e.message
        : "Không tạo được khóa, vui lòng thử lại.",
    };
  }
}
export async function revokeApiKeyAction(form: FormData) {
  const user = await requireUser();
  try {
    await core.revokeApiKey(user.id, Number(form.get("id")));
  } catch (e) {
    fail("/tai-khoan", e);
  }
  redirect("/tai-khoan?ok=" + encodeURIComponent("Đã thu hồi khóa"));
}
