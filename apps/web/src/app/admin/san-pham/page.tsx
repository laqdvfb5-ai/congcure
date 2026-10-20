import Link from 'next/link';
import { core } from '@/lib/core';
import { formatVnd, TYPE_LABEL } from '@/lib/format';

export default async function AdminProducts() {
  const products = await core.listProducts({ activeOnly: false });
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sản phẩm</h1>
        <Link href="/admin/san-pham/moi" className="btn">+ Thêm sản phẩm</Link>
      </div>
      <table className="table">
        <thead><tr><th>#</th><th>Tên</th><th>Loại</th><th>Giá TV/CTV/ĐL</th><th>Tồn</th><th>Bán</th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td><Link href={`/admin/san-pham/${p.id}`} className="link">{p.name}</Link></td>
              <td>{TYPE_LABEL[p.type]}</td>
              <td>{formatVnd(p.priceMember)} / {formatVnd(p.priceCtv)} / {formatVnd(p.priceAgent)}</td>
              <td>{p.stock ?? '∞'}</td>
              <td>{p.active ? 'Đang bán' : 'Ẩn'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
