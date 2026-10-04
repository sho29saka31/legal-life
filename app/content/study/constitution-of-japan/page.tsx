import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "日本国憲法",
  path: "/content/study/constitution-of-japan",
  description:
    "日本国憲法の条文ごとの意義や解釈を、法律の初学者にもわかりやすく解説する学習ページです(正式公開前・制作中)。",
  index: false,
});

export default function ConstitutionOfJapanPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-bold mb-2">コンテンツは現在作成中です</h2>
      <p className="text-gray-500">コンテンツリリースまでしばらくお待ちください</p>
    </div>
  );
}
