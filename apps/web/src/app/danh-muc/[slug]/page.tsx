import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductRow } from '@/components/ProductRow';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await core.getCategoryBySlug(slug);
  if (!category) notFound();
  const [user, categories, products] = await Promise.all([
    getCurrentUser(), core.listCategories(), core.listProducts({ categoryId: category.id }),
  ]);
  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-2">
        <Link href="/#san-pham" className="pill">Tất cả sản phẩm</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/danh-muc/${c.slug}`} className={`pill ${c.id === category.id ? 'pill-active' : ''}`}>{c.name}</Link>
        ))}
      </nav>
      <section>
        <div className="flex items-end justify-between border-b-2 border-fg pb-2">
          <h1 className="display text-5xl md:text-7xl">{category.name}</h1>
          <span className="eyebrow">{products.length} sản phẩm</span>
        </div>
        {products.map((p) => <ProductRow key={p.id} product={p} tier={user?.tier ?? 'MEMBER'} />)}
        {products.length === 0 && <p className="py-16 text-center text-muted">Danh mục chưa có sản phẩm.</p>}
      </section>
    </div>
  );
}
