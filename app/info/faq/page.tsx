import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import FaqApp from "./FaqApp";

export const metadata: Metadata = pageMetadata({
  title: "よくある質問",
  path: "/info/faq",
  description:
    "legal&lifeに寄せられる質問と回答をまとめたページです。サービス全般、AIチャット機能、アカウントログイン、個人情報・プライバシー、トラブルシューティング、法的な質問などをキーワードやカテゴリから探せます。",
});

export default function FaqPage() {
  return <FaqApp />;
}
