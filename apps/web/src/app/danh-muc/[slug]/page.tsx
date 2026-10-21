import { notFound } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { core } from "@/lib/core";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; available?: string }>;
}) {
  const { slug } = await params;
  if (!(await core.getCategoryBySlug(slug))) notFound();
  const sp = await searchParams;
  return (
    <Catalog
      categorySlug={slug}
      q={sp.q?.trim()}
      sort={sp.sort}
      available={sp.available === "1"}
    />
  );
}
