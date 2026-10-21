import type { ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import Link from "next/link";
import type { OrderStatus } from "@web12/core";
import { STATUS_LABEL } from "@/lib/format";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </header>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label = "Xem sản phẩm",
}: {
  title: string;
  description?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <Inbox size={30} strokeWidth={1.4} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {href && (
        <Link className="btn-secondary" href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function OrderBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={"status-badge " + status.toLowerCase()}>
      <span className="status-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
