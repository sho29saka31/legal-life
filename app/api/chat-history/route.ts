import { NextResponse } from "next/server";
import { getSessionUser, isSameOrigin } from "@/lib/server/session";
import { asUser } from "@/lib/server/db";

const MAX_ITEMS = 200;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await asUser(user.id, (sql) => sql`select id, question, answer, category from legal_life.chat_history where user_id = ${user.id} order by created_at asc`);
  return NextResponse.json(rows, { headers: { "Cache-Control": "private, no-store" } });
}

// 追加(items: 複数件。未ログイン時にブラウザへ貯めた履歴の移行にも使う)
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const items = Array.isArray(b?.items) ? b.items.slice(0, MAX_ITEMS) : [];
  const rows = items
    .map((i: Record<string, unknown>) => ({ question: clip(i.question, 2000), answer: clip(i.answer, 20000), category: typeof i.category === "string" ? i.category.slice(0, 100) : null }))
    .filter((i: { question: string; answer: string }) => i.question && i.answer);
  if (rows.length === 0) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const inserted = await asUser(user.id, async (sql) => {
    const out: { id: string }[] = [];
    for (const r of rows) {
      const [x] = await sql<{ id: string }[]>`insert into legal_life.chat_history (user_id, question, answer, category) values (${user.id}, ${r.question}, ${r.answer}, ${r.category}) returning id`;
      out.push(x);
    }
    return out;
  });
  return NextResponse.json({ ids: inserted.map((x) => x.id) });
}

// 削除(id 指定なら 1 件、無ければ本人の全件)
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  await asUser(user.id, (sql) => (id ? sql`delete from legal_life.chat_history where id = ${id} and user_id = ${user.id}` : sql`delete from legal_life.chat_history where user_id = ${user.id}`));
  return NextResponse.json({ ok: true });
}
