import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return Response.json(
    { balance: user.balance },
    { headers: { "Cache-Control": "no-store" } },
  );
}
