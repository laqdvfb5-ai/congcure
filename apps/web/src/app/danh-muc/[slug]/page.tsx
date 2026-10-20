import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await core.getCategoryBySlug(slug);
  if (!category) notFound();
  const [user, products] = await Promise.all([getCurrentUser(), core.listProducts({ categoryId: category.id })]);
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{category.name}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} tier={user?.tier ?? 'MEMBER'} />)}
      </div>
      {products.length === 0 && <p className="text-gray-500">Danh mục chưa có sản phẩm.</p>}
    </div>
  );
}
