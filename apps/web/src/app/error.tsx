"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <CircleAlert size={36} />
      <h1 className="text-2xl">Chưa tải được dữ liệu.</h1>
      <p>Vui lòng thử lại sau ít phút. Nếu lỗi tiếp diễn, liên hệ cửa hàng.</p>
      <button type="button" onClick={reset} className="btn-secondary">
        <RefreshCw size={16} />
        Thử lại
      </button>
    </div>
  );
}
