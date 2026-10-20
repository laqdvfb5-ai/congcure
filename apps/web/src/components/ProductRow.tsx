import Link from 'next/link';
import type { Product, Tier } from '@web12/core';
import { core } from '@/lib/core';
import { formatVnd, TYPE_LABEL } from '@/lib/format';

/** First line of the description, used as the "định dạng" hint (mixmmo-style row). */
function summary(p: Product): string {
  return p.description.split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
}

export function ProductRow({ product, tier }: { product: Product; tier: Tier }) {
  const soldOut = product.stock === 0;
  const href = `/san-pham/${product.slug}`;
  return (
    <div className="grid gap-4 border-b border-line py-5 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0 space-y-2">
        <Link href={href} className="block text-lg font-medium leading-snug hover:text-accent">{product.name}</Link>
        {summary(product) && <p className="line-clamp-1 text-sm text-muted">» {summary(product)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">{TYPE_LABEL[product.type]}</span>
          <span className={`badge ${soldOut ? 'border-accent text-accent' : ''}`}>
            {product.stock === null ? 'Kho: luôn có' : soldOut ? 'Hết hàng' : `Kho hàng: ${product.stock.toLocaleString('vi-VN')}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 md:w-64 md:flex-col md:items-stretch">
        <div className="price flex-1 rounded-full border border-line px-4 py-2 text-center text-lg">
          {formatVnd(core.priceForTier(product, tier))}
        </div>
        {soldOut
          ? <span className="btn pointer-events-none flex-1 opacity-40">Hết hàng</span>
          : <Link href={href} className="btn flex-1">Mua ngay</Link>}
      </div>
    </div>
  );
}
