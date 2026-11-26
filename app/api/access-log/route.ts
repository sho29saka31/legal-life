import { NextResponse } from "next/server";
import { asAnon } from "@/lib/server/db";
import { isSameOrigin } from "@/lib/server/session";

const TYPES = new Set(["page_view", "scroll", "engagement", "click"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

// 独自アクセスログ。未ログインでも書き込める(従来と同じ)が、項目は固定・長さは制限し、同じオリジンのみ受け付ける
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  const b = await request.json().catch(() => null);
  const type = typeof b?.event_type === "string" && TYPES.has(b.event_type) ? b.event_type : null;
  if (!type) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const extra = b.extra && typeof b.extra === "object" && !Array.isArray(b.extra) ? JSON.stringify(b.extra).slice(0, 1000) : "{}";
  try {
    await asAnon(
      (sql) => sql`insert into legal_life.access_logs (event_type, path, browser, os, device, screen, lang, theme, country, region, city, extra)
        values (${type}, ${clip(b.path, 300)}, ${clip(b.browser, 100)}, ${clip(b.os, 100)}, ${clip(b.device, 100)}, ${clip(b.screen, 30)}, ${clip(b.lang, 30)}, ${clip(b.theme, 10)}, ${clip(b.country, 100)}, ${clip(b.region, 100)}, ${clip(b.city, 100)}, ${extra}::jsonb)`,
    );
  } catch {
    // ログの書き込み失敗は、利用者には見せない
  }
  return new NextResponse(null, { status: 204 });
}
