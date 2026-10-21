import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { loginAction } from "../auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  return (
    <div className="auth-layout">
      <header className="auth-heading">
        <span className="auth-symbol">
          <LogIn size={24} />
        </span>
        <h1>Chào mừng trở lại.</h1>
        <p>Đăng nhập để tiếp tục với tài khoản congcure của bạn.</p>
      </header>
      <Flash searchParams={await searchParams} />
      <form action={loginAction} className="form-stack">
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ban@example.com"
            required
            className="input"
          />
        </label>
        <label className="field">
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            required
            className="input"
          />
        </label>
        <SubmitButton>
          Đăng nhập
          <ArrowRight size={16} />
        </SubmitButton>
      </form>
      <p className="auth-footer">
        Chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="link">
          Đăng ký ngay
        </Link>
      </p>
      <p className="auth-footer">
        Cần trợ giúp?{" "}
        <a
          href="https://t.me/congcure"
          target="_blank"
          rel="noreferrer"
          className="link"
        >
          Liên hệ hỗ trợ
        </a>
      </p>
    </div>
  );
}
