import { NextResponse } from "next/server";
import { getSessionUser, isSameOrigin } from "@/lib/server/session";
import { asUser } from "@/lib/server/db";

const SID = /^[0-9a-f-]{36}$/i;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

// この端末を auth_app.sessions に登録する(auth の「ログイン中の端末」に出すため)
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  if (typeof b?.id !== "string" || !SID.test(b.id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await asUser(
      user.id,
      (sql) => sql`insert into auth_app.sessions (id, user_id, app, browser, os, device, last_active)
        values (${b.id}, ${user.id}, 'legal_life', ${clip(b.browser, 100)}, ${clip(b.os, 100)}, ${clip(b.device, 100)}, now())
        on conflict (id) do update set browser = excluded.browser, os = excluded.os, device = excluded.device, last_active = now() where auth_app.sessions.user_id = ${user.id}`,
    );
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// 他端末の「ログアウトさせる」指示が出ているか
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sid = new URL(request.url).searchParams.get("sid") ?? "";
  if (!SID.test(sid)) return NextResponse.json({ should_logout: false });
  const rows = await asUser(user.id, (sql) => sql<{ should_logout: boolean }[]>`select should_logout from auth_app.sessions where id = ${sid} and user_id = ${user.id}`);
  return NextResponse.json({ should_logout: rows[0]?.should_logout === true }, { headers: { "Cache-Control": "private, no-store" } });
}
