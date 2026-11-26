import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/server/session";

// ログイン中の利用者と、legal-life 側のプロフィール(写真・権限)。未ログインは 401
export async function GET(request: Request) {
  const { user, linked } = await getSessionState(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // ログイン済みでも、連携を許可するまでは、利用者として扱わない(画面は、auth の同意画面へ案内する)
  if (!linked) return NextResponse.json({ error: "link_required" }, { status: 403 });
  // 返すのは識別番号だけ(個人情報の最小化)。プロフィール(写真・権限)は、画面で使っていないため返さない
  return NextResponse.json({ user: { id: user.id }, profile: null }, { headers: { "Cache-Control": "private, no-store" } });
}
