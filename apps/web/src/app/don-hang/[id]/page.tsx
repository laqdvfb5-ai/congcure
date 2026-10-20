import { notFound } from 'next/navigation';
import { core } from '@/lib/core';
import { formatDate, formatVnd, STATUS_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const order = Number.isSafeInteger(id) ? await core.getOrderForUser(id, user.id).catch(() => null) : null;
  if (!order) notFound();
  const secrets = order.status === 'COMPLETED' ? await core.getOrderSecrets(order.id) : [];

  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-semibold">Đơn #{order.id}: {order.productName}</h1>
      <div className="text-sm text-gray-600">
        {order.quantity} × {formatVnd(order.unitPrice)} = <b>{formatVnd(order.total)}</b> · {STATUS_LABEL[order.status]} · {formatDate(order.createdAt)}
      </div>
      {order.status === 'PENDING' && (
        <p className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Đơn đang được xử lý từ nhà cung cấp. Tải lại trang sau ít giây.
        </p>
      )}
      {order.status === 'REFUNDED' && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Đơn thất bại và đã hoàn tiền: {order.error}</p>
      )}
      {secrets.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium">Tài khoản đã mua ({secrets.length})</div>
          <textarea readOnly rows={Math.min(15, secrets.length + 1)} className="input font-mono text-sm" value={secrets.join('\n')} />
        </div>
      )}
    </div>
  );
}
