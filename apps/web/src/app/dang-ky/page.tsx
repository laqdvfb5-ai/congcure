import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { registerAction } from '../auth-actions';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="mb-4 text-xl font-semibold">Đăng ký</h1>
      <Flash searchParams={await searchParams} />
      <form action={registerAction} className="space-y-3">
        <input name="name" placeholder="Tên hiển thị" required className="input" />
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Mật khẩu (tối thiểu 8 ký tự)" minLength={8} required className="input" />
        <button className="btn w-full">Tạo tài khoản</button>
      </form>
      <p className="mt-3 text-sm">Đã có tài khoản? <Link href="/dang-nhap" className="text-blue-700">Đăng nhập</Link></p>
    </div>
  );
}
