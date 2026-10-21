"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  Code2,
  CreditCard,
  Headphones,
  LayoutGrid,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Wallet,
  X,
  ReceiptText,
  KeyRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Category, User } from "@web12/core";
import { ThemeToggle } from "./ThemeToggle";
import { formatVnd, TIER_LABEL } from "@/lib/format";
import { site } from "@/lib/site";
import { logoutAction } from "@/app/auth-actions";

const links = [
  { href: "/", label: "Kho tài khoản", icon: LayoutGrid },
  { href: "/don-hang", label: "Đơn hàng của tôi", icon: ReceiptText },
  { href: "/nap-tien", label: "Nạp tiền", icon: Wallet },
  { href: "/tai-khoan", label: "Tài khoản & API", icon: Code2 },
  { href: "/cong-cu/2fa", label: "Công cụ 2FA", icon: KeyRound },
];
export function AppShell({
  children,
  user,
  categories,
}: {
  children: ReactNode;
  user: Pick<User, "name" | "email" | "balance" | "tier" | "role"> | null;
  categories: Category[];
}) {
  const pathname = usePathname();
  const mobile = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    mobile.current?.close();
  }, [pathname]);
  const isAdmin = pathname.startsWith("/admin");
  const title = isAdmin
    ? "Quản trị cửa hàng"
    : (links.find((l) => l.href !== "/" && pathname.startsWith(l.href))
        ?.label ?? "Kho tài khoản");
  function navigation() {
    return (
      <>
        <Link
          href="/"
          className="wordmark"
          onClick={() => mobile.current?.close()}
        >
          <span className="logo-mark">
            <Boxes size={23} strokeWidth={1.7} />
          </span>
          <span>
            congcure<span className="logo-dot">.</span>
            <small>DIGITAL MARKETPLACE</small>
          </span>
        </Link>
        <div className="nav-label">Cửa hàng</div>
        <nav className="primary-nav" aria-label="Điều hướng chính">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => mobile.current?.close()}
              className={
                (
                  href === "/"
                    ? pathname === "/" ||
                      pathname.startsWith("/danh-muc") ||
                      pathname.startsWith("/san-pham")
                    : pathname.startsWith(href)
                )
                  ? "active"
                  : ""
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {href === "/" && <span className="nav-live" />}
            </Link>
          ))}
        </nav>
        {categories.length > 0 && (
          <>
            <div className="nav-label">Danh mục</div>
            <nav className="category-nav" aria-label="Danh mục sản phẩm">
              {categories.map((c, i) => (
                <Link
                  key={c.id}
                  href={"/danh-muc/" + c.slug}
                  onClick={() => mobile.current?.close()}
                  className={pathname === "/danh-muc/" + c.slug ? "active" : ""}
                >
                  <span className={"category-dot category-" + (i % 4)} />
                  {c.name}
                  <ChevronRight size={14} />
                </Link>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          {user && (
            <div className="sidebar-wallet">
              <div>
                <Wallet size={16} />
                <span>Ví của bạn</span>
                <span className="tier-label">{TIER_LABEL[user.tier]}</span>
              </div>
              <strong>{formatVnd(user.balance)}</strong>
              <Link href="/nap-tien" onClick={() => mobile.current?.close()}>
                Nạp thêm tiền
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          <nav className="primary-nav">
            {user?.role !== "CUSTOMER" && user && (
              <Link href="/admin" className={isAdmin ? "active" : ""}>
                <Settings2 size={18} />
                Quản trị
              </Link>
            )}
            <Link href="/chinh-sach">
              <ShieldCheck size={18} />
              Chính sách & hỗ trợ
            </Link>
            <a href={site.telegram.url} target="_blank" rel="noreferrer">
              <Headphones size={18} />
              Liên hệ Telegram
              <ArrowUpRight size={14} />
            </a>
          </nav>
          {user && (
            <form action={logoutAction} className="sidebar-logout">
              <button className="btn-secondary w-full">
                <LogOut size={16} />
                Đăng xuất
              </button>
            </form>
          )}
          <div className="sidebar-foot">
            © {new Date().getFullYear()} congcure
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <aside className="sidebar">{navigation()}</aside>
      <dialog
        ref={mobile}
        className="mobile-menu"
        aria-label="Menu điều hướng"
        onClick={(e) => {
          if (e.target === e.currentTarget) mobile.current?.close();
        }}
      >
        <div className="mobile-menu-inner">
          <button
            type="button"
            className="icon-btn mobile-close"
            onClick={() => mobile.current?.close()}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
          {navigation()}
        </div>
      </dialog>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-location">
            <button
              type="button"
              className="icon-btn menu-toggle"
              onClick={() => mobile.current?.showModal()}
              aria-label="Mở menu"
            >
              <Menu size={20} />
            </button>
            <span className="text-muted">Cửa hàng</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            {user ? (
              <>
                <Link href="/nap-tien" className="topbar-wallet">
                  <Wallet size={16} />
                  <span>{formatVnd(user.balance)}</span>
                </Link>
                <Link href="/tai-khoan" className="avatar" title={user.name}>
                  {user.name.slice(0, 1).toUpperCase()}
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="icon-btn"
                    title="Đăng xuất"
                    aria-label="Đăng xuất"
                  >
                    <LogOut size={17} />
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/dang-nhap" className="login-link">
                  Đăng nhập
                </Link>
                <Link href="/dang-ky" className="btn btn-sm">
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </header>
        <main id="main-content" className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            congcure<span className="text-muted"> / Tài khoản số</span>
          </span>
          <div>
            <span className="footer-hours">Hỗ trợ 09:00 – 22:00</span>
            <Link href="/chinh-sach">Chính sách</Link>
            <a href={site.telegram.url} target="_blank" rel="noreferrer">
              Telegram
              <ArrowUpRight size={13} />
            </a>
          </div>
        </footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Truy cập nhanh">
        {[
          { href: "/", label: "Cửa hàng", icon: LayoutGrid },
          { href: "/don-hang", label: "Đơn hàng", icon: ReceiptText },
          { href: "/nap-tien", label: "Nạp tiền", icon: CreditCard },
          { href: "/tai-khoan", label: "Tài khoản", icon: Code2 },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
