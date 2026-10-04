import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getAnnouncements, formatSimpleDate } from "@/lib/announcements";

export const metadata: Metadata = pageMetadata({
  title: "お知らせ",
  path: "/info",
  description:
    "legal&lifeからのお知らせ一覧です。機能追加・改善、メンテナンス情報、重要なご案内などの最新情報を、公開・更新日とあわせて確認できます。",
});

// adacの管理画面から追加されたお知らせを反映するため、ビルド時に固定せず
// リクエスト時に取得する。
export const dynamic = "force-dynamic";

export default async function InfoPage() {
  const announcements = await getAnnouncements();

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-center mb-6">サイトからのお知らせ</h1>
      <div className="max-w-[900px] mx-auto bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-5">
        <div className="hidden sm:flex items-center px-2.5 py-4 border-b-2 border-[#7ddce8] font-bold text-[#333] rounded-t-lg">
          <span className="w-[130px] shrink-0">公開・更新日</span>
          <span className="flex-1 pr-5">内容</span>
          <span className="w-24 shrink-0 text-center">リンク</span>
        </div>
        {announcements.map((a) => (
          <div
            key={a.slug}
            className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-0 px-2.5 py-4 border-b border-[#e0f7f9] transition-colors hover:bg-[#f5fdfe]"
          >
            <span className="w-full sm:w-[130px] shrink-0 font-bold text-[#666] text-sm">
              {formatSimpleDate(a.publishedAt)}
            </span>
            <span className="flex-1 sm:pr-5 text-[#333]">{a.title}</span>
            <Link
              href={`/info/details/${a.slug}`}
              className="w-full sm:w-24 shrink-0 text-left sm:text-right font-bold text-sm text-[#0076a3] hover:underline"
            >
              内容を見る
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
