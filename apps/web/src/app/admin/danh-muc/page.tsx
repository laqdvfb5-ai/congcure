import { Flash } from '@/components/Flash';
import { core } from '@/lib/core';
import { createCategoryAction } from '../actions';

export default async function AdminCategories({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const categories = await core.listCategories();
  return (
    <div className="card space-y-4">
      <h1 className="text-xl font-semibold">Danh mục</h1>
      <Flash searchParams={await searchParams} />
      <form action={createCategoryAction} className="flex gap-2">
        <input name="name" placeholder="Tên danh mục" required className="input" />
        <input name="slug" placeholder="slug (tự tạo nếu trống)" className="input" />
        <input name="sortOrder" placeholder="Thứ tự" className="input w-24" />
        <button className="btn whitespace-nowrap">Thêm</button>
      </form>
      <table className="table">
        <thead><tr><th>#</th><th>Tên</th><th>Slug</th><th>Thứ tự</th></tr></thead>
        <tbody>{categories.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.name}</td><td>{c.slug}</td><td>{c.sortOrder}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
