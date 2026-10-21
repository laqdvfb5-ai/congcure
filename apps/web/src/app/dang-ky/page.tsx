import Link from "next/link";
import { ArrowRight, UserRoundPlus } from "lucide-react";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { registerAction } from "../auth-actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  return (
    <div className="auth-layout">
      <header className="auth-heading">
        <span className="auth-symbol">
          <UserRoundPlus size={24} />
        </span>
        <h1>Bắt đầu với congcure.</h1>
        <p>Tạo tài khoản và chọn những sản phẩm phù hợp với bạn.</p>
      </header>
      <Flash searchParams={await searchParams} />
      <form action={registerAction} className="form-stack">
        <label className="field">
          Tên hiển thị
          <input
            name="name"
            autoComplete="name"
            placeholder="Tên của bạn"
            required
            className="input"
          />
        </label>
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
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            minLength={8}
            required
            className="input"
          />
        </label>
        <p className="text-xs text-muted">
          Khi tạo tài khoản, bạn đồng ý với{" "}
          <Link href="/chinh-sach" className="link">
            chính sách cửa hàng
          </Link>
          .
        </p>
        <SubmitButton>
          Tạo tài khoản
          <ArrowRight size={16} />
        </SubmitButton>
      </form>
      <p className="auth-footer">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="link">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
