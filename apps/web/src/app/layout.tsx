import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatVnd } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from './auth-actions';
import './globals.css';

export const metadata = { title: 'Shop tài khoản' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-semibold">Shop tài khoản</Link>
            <div className="flex-1" />
            {user ? (
              <>
                <Link href="/nap-tien" className="font-medium text-blue-700">{formatVnd(user.balance)}</Link>
                <Link href="/don-hang">Đơn hàng</Link>
                <Link href="/tai-khoan">Tài khoản</Link>
                {user.role !== 'CUSTOMER' && <Link href="/admin">Quản trị</Link>}
                <form action={logoutAction}><button className="text-gray-500">Đăng xuất</button></form>
              </>
            ) : (
              <>
                <Link href="/dang-nhap">Đăng nhập</Link>
                <Link href="/dang-ky" className="btn">Đăng ký</Link>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
