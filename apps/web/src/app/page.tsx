import Link from 'next/link';
import type { Product } from '@web12/core';
import { ProductRow } from '@/components/ProductRow';
import { core } from '@/lib/core';
import { getCurrentUser } from '@/lib/session';
import { site } from '@/lib/site';

const PER_CATEGORY = 5;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? '';
  const [user, categories, allProducts, stats] = await Promise.all([
    getCurrentUser(), core.listCategories(), core.listProducts(), core.getShopStats(),
  ]);
  const tier = user?.tier ?? 'MEMBER';
  // Accent-insensitive name match ("tai khoan" finds "Tài khoản").
  const needle = core.slugify(q);
  const products = needle ? allProducts.filter((p) => core.slugify(p.name).includes(needle)) : allProducts;

  const byCategory = new Map<number, Product[]>();
  for (const p of products) byCategory.set(p.categoryId, [...(byCategory.get(p.categoryId) ?? []), p]);
  const sections = categories.filter((c) => byCategory.has(c.id));

  return (
    <div className="space-y-12">
      {!q && (
        <section className="border-b border-fg pb-10">
          <div className="eyebrow mb-4">Est. 2026 · Giao tự động</div>
          <h1 className="display text-[18vw] md:text-[11rem]">{site.logo}<sup className="align-top text-[0.25em]">®</sup></h1>
          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <p className="max-w-xl text-xl leading-snug md:text-2xl">{site.tagline}. Nạp ví một lần, mua là nhận tài khoản ngay.</p>
            <dl className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line">
              {[
                [stats.products.toLocaleString('vi-VN'), 'Sản phẩm'],
                [stats.ordersCompleted.toLocaleString('vi-VN'), 'Đơn đã giao'],
                ['24/7', 'Tự động'],
              ].map(([n, label]) => (
                <div key={label} className="px-5 py-3">
                  <dt className="eyebrow">{label}</dt>
                  <dd className="font-mono text-2xl">{n}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <nav id="san-pham" className="flex scroll-mt-6 flex-wrap gap-2">
        <Link href="/#san-pham" className="pill pill-active">Tất cả sản phẩm</Link>
        {categories.map((c) => <Link key={c.id} href={`/danh-muc/${c.slug}`} className="pill">{c.name}</Link>)}
      </nav>

      {q && (
        <div className="flex items-baseline justify-between border-b border-fg pb-3">
          <h1 className="display text-4xl md:text-6xl">Tìm: “{q}”</h1>
          <Link href="/" className="eyebrow hover:text-fg">Xóa tìm kiếm ×</Link>
        </div>
      )}

      {sections.map((c) => {
        const items = byCategory.get(c.id)!;
        return (
          <section key={c.id}>
            <div className="flex items-end justify-between border-b-2 border-fg pb-2">
              <h2 className="display text-4xl md:text-6xl">{c.name}</h2>
              <span className="eyebrow">{items.length} sản phẩm</span>
            </div>
            {items.slice(0, q ? undefined : PER_CATEGORY).map((p) => <ProductRow key={p.id} product={p} tier={tier} />)}
            {!q && items.length > PER_CATEGORY && (
              <div className="pt-5 text-center">
                <Link href={`/danh-muc/${c.slug}`} className="btn-secondary">Xem thêm</Link>
              </div>
            )}
          </section>
        );
      })}

      {products.length === 0 && (
        <p className="py-16 text-center text-muted">{q ? 'Không tìm thấy sản phẩm phù hợp.' : 'Chưa có sản phẩm.'}</p>
      )}
    </div>
  );
}
