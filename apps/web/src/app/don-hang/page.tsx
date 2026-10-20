import Link from 'next/link';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await core.listOrdersForUser(user.id);
  return (
    <div className="card">
      <h1 className="mb-4 text-xl font-semibold">Đơn hàng của bạn</h1>
      <table className="table">
        <thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Tổng</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/don-hang/${o.id}`} className="text-blue-700">#{o.id}</Link></td>
              <td>{o.productName}</td><td>{o.quantity}</td><td>{formatVnd(o.total)}</td>
              <td>{STATUS_LABEL[o.status]}</td><td>{formatDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="mt-3 text-gray-500">Chưa có đơn hàng.</p>}
    </div>
  );
}
