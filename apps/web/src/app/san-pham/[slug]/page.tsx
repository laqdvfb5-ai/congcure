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
  const user = await getCurrentUser();
  const tier = user?.tier ?? 'MEMBER';
  const price = core.priceForTier(product, tier);
  const maxQty = product.type === 'UNIQUE' ? 1 : Math.min(100, product.stock ?? 100);
  const soldOut = product.stock === 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        {product.images.map((src) => <img key={src} src={src} alt="" className="w-full rounded" />)}
      </div>
      <div className="card space-y-3">
        <div className="text-xs text-gray-500">{TYPE_LABEL[product.type]}</div>
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <div className="text-2xl font-semibold text-blue-700">
          {formatVnd(price)} <span className="text-sm font-normal text-gray-500">giá {TIER_LABEL[tier]}</span>
        </div>
        {Object.keys(product.attributes).length > 0 && (
          <dl className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(product.attributes).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        <p className="whitespace-pre-line text-sm">{product.description}</p>
        <Flash searchParams={await searchParams} />
        {!user ? (
          <Link href="/dang-nhap" className="btn">Đăng nhập để mua</Link>
        ) : soldOut ? (
          <p className="font-medium text-red-600">Hết hàng</p>
        ) : (
          <form action={buyAction} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="slug" value={product.slug} />
            <input type="hidden" name="requestId" value={randomUUID()} />
            <input name="quantity" type="number" min={1} max={maxQty} defaultValue={1}
              readOnly={product.type === 'UNIQUE'} className="input w-24" />
            <button className="btn">Mua ngay</button>
          </form>
        )}
      </div>
    </div>
  );
}
