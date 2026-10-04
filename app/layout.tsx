import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccessLogger from "@/components/AccessLogger";
import AuthSessionWatcher from "@/components/AuthSessionWatcher";
import ScrollTopButton from "@/components/ScrollTopButton";
import MaintenancePopup from "@/components/MaintenancePopup";
import CookieBanner from "@/components/CookieBanner";
import SiteChrome from "@/components/SiteChrome";
import { getImportantAnnouncements } from "@/lib/announcements";
import "./globals.css";

// 元リポジトリの BIZUDGothic-Bold.woff2 は拡張子のみwoff2で実体が壊れたフォントデータのため
// (README記載の「Apple OSでフォントが正常に読み込まれない」不具合の原因と推測される)、ttfのみを使用する。
const bizUDGothic = localFont({
  src: [{ path: "../public/assets/fonts/BIZUDGothic-Bold.ttf", weight: "700", style: "normal" }],
  variable: "--font-biz-ud-gothic",
  display: "swap",
});

// ヘッダー直下の重要なお知らせ(adacの管理画面から追加)を反映するため、
// レイアウト全体を毎回動的にせず、60秒ごとに再検証する(ISR)。
export const revalidate = 60;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://legal-life.saka2931.jp"),
  title: { default: "legal&life | 法令の学習・検索・相談サイト", template: "%s | legal&life" },
  description:
    "legal&lifeは、日本の法令をだれでも調べて学べる法令学習・検索サイトです。e-Gov法令APIによる法令検索、AIチャットでの相談、法令学習コンテンツを通じて、法知識の不足による不利益を防ぐことを目指しています。",
  applicationName: "legal&life",
  keywords: ["法令検索", "法律", "法令学習", "日本国憲法", "e-Gov法令API", "AIチャット", "法律相談", "legal&life"],
  verification: {
    // Vercelドメイン移行に伴うSearch Console再確認用の値のみを使用する。
    google: "Cd5Qt9qv8B4IZtsMqdvPt8tDfUoGh0ueLpghxhEsTSE",
  },
  icons: {
    icon: "/assets/images/favicon.png",
    apple: "/assets/images/favicon.png",
  },
  // 各ページはlib/seo.tsのpageMetadata()でopenGraph/twitterを丸ごと上書きするため、
  // ここはmetadataを持たないページ(アカウント系など)向けの既定値。
  openGraph: {
    siteName: "legal&life",
    locale: "ja_JP",
    type: "website",
    // share.png はSNS等でシェアされた際のプレビュー画像用アセット(325x300)
    images: [{ url: "/assets/images/share.png", width: 325, height: 300, alt: "legal&life ロゴ" }],
  },
  twitter: { card: "summary", images: ["/assets/images/share.png"] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const importantAnnouncements = await getImportantAnnouncements(2);

  return (
    <html lang="ja" className={bizUDGothic.variable}>
      <body className="font-sans">
        <SiteChrome>
          <div id="header"><Header importantAnnouncements={importantAnnouncements} /></div>
        </SiteChrome>
        <main>{children}</main>
        <SiteChrome>
          <div id="footer"><Footer /></div>
        </SiteChrome>
        <AccessLogger />
        <AuthSessionWatcher />
        <ScrollTopButton />
        <MaintenancePopup />
        <SiteChrome>
          <CookieBanner />
        </SiteChrome>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
