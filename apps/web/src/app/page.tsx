import { Catalog } from "@/components/Catalog";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; available?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Catalog q={sp.q?.trim()} sort={sp.sort} available={sp.available === "1"} />
  );
}
