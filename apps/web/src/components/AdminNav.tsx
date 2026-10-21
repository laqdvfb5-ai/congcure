"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Package,
  Folders,
  ReceiptText,
  Users,
  Landmark,
  Network,
} from "lucide-react";
const links = [
  { href: "/admin", label: "Tổng quan", icon: BarChart3 },
  { href: "/admin/san-pham", label: "Sản phẩm", icon: Package },
  { href: "/admin/danh-muc", label: "Danh mục", icon: Folders },
  { href: "/admin/don-hang", label: "Đơn hàng", icon: ReceiptText },
  { href: "/admin/nguoi-dung", label: "Người dùng", icon: Users },
  { href: "/admin/giao-dich", label: "Giao dịch", icon: Landmark },
  { href: "/admin/nha-cung-cap", label: "Nhà cung cấp", icon: Network },
];
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Quản trị">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={
            (href === "/admin" ? pathname === href : pathname.startsWith(href))
              ? "active"
              : ""
          }
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
