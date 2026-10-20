import Link from 'next/link';
import type { OrderStatus } from '@web12/core';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';

const STATUSES: OrderStatus[] = ['PENDING', 'COMPLETED', 'REFUNDED'];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const orders = await core.listAllOrders({ status });
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Đơn hàng</h1>
      <div className="flex gap-2 text-sm">
        <Link href="/admin/don-hang" className="btn-secondary">Tất cả</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/don-hang?status=${s}`} className="btn-secondary">{STATUS_LABEL[s]}</Link>)}
      </div>
      <table className="table">
        <thead><tr><th>#</th><th>User</th><th>Sản phẩm</th><th>SL</th><th>Tổng</th><th>Nguồn</th><th>Trạng thái</th><th>Lần thử</th><th>Thời gian</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td><td>#{o.userId}</td><td>{o.productName}</td><td>{o.quantity}</td><td>{formatVnd(o.total)}</td>
              <td>{o.source}</td>
              <td>{STATUS_LABEL[o.status]}{o.error && <div className="text-xs text-accent">{o.error}</div>}</td>
              <td>{o.attempts}</td><td>{formatDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
