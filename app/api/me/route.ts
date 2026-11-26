import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/server/session";
import { asUser } from "@/lib/server/db";

// ログイン中の利用者と、legal-life 側のプロフィール(写真・権限)。未ログインは 401
export async function GET(request: Request) {
  const { user, linked } = await getSessionState(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // ログイン済みでも、連携を許可するまでは、利用者として扱わない(画面は、auth の同意画面へ案内する)
  if (!linked) return NextResponse.json({ error: "link_required" }, { status: 403 });
  const [profile] = await asUser(user.id, (sql) => sql<{ photo_url: string | null; role: string }[]>`select photo_url, role from legal_life.profiles where id = ${user.id}`);
  return NextResponse.json({ user, profile: profile ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
