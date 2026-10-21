import type { ReactNode } from "react";
import { AdminNav } from "@/components/AdminNav";
import { requireStaff } from "@/lib/session";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireStaff();
  return (
    <>
      <AdminNav />
      <div className="admin-content">{children}</div>
    </>
  );
}
