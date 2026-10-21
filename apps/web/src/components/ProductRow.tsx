import Link from "next/link";
import type { Product, Tier } from "@web12/core";
import { ProductThumbnail } from "./ProductCover";
import { BuyButton } from "./Purchase";
import { formatVnd, formatStock } from "@/lib/format";
import { core } from "@/lib/core";

export function ProductRow({
  product,
  tier,
  balance = null,
  maxQuantity = 100,
}: {
  product: Product;
  tier: Tier;
  balance?: number | null;
  maxQuantity?: number;
}) {
  const price = core.priceForTier(product, tier);
  return (
    <div className={"product-row" + (product.stock === 0 ? " sold-out" : "")}>
      <div className="product-identity">
        <ProductThumbnail product={product} />
        <div>
          <Link href={"/san-pham/" + product.slug} className="product-name">
            {product.name}
          </Link>
          <p>{product.description.split(/\r?\n/)[0]}</p>
        </div>
      </div>
      <div className="product-stock">
        <span
          className={
            "stock-badge " +
            (product.stock === null || product.stock === 0 ? "empty" : "")
          }
          aria-label={"Tồn kho: " + formatStock(product.stock)}
        >
          <span className="status-dot" />
          {formatStock(product.stock)}
        </span>
      </div>
      <div className="product-price">
        {formatVnd(price)}
        <small>/ tài khoản</small>
      </div>
      <div className="product-action">
        <BuyButton
          product={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            price,
            stock: product.stock,
            maxQuantity: product.type === "UNIQUE" ? 1 : maxQuantity,
          }}
          balance={balance}
        />
      </div>
    </div>
  );
}
