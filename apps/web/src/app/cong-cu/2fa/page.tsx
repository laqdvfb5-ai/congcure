import { PageHeading } from "@/components/ui";
import { TotpTool } from "@/components/TotpTool";

export const metadata = { title: "Mã xác thực 2FA" };
export default function TotpPage() {
  return (
    <div className="totp-layout">
      <PageHeading
        eyebrow="CÔNG CỤ"
        title="Mã xác thực 2FA"
        description="TOTP · 6 chữ số · Chu kỳ 30 giây"
      />
      <TotpTool />
    </div>
  );
}
