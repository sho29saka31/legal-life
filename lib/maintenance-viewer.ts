import { NextResponse, type NextRequest } from "next/server";

// メンテナンス中でも、運営者だけがサイトを確認できる仕組み。
// URL に `?viewer=<合言葉>` を付けてアクセスすると、セッション Cookie(ブラウザを閉じると失効)を
// 発行して、同じ URL(viewer を除く)へ移動する。以降は Cookie だけで、メンテナンス表示を通り越せる。
// 合言葉は環境変数 MAINTENANCE_VIEWER_CODE(Worker のシークレット)。未設定のときは、この仕組みは無効。
const COOKIE = "maint-viewer";

function code(): string {
  return process.env.MAINTENANCE_VIEWER_CODE ?? "";
}

/** `?viewer=` が正しいとき、Cookie を発行して viewer を除いた URL へ移動させる。違えば null。 */
export function maintenanceViewerRedirect(request: NextRequest): NextResponse | null {
  const c = code();
  if (!c || request.nextUrl.searchParams.get("viewer") !== c) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete("viewer");
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, c, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/" });
  return res;
}

/** 合言葉の Cookie を持っているか(メンテナンス表示を通り越してよいか)。 */
export function isMaintenanceViewer(request: NextRequest): boolean {
  const c = code();
  return !!c && request.cookies.get(COOKIE)?.value === c;
}
