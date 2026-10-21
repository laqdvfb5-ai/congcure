import Link from "next/link";
import { ArrowRight, Clock3, Landmark, Package, Plus } from "lucide-react";
import { PageHeading, EmptyState, OrderBadge } from "@/components/ui";
import { core } from "@/lib/core";
import { formatVnd } from "@/lib/format";

export default async function AdminHome() {
  const [pending, unmatched, products, recent] = await Promise.all([
    core.listAllOrders({ status: "PENDING" }),
    core.listBankTxns({ status: "UNMATCHED" }),
    core.listProducts({ activeOnly: false, includeSupplierStock: true }),
    core.listAllOrders({ limit: 8 }),
  ]);
  const lowStock = products.filter(
    (p) => p.stock !== null && p.stock < 5 && p.active,
  );
  const tiles = [
    {
      label: "Đơn chờ xử lý",
      n: pending.length,
      href: "/admin/don-hang?status=PENDING",
      icon: Clock3,
    },
    {
      label: "Giao dịch cần đối chiếu",
      n: unmatched.length,
      href: "/admin/giao-dich",
      icon: Landmark,
    },
    {
      label: "Sản phẩm sắp hết hàng",
      n: lowStock.length,
      href: "/admin/san-pham",
      icon: Package,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / CỬA HÀNG"
        title="Tổng quan"
        description="Theo dõi các đơn hàng và công việc cần xử lý."
      >
        <Link href="/admin/san-pham/moi" className="btn">
          <Plus size={16} />
          Thêm sản phẩm
        </Link>
      </PageHeading>
      <div className="admin-grid">
        {tiles.map(({ label, n, href, icon: Icon }) => (
          <Link key={href} href={href} className="admin-tile">
            <div>
              {label}
              <Icon size={19} />
            </div>
            <strong>
              {n}
              {n === 100 ? "+" : ""}
            </strong>
            <span>
              Xem chi tiết
              <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>
      <section className="section-block">
        <h2>Đơn hàng gần đây</h2>
        <div className="table-surface">
          <div className="scroll-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Đơn hàng</th>
                  <th>Khách hàng</th>
                  <th>Sản phẩm</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-xs">#{o.id}</td>
                    <td>#{o.userId}</td>
                    <td>{o.productName}</td>
                    <td className="nowrap">{formatVnd(o.total)}</td>
                    <td>
                      <OrderBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recent.length === 0 && <EmptyState title="Chưa có đơn hàng" />}
        </div>
      </section>
    </>
  );
}
