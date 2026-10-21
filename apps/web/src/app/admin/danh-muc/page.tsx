import { Plus } from "lucide-react";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeading, EmptyState } from "@/components/ui";
import { core } from "@/lib/core";
import { createCategoryAction } from "../actions";

export default async function AdminCategories({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const categories = await core.listCategories();
  return (
    <>
      <PageHeading
        eyebrow="QUẢN TRỊ / PHÂN LOẠI"
        title="Danh mục"
        description="Nhóm sản phẩm và thứ tự hiển thị trong cửa hàng."
      />
      <Flash searchParams={await searchParams} />
      <form action={createCategoryAction} className="admin-form mb-6">
        <label className="field">
          Tên danh mục
          <input
            name="name"
            required
            className="input"
            placeholder="Ví dụ: Email"
          />
        </label>
        <label className="field">
          Slug
          <input
            name="slug"
            className="input"
            placeholder="Tự tạo nếu để trống"
          />
        </label>
        <label className="field">
          Thứ tự hiển thị
          <input
            name="sortOrder"
            type="number"
            defaultValue={0}
            className="input"
          />
        </label>
        <div className="flex items-end">
          <SubmitButton>
            <Plus size={16} />
            Thêm danh mục
          </SubmitButton>
        </div>
      </form>
      <div className="table-surface">
        <div className="scroll-table">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên danh mục</th>
                <th>Slug</th>
                <th>Thứ tự</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="text-muted">#{c.id}</td>
                  <td className="font-semibold">{c.name}</td>
                  <td className="font-mono text-xs">{c.slug}</td>
                  <td>{c.sortOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {categories.length === 0 && <EmptyState title="Chưa có danh mục" />}
      </div>
    </>
  );
}
