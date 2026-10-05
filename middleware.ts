import { NextResponse, type NextRequest } from "next/server";
import { isEmergencyMaintenanceActive } from "@/lib/feature-flags";

// adacの管理画面で「緊急メンテナンスモード」を有効にした場合、静的アセット・API・
// 管理画面・メンテナンスページ自身・クローラー用ファイルを除く全ページを
// /maintenance の内容を HTTP 503 で返す(他アプリのメンテナンス表示と統一)。
// legal-lifeは認証をブラウザ側(@supabase/ssr)で完結させておりmiddlewareで
// セッションを扱わないため、ここでは緊急メンテナンスの判定のみを行う。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|api|admin|maintenance|robots.txt|sitemap.xml).*)"],
};

export default async function middleware(request: NextRequest) {
  if (await isEmergencyMaintenanceActive()) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    // 200のままだと外形監視(status)が正常判定し、検索エンジンにも通常ページとして索引される。
    // URLは変えず HTTP 503 + Retry-After で返す(復旧後は同じURLの再読み込みだけで戻る)。
    return NextResponse.rewrite(url, { status: 503, headers: { "Retry-After": "600" } });
  }
  return NextResponse.next();
}
