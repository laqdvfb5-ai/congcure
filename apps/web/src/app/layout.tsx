import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { THEME_SCRIPT, ThemeToggle } from '@/components/ThemeToggle';
import { formatVnd } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { site } from '@/lib/site';
import { logoutAction } from './auth-actions';
import './globals.css';

const grotesk = Inter_Tight({ subsets: ['latin', 'vietnamese'], variable: '--font-grotesk', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'vietnamese'], variable: '--font-mono-face', display: 'swap' });

export const metadata = { title: `${site.logo} · ${site.tagline}` };

const NAV = [
  ['/', 'Trang chủ'],
  ['/#san-pham', 'Sản phẩm'],
  ['/nap-tien', 'Nạp tiền'],
  ['/don-hang', 'Lịch sử'],
  ['/tai-khoan#api', 'Tài liệu API'],
] as const;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="vi" className={`${grotesk.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="bg-fg text-bg">
          <div className="container-x flex items-center justify-between py-1.5 font-mono text-[11px] uppercase tracking-wider">
            <span>{site.hours}</span>
            <span className="hidden gap-5 sm:flex">
              <Link href="/chinh-sach">Chính sách</Link>
              <Link href="/chinh-sach#faq">FAQ</Link>
              <a href={site.telegram.url} target="_blank" rel="noreferrer">Liên hệ</a>
            </span>
          </div>
        </div>

        {/* Header */}
        <header className="border-b border-fg">
          <div className="container-x flex items-center gap-4 py-4">
            <Link href="/" className="display shrink-0 text-2xl md:text-3xl">{site.logo}<sup className="text-xs">®</sup></Link>
            <form action="/" className="hidden flex-1 md:block">
              <input name="q" placeholder="Tìm kiếm sản phẩm…" className="input" />
            </form>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <ThemeToggle />
              {user ? (
                <>
                  <Link href="/nap-tien" className="pill font-mono">{formatVnd(user.balance)}</Link>
                  <Link href="/tai-khoan" className="hidden pill sm:inline-flex">{user.name}</Link>
                  <form action={logoutAction} className="hidden sm:block">
                    <button className="pill text-muted">Thoát</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/dang-nhap" className="hidden pill sm:inline-flex">Đăng nhập</Link>
                  <Link href="/dang-ky" className="btn">Đăng ký</Link>
                </>
              )}
            </div>
          </div>

          {/* Desktop nav */}
          <div className="container-x hidden md:block"><nav className="flex items-center gap-6 border-t border-line py-3 text-sm">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="hover:text-accent">{label}</Link>)}
            {user && user.role !== 'CUSTOMER' && <Link href="/admin" className="hover:text-accent">Quản trị</Link>}
            <a href={site.telegram.url} target="_blank" rel="noreferrer" className="ml-auto font-mono text-xs uppercase text-muted hover:text-fg">
              Telegram {site.telegram.label}
            </a>
          </nav></div>

          {/* Mobile nav: no JS needed */}
          <div className="container-x md:hidden"><details className="border-t border-line">
            <summary className="cursor-pointer list-none py-3 font-mono text-xs uppercase tracking-wider">☰ Menu</summary>
            <div className="flex flex-col gap-3 pb-4">
              <form action="/"><input name="q" placeholder="Tìm kiếm sản phẩm…" className="input" /></form>
              {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
              {user && user.role !== 'CUSTOMER' && <Link href="/admin">Quản trị</Link>}
              {user ? (
                <>
                  <Link href="/tai-khoan">Tài khoản ({user.name})</Link>
                  <form action={logoutAction}><button className="text-muted">Đăng xuất</button></form>
                </>
              ) : <Link href="/dang-nhap">Đăng nhập</Link>}
            </div>
          </details></div>
        </header>

        <main className="container-x flex-1 py-8">{children}</main>

        <footer className="mt-16 border-t border-fg">
          <div className="container-x grid gap-8 py-10 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <div className="display text-5xl md:text-7xl">{site.logo}®</div>
              <p className="mt-3 max-w-sm text-sm text-muted">{site.tagline}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="eyebrow">Khám phá</div>
              {NAV.map(([href, label]) => <Link key={href} href={href} className="block hover:text-accent">{label}</Link>)}
            </div>
            <div className="space-y-2 text-sm">
              <div className="eyebrow">Hỗ trợ</div>
              <Link href="/chinh-sach" className="block hover:text-accent">Chính sách</Link>
              <a href={site.telegram.url} className="block hover:text-accent">Telegram {site.telegram.label}</a>
              <span className="block text-muted">{site.hours}</span>
            </div>
          </div>
          <div className="container-x"><div className="border-t border-line py-4 font-mono text-[11px] uppercase tracking-wider text-muted">
            © {new Date().getFullYear()} {site.name}
          </div></div>
        </footer>
      </body>
    </html>
  );
}
