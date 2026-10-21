"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

export function OrderRefresh({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function poll() {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const res = await fetch("/api/me/orders/" + orderId, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("poll");
        const data = await res.json();
        setError(false);
        if (data.status !== "PENDING") router.refresh();
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(poll, 4000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [orderId, router]);
  return (
    <div className="notice notice-warning" role="status">
      <LoaderCircle size={18} className={error ? "" : "spin"} />
      <div>
        <strong>
          {error ? "Chưa cập nhật được trạng thái" : "Đơn hàng đang được xử lý"}
        </strong>
        <p className="mt-1">
          {error
            ? "Kiểm tra kết nối rồi tải lại trang."
            : "Thông tin tài khoản sẽ hiển thị khi giao hàng hoàn tất."}
        </p>
      </div>
      <button
        type="button"
        className="icon-btn ml-auto"
        aria-label="Làm mới đơn hàng"
        title="Làm mới"
        onClick={() => router.refresh()}
      >
        <RefreshCw size={17} />
      </button>
    </div>
  );
}
