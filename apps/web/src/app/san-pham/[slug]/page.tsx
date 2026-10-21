import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShoppingBag, ShieldCheck } from "lucide-react";
import { ProductCover } from "@/components/ProductCover";
import { ProductRow } from "@/components/ProductRow";
import { PurchaseForm } from "@/components/Purchase";
import { Flash } from "@/components/Flash";
import { core } from "@/lib/core";
import { formatVnd, formatStock, TIER_LABEL } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const product = await core.getProductBySlug(slug, {
    includeSupplierStock: true,
  });
  if (!product || !product.active) notFound();
  const [user, categories, related, suppliers] = await Promise.all([
    getCurrentUser(),
    core.listCategories(),
    core.listProducts({
      categoryId: product.categoryId,
      includeSupplierStock: true,
    }),
    core.listSuppliers(),
  ]);
  const category = categories.find((c) => c.id === product.categoryId);
  const tier = user?.tier ?? "MEMBER";
  const price = core.priceForTier(product, tier);
  const maxFor = (supplierId: number | null) =>
    suppliers.find((s) => s.id === supplierId)?.adapter === "shoptaikhoan"
      ? 50
      : 100;
  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <Link href="/">Kho tài khoản</Link>
        <ChevronRight size={13} />
        {category && (
          <>
            <Link href={"/danh-muc/" + category.slug}>{category.name}</Link>
            <ChevronRight size={13} />
          </>
        )}
        <span>{product.name}</span>
      </nav>
      <Flash searchParams={await searchParams} />
      <div className="product-detail">
        <section className="product-info">
          <ProductCover product={product} large />
          <p className="eyebrow mt-6">{category?.name}</p>
          <h1>{product.name}</h1>
          <p className="product-description">
            {product.description ||
              "Thông tin chi tiết đang được cửa hàng cập nhật."}
          </p>
          <dl className="product-specs">
            <div>
              <dt>Giao hàng</dt>
              <dd>Nhận tại trang đơn hàng sau thanh toán</dd>
            </div>
            <div>
              <dt>Tồn kho</dt>
              <dd>{formatStock(product.stock)}</dd>
            </div>
            {Object.entries(product.attributes).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <aside className="purchase-panel">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Giá {TIER_LABEL[tier]}</span>
            {product.stock !== null && (
              <span
                className={
                  "stock-badge " + (product.stock === 0 ? "empty" : "")
                }
              >
                <span className="status-dot" />
                {product.stock === 0
                  ? "Hết hàng"
                  : "Còn " + formatStock(product.stock)}
              </span>
            )}
          </div>
          <div className="price-large">
            {formatVnd(price)} <small>/ tài khoản</small>
          </div>
          <div className="tier-grid">
            {core.TIERS.map((t) => (
              <div key={t} className={t === tier ? "current" : ""}>
                <small>{TIER_LABEL[t]}</small>
                <b>{formatVnd(core.priceForTier(product, t))}</b>
              </div>
            ))}
          </div>
          {product.stock === 0 ? (
            <div className="notice">
              Sản phẩm đang hết hàng. Vui lòng quay lại sau.
            </div>
          ) : user ? (
            <PurchaseForm
              product={{
                id: product.id,
                slug,
                name: product.name,
                price,
                stock: product.stock,
                maxQuantity:
                  product.type === "UNIQUE" ? 1 : maxFor(product.supplierId),
              }}
              balance={user.balance}
              requestId={randomUUID()}
            />
          ) : (
            <Link href="/dang-nhap" className="btn w-full">
              <ShoppingBag size={17} />
              Đăng nhập để mua
            </Link>
          )}
          <div className="dialog-note">
            <ShieldCheck size={15} />
            <Link href="/chinh-sach">Chính sách giao hàng & hoàn tiền</Link>
          </div>
        </aside>
      </div>
      {related.some((p) => p.id !== product.id) && (
        <section className="section-block">
          <h2>Cùng danh mục</h2>
          <div className="catalog-surface">
            {related
              .filter((p) => p.id !== product.id)
              .slice(0, 4)
              .map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  tier={tier}
                  balance={user?.balance ?? null}
                  maxQuantity={maxFor(p.supplierId)}
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}
