import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import type { SupplierProduct } from "@web12/core";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { formatVnd } from "@/lib/format";

export default async function SupplierProducts({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const supplier = await core.getSupplier(Number((await params).id));
  if (!supplier) notFound();
  const q = (await searchParams).q?.trim() ?? "";
  let products: SupplierProduct[] = [];
  let error: string | null = null;
  try {
    products = await (
      await core.getAdapterForSupplier(supplier.id)
    ).listProducts({ q: q || undefined });
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Không lấy được danh sách sản phẩm";
  }
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / SẢN PHẨM NGUỒN"
        title={supplier.name}
        description="Dùng mã SKU khi tạo sản phẩm API trong cửa hàng."
      >
        <Link href="/admin/nha-cung-cap" className="btn-secondary">
          <ArrowLeft size={15} />
          Nhà cung cấp
        </Link>
      </PageHeading>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="table-surface">
        <form className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Tìm sản phẩm nguồn…"
              aria-label="Tìm sản phẩm nguồn"
            />
          </label>
          <button className="btn-secondary btn-sm">Tìm kiếm</button>
        </form>
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Tên sản phẩm</th>
                <th>Giá vốn</th>
                <th>Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{p.name}</td>
                  <td className="nowrap">{formatVnd(p.price)}</td>
                  <td>{p.stock ?? "Chưa xác định"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!error && products.length === 0 && (
          <EmptyState title="Không có sản phẩm phù hợp" />
        )}
      </div>
    </>
  );
}
