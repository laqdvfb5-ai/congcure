import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireStaff } from '@/lib/session';

const LINKS = [
  ['/admin', 'Tổng quan'], ['/admin/san-pham', 'Sản phẩm'], ['/admin/danh-muc', 'Danh mục'],
  ['/admin/don-hang', 'Đơn hàng'], ['/admin/nguoi-dung', 'Người dùng'], ['/admin/giao-dich', 'Giao dịch NH'],
  ['/admin/nha-cung-cap', 'Nhà cung cấp'],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <nav className="flex flex-col gap-1 text-sm">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-gray-100">{label}</Link>)}
      </nav>
      <div>{children}</div>
    </div>
  );
}
