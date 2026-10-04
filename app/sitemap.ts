import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://legal-life.saka2931.jp";
  const lastModified = new Date();
  // robots.ts・各ページのmetadata.robotsでindex許可しているページのみ掲載する。
  // チャット・学習・ニュース・料金プラン・沿革・サイトマップは正式公開前の機能/ページ、
  // お知らせ詳細(/info/details/*)はnoindexのため、検索エンジンにも公開しない。
  // /law/*・/info/contactはservice.saka2931.jpへのリダイレクト専用ページのため掲載しない。
  const pages: {
    path: string;
    priority: number;
    changeFrequency: "daily" | "weekly" | "monthly";
  }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/content", priority: 0.9, changeFrequency: "monthly" },
    { path: "/content/search", priority: 0.9, changeFrequency: "monthly" },
    { path: "/info", priority: 0.5, changeFrequency: "weekly" },
    { path: "/info/about", priority: 0.5, changeFrequency: "monthly" },
    { path: "/info/faq", priority: 0.5, changeFrequency: "monthly" },
  ];
  return pages.map((p) => ({
    url: `${base}${p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
