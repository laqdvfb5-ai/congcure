import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { formatVnd, TIER_LABEL, TYPE_LABEL } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { buyAction } from './actions';

export default async function ProductPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const product = await core.getProductBySlug(slug);
  if (!product || !product.active) notFound();
  const [user, categories] = await Promise.all([getCurrentUser(), core.listCategories()]);
  const category = categories.find((c) => c.id === product.categoryId);
  const tier = user?.tier ?? 'MEMBER';
  const price = core.priceForTier(product, tier);
  const maxQty = product.type === 'UNIQUE' ? 1 : Math.min(100, product.stock ?? 100);
  const soldOut = product.stock === 0;
  const attributes = Object.entries(product.attributes);

  return (
    <div className="space-y-8">
      <div className="eyebrow">
        <Link href="/" className="hover:text-fg">Trang chủ</Link> /{' '}
        {category && <Link href={`/danh-muc/${category.slug}`} className="hover:text-fg">{category.name}</Link>}
      </div>

      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <h1 className="display text-5xl md:text-7xl">{product.name}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="badge">{TYPE_LABEL[product.type]}</span>
            <span className={`badge ${soldOut ? 'border-accent text-accent' : ''}`}>
              {product.stock === null ? 'Kho: luôn có' : soldOut ? 'Hết hàng' : `Kho hàng: ${product.stock.toLocaleString('vi-VN')}`}
            </span>
          </div>
          {product.images.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {product.images.map((src) => <img key={src} src={src} alt="" className="w-full rounded-2xl border border-line" />)}
            </div>
          )}
          {product.description && (
            <div>
              <div className="eyebrow mb-2">Mô tả</div>
              <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
            </div>
          )}
          {attributes.length > 0 && (
            <dl className="divide-y divide-line border-y border-line">
              {attributes.map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 text-sm">
                  <dt className="text-muted">{k}</dt><dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <aside className="h-fit space-y-5 rounded-2xl border border-fg p-6 md:sticky md:top-6">
          <div>
            <div className="eyebrow">Giá {TIER_LABEL[tier]}</div>
            <div className="price text-5xl">{formatVnd(price)}</div>
          </div>
          <Flash searchParams={await searchParams} />
          {!user ? (
            <Link href="/dang-nhap" className="btn w-full">Đăng nhập để mua</Link>
          ) : soldOut ? (
            <span className="btn pointer-events-none w-full opacity-40">Hết hàng</span>
          ) : (
            <form action={buyAction} className="space-y-3">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="slug" value={product.slug} />
              <input type="hidden" name="requestId" value={randomUUID()} />
              <label className="block">
                <span className="eyebrow">Số lượng</span>
                <input name="quantity" type="number" min={1} max={maxQty} defaultValue={1}
                  readOnly={product.type === 'UNIQUE'} className="input mt-1 font-mono" />
              </label>
              <button className="btn w-full">Mua ngay</button>
              <p className="text-xs text-muted">
                Số dư: <span className="font-mono">{formatVnd(user.balance)}</span> ·{' '}
                <Link href="/nap-tien" className="link">Nạp thêm</Link>
              </p>
            </form>
          )}
          <ul className="space-y-1 border-t border-line pt-4 text-xs text-muted">
            <li>✓ Giao tài khoản ngay sau khi thanh toán</li>
            <li>✓ Xem lại tài khoản bất kỳ lúc nào trong Lịch sử</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
