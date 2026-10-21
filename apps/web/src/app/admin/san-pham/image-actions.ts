"use server";

import { isAppError } from "@web12/core";
import { saveProductImage } from "@web12/core/media";
import { MAX_PRODUCT_IMAGE_BYTES } from "@web12/core/media-rules";
import { requireStaff } from "@/lib/session";

export async function uploadProductImageAction(
  form: FormData,
): Promise<{ url: string; error: string }> {
  await requireStaff();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_PRODUCT_IMAGE_BYTES
  ) {
    return { url: "", error: "Vui lòng chọn ảnh có dung lượng tối đa 5 MB" };
  }
  try {
    const url = await saveProductImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );
    return { url, error: "" };
  } catch (error) {
    if (!isAppError(error)) console.error("Product image upload failed", error);
    return {
      url: "",
      error: isAppError(error)
        ? error.message
        : "Không tải được ảnh. Vui lòng thử lại.",
    };
  }
}
