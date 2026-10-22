import { TopupPanel } from "@/components/TopupPanel";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatDate, formatVnd } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function TopupPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const user = await requireUser();
  const requested = Number((await searchParams).amount);
  const initialAmount =
    Number.isSafeInteger(requested) &&
    requested >= 10_000 &&
    requested <= 100_000_000
      ? requested
      : 10_000;
  const history = (await core.listLedger(user.id, 100))
    .filter((e) => e.type === "TOPUP")
    .slice(0, 20);
  return (
    <>
      <PageHeading
        eyebrow="VÍ CỦA BẠN"
        title="Nạp tiền"
        description="Nạp ví qua VietQR để thanh toán các đơn hàng."
      />
      <TopupPanel
        initialBalance={user.balance}
        initialAmount={initialAmount}
        bankId={process.env.BANK_ID ?? ""}
        account={process.env.BANK_ACCOUNT ?? ""}
        accountName={process.env.BANK_ACCOUNT_NAME ?? ""}
        code={user.topupCode}
      />
      <section className="section-block">
        <h2>Giao dịch nạp gần đây</h2>
        <div className="table-surface">
          <div className="scroll-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Số dư sau</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap text-xs">
                      {formatDate(e.createdAt)}
                    </td>
                    <td>{e.note || "Nạp tiền ngân hàng"}</td>
                    <td className="nowrap text-[var(--primary)]">
                      +{formatVnd(e.amount)}
                    </td>
                    <td className="nowrap">{formatVnd(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && <EmptyState title="Chưa có giao dịch nạp" />}
        </div>
      </section>
    </>
  );
}
