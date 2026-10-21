import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeading } from "@/components/ui";
import { core } from "@/lib/core";
import { addStockAction } from "../../actions";
import { ProductForm } from "../ProductForm";

export default async function EditProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const product = await core.getProduct(Number((await params).id));
  if (!product) notFound();
  const [categories, suppliers] = await Promise.all([
    core.listCategories(),
    core.listSuppliers(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow={"QUẢN TRỊ / SẢN PHẨM #" + product.id}
        title={product.name}
      >
        <Link href="/admin/san-pham" className="btn-secondary">
          <ArrowLeft size={15} />
          Danh sách
        </Link>
      </PageHeading>
      <Flash searchParams={await searchParams} />
      <ProductForm
        product={product}
        categories={categories}
        suppliers={suppliers}
      />
      {product.type !== "API" && (
        <section className="section-block">
          <h2>
            Nhập kho{" "}
            <span className="text-muted text-sm">/ {product.stock} có sẵn</span>
          </h2>
          <form action={addStockAction} className="card form-stack">
            <input type="hidden" name="productId" value={product.id} />
            <label className="field">
              Danh sách tài khoản
              <textarea
                name="lines"
                rows={7}
                required
                className="input font-mono text-xs"
                placeholder={
                  product.type === "UNIQUE"
                    ? "Một dòng: user|pass|..."
                    : "Mỗi dòng một tài khoản: email|matkhau|2fa"
                }
              />
            </label>
            <div>
              <SubmitButton>
                <Upload size={16} />
                Nhập tài khoản
              </SubmitButton>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
