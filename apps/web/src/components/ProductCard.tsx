import Link from 'next/link';
import type { Product, Tier } from '@web12/core';
import { core } from '@/lib/core';
import { formatVnd, TYPE_LABEL } from '@/lib/format';

export function ProductCard({ product, tier }: { product: Product; tier: Tier }) {
  const soldOut = product.stock === 0;
  return (
    <Link href={`/san-pham/${product.slug}`} className="card block hover:shadow">
      {product.images[0] && <img src={product.images[0]} alt="" className="mb-2 h-32 w-full rounded object-cover" />}
      <div className="text-xs text-gray-500">{TYPE_LABEL[product.type]}</div>
      <div className="font-medium">{product.name}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-semibold text-blue-700">{formatVnd(core.priceForTier(product, tier))}</span>
        <span className={`text-xs ${soldOut ? 'text-red-600' : 'text-gray-500'}`}>
          {product.stock === null ? 'Luôn có hàng' : soldOut ? 'Hết hàng' : `Còn ${product.stock}`}
        </span>
      </div>
    </Link>
  );
}
