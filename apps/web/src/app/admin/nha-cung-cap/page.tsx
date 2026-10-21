import Link from "next/link";
import { ArrowUpRight, Plus, Save } from "lucide-react";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeading } from "@/components/ui";
import { core } from "@/lib/core";
import { saveSupplierAction } from "../actions";

export default async function AdminSuppliers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const suppliers = await core.listSuppliers();
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / NGUỒN HÀNG"
        title="Nhà cung cấp"
        description="Kết nối nguồn hàng và quản lý thông tin API."
      />
      <Flash searchParams={await searchParams} />
      {suppliers.map((s) => (
        <form key={s.id} action={saveSupplierAction} className="supplier-form">
          <input type="hidden" name="id" value={s.id} />
          <div className="form-full flex items-center justify-between gap-3">
            <h2 className="text-base">
              {s.name}{" "}
              <small className="text-xs text-muted font-normal">
                / {s.adapter}
              </small>
            </h2>
            <Link
              href={"/admin/nha-cung-cap/" + s.id + "/san-pham"}
              className="btn-secondary btn-sm"
            >
              Sản phẩm nguồn
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <label className="field">
            Tên
            <input
              name="name"
              required
              defaultValue={s.name}
              className="input"
            />
          </label>
          <label className="field">
            Base URL
            <input
              name="baseUrl"
              type="url"
              required
              defaultValue={s.baseUrl}
              className="input"
            />
          </label>
          <label className="field">
            API key mới
            <input
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder="Trống để giữ nguyên"
              className="input"
            />
          </label>
          <div className="form-full flex justify-between items-center">
            <label className="check-label">
              <input type="checkbox" name="active" defaultChecked={s.active} />
              Cho phép sử dụng nguồn
            </label>
            <SubmitButton className="btn-secondary btn-sm">
              <Save size={15} />
              Lưu thay đổi
            </SubmitButton>
          </div>
        </form>
      ))}
      <section className="section-block">
        <h2>Thêm nhà cung cấp</h2>
        <form action={saveSupplierAction} className="admin-form">
          <label className="field">
            Tên nhà cung cấp
            <input name="name" required className="input" />
          </label>
          <label className="field">
            Adapter
            <select name="adapter" className="input">
              {core.SUPPLIER_ADAPTERS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Base URL
            <input
              name="baseUrl"
              type="url"
              placeholder="Trống = URL mặc định của adapter"
              className="input"
            />
          </label>
          <label className="field">
            API key
            <input
              name="apiKey"
              type="password"
              autoComplete="off"
              required
              className="input"
            />
          </label>
          <div className="form-full">
            <SubmitButton>
              <Plus size={16} />
              Thêm nhà cung cấp
            </SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
