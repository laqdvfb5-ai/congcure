"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  className = "btn",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending && <LoaderCircle size={16} className="spin" />}
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}
