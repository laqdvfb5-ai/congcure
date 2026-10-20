import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { loginAction } from '../auth-actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="mb-4 text-xl font-semibold">Đăng nhập</h1>
      <Flash searchParams={await searchParams} />
      <form action={loginAction} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Mật khẩu" required className="input" />
        <button className="btn w-full">Đăng nhập</button>
      </form>
      <p className="mt-3 text-sm">Chưa có tài khoản? <Link href="/dang-ky" className="text-blue-700">Đăng ký</Link></p>
    </div>
  );
}
