import Link from "next/link";
import { ArrowUpRight, KeyRound, Wallet, Trash2 } from "lucide-react";
import { Flash } from "@/components/Flash";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatDate, formatVnd, TIER_LABEL } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { revokeApiKeyAction } from "./actions";

const ledgerLabel = {
  TOPUP: "Nạp tiền",
  PURCHASE: "Mua hàng",
  REFUND: "Hoàn tiền",
  ADJUST: "Điều chỉnh",
} as const;
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const [keys, ledger] = await Promise.all([
    core.listApiKeys(user.id),
    core.listLedger(user.id, 50),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="TÀI KHOẢN CỦA BẠN"
        title="Tài khoản & API"
        description="Thông tin cá nhân, khóa truy cập và lịch sử ví."
      />
      <div className="account-profile">
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <h2>{user.name}</h2>
          <p>
            {user.email} · {TIER_LABEL[user.tier]} · #{user.id}
          </p>
        </div>
        <Link href="/nap-tien" className="btn-secondary">
          <Wallet size={16} />
          {formatVnd(user.balance)}
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <Flash searchParams={await searchParams} />
      <div className="account-sections">
        <section id="api" className="card">
          <div className="flex items-center gap-2 mb-5">
            <KeyRound size={18} />
            <h2>Khóa API</h2>
          </div>
          <ApiKeyForm />
          <div className="scroll-table mt-5">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Tiền tố</th>
                  <th>Lần dùng cuối</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="font-mono text-xs">{k.prefix}…</td>
                    <td className="text-xs nowrap">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : "Chưa sử dụng"}
                    </td>
                    <td>
                      <span
                        className={
                          "stock-badge " + (k.revokedAt ? "empty" : "")
                        }
                      >
                        {k.revokedAt ? "Đã thu hồi" : "Hoạt động"}
                      </span>
                    </td>
                    <td>
                      {!k.revokedAt && (
                        <form action={revokeApiKeyAction}>
                          <input type="hidden" name="id" value={k.id} />
                          <button
                            className="icon-btn"
                            aria-label={"Thu hồi khóa " + k.name}
                            title="Thu hồi khóa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {keys.length === 0 && (
            <p className="text-xs text-muted py-5">Chưa có khóa API.</p>
          )}
          <div className="api-docs">
            <h3 className="text-sm mb-2">Tài liệu API</h3>
            <p className="text-xs text-muted mb-3">
              Xác thực bằng header <code>X-API-Key</code>. Giới hạn 60 yêu
              cầu/phút/khóa.
            </p>
            {[
              ["GET", "/api/v1/products", "Danh sách sản phẩm"],
              ["GET", "/api/v1/balance", "Số dư ví"],
              ["POST", "/api/v1/orders", "Tạo đơn hàng"],
              ["GET", "/api/v1/orders/:id", "Chi tiết đơn hàng"],
            ].map(([method, path, label]) => (
              <div className="endpoint" key={path}>
                <span>{method}</span>
                <code>{path}</code>
                <span className="text-muted">{label}</span>
              </div>
            ))}
            <p className="text-xs text-muted mt-4 mb-2">
              Tạo đơn với body JSON và <code>Idempotency-Key</code> riêng cho
              mỗi đơn để chống mua trùng.
            </p>
            <pre className="api-code">
              {
                'POST /api/v1/orders\nX-API-Key: sk_...\nIdempotency-Key: don-hang-001\nContent-Type: application/json\n\n{ "productId": 1, "quantity": 2 }'
              }
            </pre>
          </div>
        </section>
        <section id="ledger">
          <h2 className="mb-4">Lịch sử ví</h2>
          <div className="table-surface">
            <div className="scroll-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Giao dịch</th>
                    <th>Số tiền</th>
                    <th>Số dư sau</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap text-xs">
                        {formatDate(e.createdAt)}
                      </td>
                      <td className="nowrap">{ledgerLabel[e.type]}</td>
                      <td
                        className={
                          "nowrap " +
                          (e.amount > 0 ? "text-[var(--primary)]" : "")
                        }
                      >
                        {e.amount > 0 ? "+" : ""}
                        {formatVnd(e.amount)}
                      </td>
                      <td className="nowrap">{formatVnd(e.balanceAfter)}</td>
                      <td className="text-xs text-muted">
                        {e.refType === "order" ? (
                          <Link href={"/don-hang/" + e.refId}>
                            Đơn #{e.refId}
                          </Link>
                        ) : (
                          e.note
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ledger.length === 0 && <EmptyState title="Chưa có giao dịch" />}
            <div className="catalog-foot">50 giao dịch gần nhất</div>
          </div>
        </section>
      </div>
    </>
  );
}
