import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupplierProduct } from '@web12/core';
import { core } from '@/lib/core';
import { formatVnd } from '@/lib/format';

export default async function SupplierProducts({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const supplier = await core.getSupplier(Number((await params).id));
  if (!supplier) notFound();
  const q = (await searchParams).q?.trim() ?? '';

  let products: SupplierProduct[] = [];
  let error: string | null = null;
  try {
    products = await (await core.getAdapterForSupplier(supplier.id)).listProducts({ q: q || undefined });
  } catch (e) {
    error = e instanceof Error ? e.message : 'Không lấy được danh sách sản phẩm';
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sản phẩm nguồn: {supplier.name}</h1>
        <Link href="/admin/nha-cung-cap" className="text-sm text-blue-700">← Nhà cung cấp</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Tìm sản phẩm (vd: Netflix)" className="input" />
        <button className="btn-secondary">Tìm</button>
      </form>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <p className="text-xs text-gray-500">
        Tạo sản phẩm loại API trên web, chọn nhà cung cấp này và điền cột SKU vào ô &quot;SKU bên nguồn&quot;.
      </p>
      <table className="table">
        <thead><tr><th>SKU</th><th>Tên</th><th>Giá vốn</th><th>Tồn</th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.sku}><td className="font-mono">{p.sku}</td><td>{p.name}</td><td>{formatVnd(p.price)}</td><td>{p.stock ?? '∞'}</td></tr>
          ))}
        </tbody>
      </table>
      {!error && products.length === 0 && <p className="text-sm text-gray-500">Không có sản phẩm.</p>}
    </div>
  );
}
