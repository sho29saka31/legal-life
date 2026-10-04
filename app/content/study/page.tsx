import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "法令学習",
  path: "/content/study",
  description:
    "日本国憲法をはじめとする法令の条文について、意義や解釈をわかりやすく学べる学習コンテンツのページです(正式公開前・制作中)。基礎から応用まで、段階的に理解を深められる内容を準備しています。",
  index: false,
});

export default function StudyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">学習コンテンツ選択</h1>
        <p className="text-sm text-gray-500 mt-2">
          このサイトは、法令に関して必要な情報を提供するサイトへ案内するLEGAL&amp;LIFEの学習ページです。
          <br />
          下のセクションから必要な学習コンテンツを選択してください
        </p>
      </div>
      <p className="text-center text-gray-500">現在作成中です。リリースまでお待ちください。</p>
    </div>
  );
}
