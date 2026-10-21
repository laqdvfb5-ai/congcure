import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { PageHeading, EmptyState } from "@/components/ui";
import { ProductThumbnail } from "@/components/ProductCover";
import { core } from "@/lib/core";
import { formatVnd, formatStock, TYPE_LABEL } from "@/lib/format";

export default async function AdminProducts() {
  const products = await core.listProducts({
    activeOnly: false,
    includeSupplierStock: true,
  });
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / DANH MỤC HÀNG"
        title="Sản phẩm"
        description={products.length + " sản phẩm trong cửa hàng"}
      >
        <Link href="/admin/san-pham/moi" className="btn">
          <Plus size={16} />
          Thêm sản phẩm
        </Link>
      </PageHeading>
      <div className="table-surface">
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Loại</th>
                <th>Thành viên</th>
                <th>CTV</th>
                <th>Đại lý</th>
                <th>Tồn kho</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex gap-3 items-center">
                      <ProductThumbnail product={p} size={32} />
                      <div>
                        <Link href={"/admin/san-pham/" + p.id}>{p.name}</Link>
                        <div className="text-xs text-muted">#{p.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{TYPE_LABEL[p.type]}</td>
                  <td className="nowrap">{formatVnd(p.priceMember)}</td>
                  <td className="nowrap">{formatVnd(p.priceCtv)}</td>
                  <td className="nowrap">{formatVnd(p.priceAgent)}</td>
                  <td>{formatStock(p.stock)}</td>
                  <td>
                    <span
                      className={"stock-badge " + (p.active ? "" : "empty")}
                    >
                      {p.active ? "Đang bán" : "Đã ẩn"}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={"/admin/san-pham/" + p.id}
                      className="icon-btn"
                      title="Sửa sản phẩm"
                      aria-label={"Sửa " + p.name}
                    >
                      <Pencil size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 && (
          <EmptyState
            title="Chưa có sản phẩm"
            href="/admin/san-pham/moi"
            label="Thêm sản phẩm"
          />
        )}
      </div>
    </>
  );
}
