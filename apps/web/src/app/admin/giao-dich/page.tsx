import { Check } from "lucide-react";
import { Flash } from "@/components/Flash";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatDate, formatVnd } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { assignTxnAction } from "../actions";

export default async function AdminBankTxns({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [txns, staff] = await Promise.all([
    core.listBankTxns(),
    requireStaff(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / THANH TOÁN"
        title="Giao dịch ngân hàng"
        description="Đối chiếu giao dịch và gán các khoản nạp chưa khớp."
      />
      <Flash searchParams={await searchParams} />
      <div className="table-surface">
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mã giao dịch</th>
                <th>Số tiền</th>
                <th>Nội dung</th>
                <th>Trạng thái / Khách hàng</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap text-xs">{formatDate(t.createdAt)}</td>
                  <td className="font-mono text-xs">{t.providerTxnId}</td>
                  <td className="nowrap font-semibold">
                    {formatVnd(t.amount)}
                  </td>
                  <td className="min-w-48 max-w-72 break-words text-xs">
                    {t.content}
                  </td>
                  <td>
                    {t.status === "UNMATCHED" ? (
                      staff.role === "ADMIN" ? (
                        <form action={assignTxnAction} className="flex gap-2">
                          <input type="hidden" name="txnId" value={t.id} />
                          <input
                            name="user"
                            placeholder="ID hoặc email khách hàng"
                            className="input min-w-44"
                            required
                            aria-label="Khách hàng nhận tiền"
                          />
                          <button
                            className="icon-btn"
                            title="Gán giao dịch và cộng tiền"
                            aria-label="Gán giao dịch và cộng tiền"
                          >
                            <Check size={17} />
                          </button>
                        </form>
                      ) : (
                        <span className="status-badge pending">
                          Chờ admin đối chiếu
                        </span>
                      )
                    ) : (
                      <span
                        className={
                          "stock-badge " +
                          (t.status === "MATCHED" ? "" : "empty")
                        }
                      >
                        {t.status === "MATCHED"
                          ? "Đã cộng · #" + t.userId
                          : "Bỏ qua"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {txns.length === 0 && (
          <EmptyState title="Chưa có giao dịch ngân hàng" />
        )}
        <div className="catalog-foot">100 giao dịch gần nhất</div>
      </div>
    </>
  );
}
