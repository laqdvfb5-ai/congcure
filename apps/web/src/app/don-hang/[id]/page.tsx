import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, RotateCcw } from "lucide-react";
import { AccountList } from "@/components/AccountList";
import { OrderRefresh } from "@/components/OrderRefresh";
import { PageHeading, OrderBadge } from "@/components/ui";
import { core } from "@/lib/core";
import { formatDate, formatVnd, ORDER_REFUND_MESSAGE } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const order = Number.isSafeInteger(id)
    ? await core.getOrderForUser(id, user.id).catch((e) => {
        if (core.isAppError(e) && e.code === "NOT_FOUND") return null;
        throw e;
      })
    : null;
  if (!order) notFound();
  const secrets =
    order.status === "COMPLETED" ? await core.getOrderSecrets(order.id) : [];
  return (
    <>
      <Link href="/don-hang" className="breadcrumb">
        <ArrowLeft size={15} />
        Tất cả đơn hàng
      </Link>
      <PageHeading
        eyebrow="CHI TIẾT ĐƠN HÀNG"
        title={"Đơn #" + String(order.id).padStart(4, "0")}
        description={formatDate(order.createdAt)}
      >
        <OrderBadge status={order.status} />
      </PageHeading>
      <dl className="order-meta">
        <div>
          <dt>Sản phẩm</dt>
          <dd>{order.productName}</dd>
        </div>
        <div>
          <dt>Số lượng</dt>
          <dd>{order.quantity} tài khoản</dd>
        </div>
        <div>
          <dt>Đơn giá</dt>
          <dd>{formatVnd(order.unitPrice)}</dd>
        </div>
        <div>
          <dt>Tổng thanh toán</dt>
          <dd className="text-[var(--primary)]">{formatVnd(order.total)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted mb-5">
        Phương thức thanh toán:{" "}
        {order.paymentMethod === "BANK"
          ? "Chuyển khoản ngân hàng"
          : "Ví tài khoản"}
      </p>
      {order.status === "PENDING" && <OrderRefresh orderId={order.id} />}
      {order.status === "REFUNDED" && (
        <div className="notice notice-error">
          <RotateCcw size={18} />
          <div>
            <strong>Đã hoàn {formatVnd(order.total)} vào ví</strong>
            <p className="mt-1">{ORDER_REFUND_MESSAGE}</p>
            <Link href="/tai-khoan" className="link">
              Xem lịch sử ví
            </Link>
          </div>
        </div>
      )}
      {order.status === "COMPLETED" && (
        <>
          <div className="notice notice-success">
            <CircleCheck size={18} />
            <span>
              Giao hàng hoàn tất. Bạn có thể sao chép hoặc tải danh sách tài
              khoản bên dưới.
            </span>
          </div>
          <AccountList accounts={secrets} />
        </>
      )}
      <div className="catalog-support">
        <p className="text-xs text-muted">
          Cần hỗ trợ? Gửi mã đơn cho cửa hàng.
        </p>
        <a href="https://t.me/congcure" target="_blank" rel="noreferrer">
          Liên hệ Telegram
        </a>
      </div>
    </>
  );
}
