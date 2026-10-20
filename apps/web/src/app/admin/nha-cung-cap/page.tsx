import Link from 'next/link';
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { saveSupplierAction } from '../actions';

export default async function AdminSuppliers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const suppliers = await core.listSuppliers();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Nhà cung cấp (API nguồn)</h1>
      <Flash searchParams={await searchParams} />
      {suppliers.map((s) => (
        <form key={s.id} action={saveSupplierAction} className="grid items-end gap-2 border-b pb-3 md:grid-cols-5">
          <input type="hidden" name="id" value={s.id} />
          <label className="text-sm">Tên <span className="text-xs text-muted">({s.adapter})</span><input name="name" defaultValue={s.name} className="input" /></label>
          <label className="text-sm md:col-span-2">Base URL<input name="baseUrl" defaultValue={s.baseUrl} className="input" /></label>
          <label className="text-sm">API key mới<input name="apiKey" placeholder="để trống = giữ nguyên" className="input" /></label>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={s.active} /> Bật</label>
            <button className="btn-secondary">Lưu</button>
            <Link href={`/admin/nha-cung-cap/${s.id}/san-pham`} className="link">Xem sản phẩm nguồn</Link>
          </div>
        </form>
      ))}
      <h2 className="font-semibold">Thêm nhà cung cấp</h2>
      <form action={saveSupplierAction} className="grid items-end gap-2 md:grid-cols-5">
        <label className="text-sm">Tên<input name="name" required className="input" /></label>
        <label className="text-sm">Adapter
          <select name="adapter" className="input">
            {core.SUPPLIER_ADAPTERS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-sm">Base URL<input name="baseUrl" placeholder="trống = mặc định của adapter" className="input" /></label>
        <label className="text-sm">API key<input name="apiKey" required className="input" /></label>
        <button className="btn">Thêm</button>
      </form>
      <p className="text-xs text-muted">
        shoptaikhoan: Seller API của shoptaikhoan.store (lấy key ở website, mục Quản lý API key); SKU sản phẩm = ID sản phẩm bên nguồn.
        generic-rest: POST /api/orders, GET /api/products, header X-API-Key.
      </p>
    </div>
  );
}
