import Link from "next/link";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  PackageOpen,
} from "lucide-react";
import { core } from "@/lib/core";
import { getCurrentUser } from "@/lib/session";
import { formatVnd, TIER_LABEL } from "@/lib/format";
import { PageHeading, EmptyState } from "./ui";
import { ProductRow } from "./ProductRow";
import { ProductThumbnail } from "./ProductCover";

export async function Catalog({
  categorySlug,
  q = "",
  sort = "newest",
  available = false,
}: {
  categorySlug?: string;
  q?: string;
  sort?: string;
  available?: boolean;
}) {
  const [user, categories, all, suppliers] = await Promise.all([
    getCurrentUser(),
    core.listCategories(),
    core.listProducts({ includeSupplierStock: true }),
    core.listSuppliers(),
  ]);
  const category = categories.find((c) => c.slug === categorySlug);
  const tier = user?.tier ?? "MEMBER";
  const needle = core.slugify(q);
  const products = all.filter(
    (p) =>
      (!category || p.categoryId === category.id) &&
      (!needle ||
        core.slugify(p.name + " " + p.description).includes(needle)) &&
      (!available || (p.stock !== null && p.stock > 0)),
  );
  if (sort === "price-asc" || sort === "price-desc")
    products.sort(
      (a, b) =>
        (core.priceForTier(a, tier) - core.priceForTier(b, tier)) *
        (sort === "price-asc" ? 1 : -1),
    );
  const featured = all
    .filter((p) => p.stock !== 0 && !p.name.startsWith("[Test]"))
    .slice(0, 3);
  const counts = new Map(
    categories.map((c) => [
      c.id,
      all.filter((p) => p.categoryId === c.id).length,
    ]),
  );
  return (
    <>
      <PageHeading
        eyebrow="CONGCURE / CỬA HÀNG"
        title={category?.name ?? "Kho tài khoản số"}
        description={
          category
            ? "Chọn tài khoản phù hợp với công việc của bạn."
            : "Tài khoản bạn cần. Sẵn sàng cho công việc."
        }
      >
        <span className="heading-stat">
          <strong>{all.length}</strong> sản phẩm
          <span className="divider-dot" />
          <strong>{categories.length}</strong> danh mục
        </span>
      </PageHeading>
      {!category && !q && featured.length > 0 && (
        <section className="featured-grid" aria-label="Sản phẩm nổi bật">
          {featured.map((p, i) => (
            <Link
              key={p.id}
              href={"/san-pham/" + p.slug}
              className={"featured-product featured-" + i}
            >
              <div className="featured-top">
                <ProductThumbnail product={p} size={42} />
                <ArrowUpRight size={18} />
              </div>
              <div>
                <span className="eyebrow">
                  {categories.find((c) => c.id === p.categoryId)?.name}
                </span>
                <h2>{p.name}</h2>
              </div>
              <div className="featured-bottom">
                <strong>{formatVnd(core.priceForTier(p, tier))}</strong>
                <span>Giao tự động</span>
              </div>
            </Link>
          ))}
        </section>
      )}
      <div className="catalog-heading">
        <div>
          <h2>
            {category ? "Sản phẩm trong danh mục" : "Tất cả sản phẩm"}
            <span className="count-label">{products.length}</span>
          </h2>
        </div>
        <span className="price-tier">Giá {TIER_LABEL[tier].toLowerCase()}</span>
      </div>
      <nav className="category-tabs" aria-label="Lọc theo danh mục">
        <Link href="/#catalog" className={!category ? "active" : ""}>
          Tất cả<span>{all.length}</span>
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={"/danh-muc/" + c.slug}
            className={c.id === category?.id ? "active" : ""}
          >
            {c.name}
            <span>{counts.get(c.id)}</span>
          </Link>
        ))}
      </nav>
      <section id="catalog" className="catalog-surface">
        <form className="catalog-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Tìm tên sản phẩm…"
              aria-label="Tìm sản phẩm"
            />
            <button
              type="submit"
              className="search-submit"
              title="Tìm kiếm"
              aria-label="Tìm kiếm"
            >
              <ArrowUpRight size={17} />
            </button>
          </label>
          <div className="catalog-filters">
            <label className="check-label">
              <input
                name="available"
                type="checkbox"
                value="1"
                defaultChecked={available}
              />
              Còn hàng
            </label>
            <label className="sort-field">
              <SlidersHorizontal size={15} />
              <select
                name="sort"
                defaultValue={sort}
                aria-label="Sắp xếp sản phẩm"
              >
                <option value="newest">Mới nhất</option>
                <option value="price-asc">Giá tăng dần</option>
                <option value="price-desc">Giá giảm dần</option>
              </select>
            </label>
            <button className="btn-secondary btn-sm">Lọc</button>
          </div>
        </form>
        <div className="product-table-head">
          <span>Sản phẩm</span>
          <span>Tồn kho</span>
          <span>Đơn giá</span>
          <span />
        </div>
        {products.map((p) => (
          <ProductRow
            key={p.id}
            product={p}
            tier={tier}
            balance={user?.balance ?? null}
            maxQuantity={
              suppliers.find((s) => s.id === p.supplierId)?.adapter ===
              "shoptaikhoan"
                ? 50
                : 100
            }
          />
        ))}
        {products.length === 0 && (
          <EmptyState
            title="Chưa tìm thấy sản phẩm"
            description="Thử từ khóa khác hoặc xem tất cả danh mục."
            href="/"
            label="Xóa bộ lọc"
          />
        )}
        <div className="catalog-foot">
          <span>Hiển thị {products.length} sản phẩm</span>
          <span>
            <PackageOpen size={14} />
            Giá tính bằng VND
          </span>
        </div>
      </section>
      <div className="catalog-support">
        <div>
          <span className="support-mark">?</span>
          <div>
            <strong>Cần tìm một tài khoản cụ thể?</strong>
            <p>Liên hệ cửa hàng để được tư vấn.</p>
          </div>
        </div>
        <a href="https://t.me/congcure" target="_blank" rel="noreferrer">
          Trao đổi với chúng tôi
          <ArrowUpRight size={16} />
        </a>
      </div>
    </>
  );
}
