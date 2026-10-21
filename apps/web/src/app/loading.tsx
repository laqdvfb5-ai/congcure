import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle size={26} className="spin" />
      <p>Đang tải…</p>
    </div>
  );
}
