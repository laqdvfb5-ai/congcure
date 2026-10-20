import type { Category, Product, Supplier } from '@web12/core';
import { saveProductAction } from '../actions';

export function ProductForm({ product, categories, suppliers }: { product?: Product; categories: Category[]; suppliers: Supplier[] }) {
  const p = product;
  return (
    <form action={saveProductAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={p?.id ?? ''} />
      <label className="text-sm">Tên<input name="name" defaultValue={p?.name} required className="input" /></label>
      <label className="text-sm">Slug<input name="slug" defaultValue={p?.slug} placeholder="tự tạo nếu trống" className="input" /></label>
      <label className="text-sm">Danh mục
        <select name="categoryId" defaultValue={p?.categoryId} className="input">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Loại
        <select name="type" defaultValue={p?.type ?? 'STOCK'} className="input">
          <option value="STOCK">Kho (STOCK)</option>
          <option value="UNIQUE">Hàng riêng (UNIQUE)</option>
          <option value="API">Nguồn API</option>
        </select>
      </label>
      <label className="text-sm">Giá Thành viên<input name="priceMember" defaultValue={p?.priceMember} required className="input" /></label>
      <label className="text-sm">Giá CTV<input name="priceCtv" defaultValue={p?.priceCtv} required className="input" /></label>
      <label className="text-sm">Giá Đại lý<input name="priceAgent" defaultValue={p?.priceAgent} required className="input" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Đang bán</label>
      <label className="text-sm">Nhà cung cấp (chỉ cho loại API)
        <select name="supplierId" defaultValue={p?.supplierId ?? ''} className="input">
          <option value="">-</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="text-sm">SKU bên nguồn<input name="supplierSku" defaultValue={p?.supplierSku ?? ''} className="input" /></label>
      <label className="text-sm md:col-span-2">Mô tả<textarea name="description" defaultValue={p?.description} rows={4} className="input" /></label>
      <label className="text-sm">Ảnh (mỗi dòng 1 URL)<textarea name="images" defaultValue={p?.images.join('\n')} rows={3} className="input" /></label>
      <label className="text-sm">Thuộc tính (mỗi dòng "tên: giá trị")
        <textarea name="attributes" rows={3} className="input"
          defaultValue={p ? Object.entries(p.attributes).map(([k, v]) => `${k}: ${v}`).join('\n') : ''} />
      </label>
      <div className="md:col-span-2"><button className="btn">Lưu</button></div>
    </form>
  );
}
