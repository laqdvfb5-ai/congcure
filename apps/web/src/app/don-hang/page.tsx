import Link from "next/link";
import { ArrowRight, CheckCheck, Clock3, ReceiptText } from "lucide-react";
import { core } from "@/lib/core";
import { formatDate, formatVnd } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { PageHeading, OrderBadge, EmptyState } from "@/components/ui";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const all = await core.listOrdersForUser(user.id);
  const status = (await searchParams).status;
  const orders = ["PENDING", "COMPLETED", "REFUNDED"].includes(status ?? "")
    ? all.filter((o) => o.status === status)
    : all;
  return (
    <>
      <PageHeading
        eyebrow="TÀI KHOẢN / LỊCH SỬ"
        title="Đơn hàng của tôi"
        description="Theo dõi đơn hàng và mở lại thông tin tài khoản đã mua."
      >
        <Link href="/" className="btn-secondary">
          Tiếp tục mua sắm
          <ArrowRight size={16} />
        </Link>
      </PageHeading>
      <div className="summary-grid">
        <div className="summary-item">
          <span>
            <ReceiptText size={15} />
            Đơn gần đây
          </span>
          <strong>{all.length}</strong>
        </div>
        <div className="summary-item">
          <span>
            <CheckCheck size={15} />
            Hoàn thành
          </span>
          <strong>{all.filter((o) => o.status === "COMPLETED").length}</strong>
        </div>
        <div className="summary-item">
          <span>
            <Clock3 size={15} />
            Đang xử lý
          </span>
          <strong>{all.filter((o) => o.status === "PENDING").length}</strong>
        </div>
      </div>
      <nav className="category-tabs" aria-label="Trạng thái đơn hàng">
        {[
          ["", "Tất cả"],
          ["COMPLETED", "Hoàn thành"],
          ["PENDING", "Đang xử lý"],
          ["REFUNDED", "Đã hoàn tiền"],
        ].map(([s, label]) => (
          <Link
            key={s}
            href={s ? "/don-hang?status=" + s : "/don-hang"}
            className={(status ?? "") === s ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="table-surface">
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Sản phẩm</th>
                <th>SL</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link
                      href={"/don-hang/" + o.id}
                      className="font-mono text-xs"
                    >
                      #{String(o.id).padStart(4, "0")}
                    </Link>
                  </td>
                  <td className="min-w-44">
                    <Link href={"/don-hang/" + o.id}>{o.productName}</Link>
                    <div className="text-xs text-muted">
                      {o.source === "API" ? "API đại lý" : "Mua trên web"}
                    </div>
                  </td>
                  <td>{o.quantity}</td>
                  <td className="nowrap">{formatVnd(o.total)}</td>
                  <td>
                    <OrderBadge status={o.status} />
                  </td>
                  <td className="nowrap text-xs text-muted">
                    {formatDate(o.createdAt)}
                  </td>
                  <td>
                    <Link
                      href={"/don-hang/" + o.id}
                      className="icon-btn"
                      aria-label={"Xem đơn " + o.id}
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && (
          <EmptyState
            title="Chưa có đơn hàng"
            description="Các đơn mua của bạn sẽ xuất hiện tại đây."
            href="/"
          />
        )}
        <div className="catalog-foot">Hiển thị tối đa 50 đơn gần nhất</div>
      </div>
    </>
  );
}
