import { notFound } from 'next/navigation';
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { addStockAction } from '../../actions';
import { ProductForm } from '../ProductForm';

export default async function EditProduct({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const product = await core.getProduct(Number((await params).id));
  if (!product) notFound();
  const [categories, suppliers] = await Promise.all([core.listCategories(), core.listSuppliers()]);
  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Sửa: {product.name}</h1>
        <Flash searchParams={await searchParams} />
        <ProductForm product={product} categories={categories} suppliers={suppliers} />
      </div>
      {product.type !== 'API' && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Nhập kho (đang còn {product.stock})</h2>
          <form action={addStockAction} className="space-y-2">
            <input type="hidden" name="productId" value={product.id} />
            <textarea name="lines" rows={8} className="input font-mono text-sm"
              placeholder={product.type === 'UNIQUE' ? 'Đúng 1 dòng: user|pass|...' : 'Mỗi dòng 1 tài khoản, ví dụ: email|matkhau|2fa'} />
            <button className="btn">Nhập kho</button>
          </form>
        </div>
      )}
    </div>
  );
}
