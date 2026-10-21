import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Flash } from "@/components/Flash";
import { PageHeading } from "@/components/ui";
import { core } from "@/lib/core";
import { ProductForm } from "../ProductForm";

export default async function NewProduct({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [categories, suppliers] = await Promise.all([
    core.listCategories(),
    core.listSuppliers(),
  ]);
  return (
    <>
      <PageHeading eyebrow="QUẢN TRỊ / SẢN PHẨM" title="Thêm sản phẩm">
        <Link href="/admin/san-pham" className="btn-secondary">
          <ArrowLeft size={15} />
          Danh sách
        </Link>
      </PageHeading>
      <Flash searchParams={await searchParams} />
      {categories.length === 0 ? (
        <div className="notice notice-warning">
          <Link href="/admin/danh-muc" className="link">
            Tạo danh mục trước khi thêm sản phẩm.
          </Link>
        </div>
      ) : (
        <ProductForm categories={categories} suppliers={suppliers} />
      )}
    </>
  );
}
