"use client";

import { useActionState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { createApiKeyAction } from "@/app/tai-khoan/actions";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./SubmitButton";

export function ApiKeyForm() {
  const [state, action] = useActionState(createApiKeyAction, {
    key: "",
    error: "",
  });
  return (
    <>
      <form action={action} className="inline-form">
        <label className="sr-only" htmlFor="key-name">
          Tên khóa API
        </label>
        <input
          id="key-name"
          name="name"
          placeholder="Tên khóa, ví dụ: cửa hàng của tôi"
          required
          maxLength={100}
          className="input"
        />
        <SubmitButton>
          <Plus size={16} />
          Tạo khóa
        </SubmitButton>
      </form>
      {state.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      {state.key && (
        <div className="notice notice-success" role="status">
          <KeyRound size={18} />
          <div className="min-w-0 flex-1">
            <strong>Khóa API mới</strong>
            <p className="mt-1 mb-2">
              Lưu khóa ở nơi an toàn. Bạn sẽ không thể xem lại sau khi rời
              trang.
            </p>
            <code className="break-all text-xs">{state.key}</code>
          </div>
          <CopyButton value={state.key} label="Sao chép khóa API" />
        </div>
      )}
    </>
  );
}
