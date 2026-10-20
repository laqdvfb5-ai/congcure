import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';

export default async function Home() {
  const [user, categories, products] = await Promise.all([getCurrentUser(), core.listCategories(), core.listProducts()]);
  const tier = user?.tier ?? 'MEMBER';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link key={c.id} href={`/danh-muc/${c.slug}`} className="btn-secondary text-sm">{c.name}</Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} tier={tier} />)}
      </div>
      {products.length === 0 && <p className="text-gray-500">Chưa có sản phẩm.</p>}
    </div>
  );
}
