import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { ProductForm } from '../ProductForm';

export default async function NewProduct({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [categories, suppliers] = await Promise.all([core.listCategories(), core.listSuppliers()]);
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Thêm sản phẩm</h1>
      <Flash searchParams={await searchParams} />
      {categories.length === 0
        ? <p className="text-sm text-accent">Hãy tạo danh mục trước.</p>
        : <ProductForm categories={categories} suppliers={suppliers} />}
    </div>
  );
}
