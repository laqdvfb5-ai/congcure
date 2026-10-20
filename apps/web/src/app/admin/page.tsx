import Link from 'next/link';
import { core } from '@/lib/core';

export default async function AdminHome() {
  const [pending, unmatched, products] = await Promise.all([
    core.listAllOrders({ status: 'PENDING' }), core.listBankTxns({ status: 'UNMATCHED' }), core.listProducts({ activeOnly: false }),
  ]);
  const lowStock = products.filter((p) => p.stock !== null && p.stock < 5 && p.active);
  const tiles = [
    ['Đơn đang xử lý', pending.length, '/admin/don-hang?status=PENDING'],
    ['Giao dịch chưa khớp', unmatched.length, '/admin/giao-dich'],
    ['Sản phẩm sắp hết (<5)', lowStock.length, '/admin/san-pham'],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tiles.map(([label, n, href]) => (
        <Link key={label} href={href} className="card block">
          <div className="text-sm text-gray-500">{label}</div>
          <div className="text-3xl font-semibold">{n}</div>
        </Link>
      ))}
    </div>
  );
}
