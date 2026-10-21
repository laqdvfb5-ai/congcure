"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  value,
  label = "Sao chép",
  text = false,
}: {
  value: string;
  label?: string;
  text?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }
  const title =
    state === "copied"
      ? "Đã sao chép"
      : state === "error"
        ? "Không sao chép được"
        : label;
  return (
    <button
      type="button"
      onClick={copy}
      className={text ? "btn-secondary btn-sm" : "icon-btn"}
      title={title}
      aria-label={title}
    >
      {state === "copied" ? <Check size={16} /> : <Copy size={16} />}
      {text && title}
      <span className="sr-only" aria-live="polite">
        {state !== "idle" ? title : ""}
      </span>
    </button>
  );
}
