import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="empty-state">
      <SearchX size={36} />
      <span className="eyebrow">404 / KHÔNG TÌM THẤY</span>
      <h1 className="text-2xl">Trang này không còn ở đây.</h1>
      <p>Đường dẫn không tồn tại hoặc sản phẩm đã ngừng bán.</p>
      <Link href="/" className="btn-secondary">
        <ArrowLeft size={16} />
        Về kho tài khoản
      </Link>
    </div>
  );
}
