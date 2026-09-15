import type { MetadataRoute } from "next";

/**
 * sitemap.ts と同じ基準で公開ページのみ許可する。
 * /content/chat・/content/news・/content/study・/plan・/info/history は
 * チャット・学習・ニュース・料金プラン・沿革の正式公開前の機能/ページであり、
 * サイト内のナビゲーションから意図的にブロックされているため検索エンジンにも非公開とする
 * （/law 配下はCookie/プライバシー/利用規約等の一般的な法的ページのため公開して問題ない）。
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://legal-life.saka2931.jp";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/content", "/info", "/law"],
      disallow: [
        "/content/chat",
        "/content/news",
        "/content/study",
        "/plan",
        "/info/history",
        "/account",
        "/api",
        "/welcome",
        "/error",
      ],
    },
    host: base,
    sitemap: `${base}/sitemap.xml`,
  };
}
