import { CircleAlert, CircleCheck } from "lucide-react";

export function Flash({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const error =
    typeof searchParams.error === "string" ? searchParams.error : null;
  const ok = typeof searchParams.ok === "string" ? searchParams.ok : null;
  if (!error && !ok) return null;
  return (
    <div
      className={"notice " + (error ? "notice-error" : "notice-success")}
      role={error ? "alert" : "status"}
    >
      {error ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
      <span>{error ?? ok}</span>
    </div>
  );
}
