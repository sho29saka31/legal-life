import { NextResponse, type NextRequest } from "next/server";
import { isEmergencyMaintenanceActive } from "@/lib/feature-flags";

// adacの管理画面で「緊急メンテナンスモード」を有効にした場合、静的アセット・API・
// 管理画面・503ページ自身を除く全ページを503ページへ書き換える。
// legal-lifeは認証をブラウザ側(@supabase/ssr)で完結させておりmiddlewareで
// セッションを扱わないため、ここでは緊急メンテナンスの判定のみを行う。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|api|admin|error/503).*)"],
};

export default async function middleware(request: NextRequest) {
  if (await isEmergencyMaintenanceActive()) {
    const url = request.nextUrl.clone();
    url.pathname = "/error/503";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
