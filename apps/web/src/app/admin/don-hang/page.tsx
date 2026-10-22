import Link from "next/link";
import { fulfillPreorderAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/Flash";
import type { OrderStatus } from "@web12/core";
import { PageHeading, OrderBadge, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatDate, formatVnd, STATUS_LABEL } from "@/lib/format";

const statuses: OrderStatus[] = ["PREORDER", "PENDING", "COMPLETED", "REFUNDED"];
export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const status = statuses.includes(sp.status as OrderStatus)
    ? (sp.status as OrderStatus)
    : undefined;
  const orders = await core.listAllOrders({ status });
  return (
    <>
      <Flash searchParams={sp} />
      <PageHeading
        eyebrow="QUẢN TRỊ / BÁN HÀNG"
        title="Đơn hàng"
        description="Theo dõi giao hàng, số lần xử lý và hoàn tiền."
      />
      <nav className="category-tabs" aria-label="Lọc đơn hàng">
        <Link href="/admin/don-hang" className={!status ? "active" : ""}>
          Tất cả
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={"/admin/don-hang?status=" + s}
            className={s === status ? "active" : ""}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="table-surface">
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Khách</th>
                <th>Sản phẩm</th>
                <th>SL</th>
                <th>Thành tiền</th>
                <th>Nguồn</th>
                <th>Trạng thái</th>
                <th>Lần thử</th>
                <th>Thời gian</th>
                <th>Giao đơn đặt trước</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono text-xs">#{o.id}</td>
                  <td>#{o.userId}</td>
                  <td className="min-w-44">{o.productName}</td>
                  <td>{o.quantity}</td>
                  <td className="nowrap">{formatVnd(o.total)}</td>
                  <td className="text-xs">
                    {o.source}
                    <div>{o.paymentMethod === "BANK" ? "Ngân hàng" : "Ví"}</div>
                  </td>
                  <td>
                    <OrderBadge status={o.status} />
                    {o.error && (
                      <p className="text-xs text-accent mt-2 max-w-56">
                        {o.error}
                      </p>
                    )}
                  </td>
                  <td>{o.attempts}</td>
                  <td className="nowrap text-xs text-muted">
                    {formatDate(o.createdAt)}
                  </td>
                  <td>
                    {o.status === "PREORDER" && (
                      o.supplierAttempted ? <p className="text-xs">Đang xác định kết quả mua từ nguồn. Tạm khóa giao tay.</p> :
                      <form action={fulfillPreorderAction} className="min-w-64">
                        <input type="hidden" name="orderId" value={o.id} />
                        <label htmlFor={`accounts-${o.id}`}>Nhập {o.quantity} tài khoản, mỗi dòng một tài khoản</label>
                        <textarea id={`accounts-${o.id}`} name="accounts" rows={3} className="input" />
                        <p className="text-xs text-muted">Để trống để lấy hàng từ kho đã nhập.</p>
                        <SubmitButton className="btn btn-sm">Giao hàng</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && (
          <EmptyState title="Không có đơn hàng phù hợp" />
        )}
        <div className="catalog-foot">Hiển thị tối đa 100 đơn gần nhất</div>
      </div>
    </>
  );
}
