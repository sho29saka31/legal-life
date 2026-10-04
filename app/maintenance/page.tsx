import type { Metadata } from "next";
import ErrorPage from "@/components/ErrorPage";

export const metadata: Metadata = {
  title: "メンテナンス中",
  description: "現在サイトメンテナンスを実施しています。しばらくしてから再度アクセスしてください。",
  robots: { index: false, follow: false },
};

/** adacで緊急メンテナンスを有効にすると、middlewareが全ページ(静的アセット・API・管理画面を除く)をここへ転送する */
export default function MaintenancePage() {
  return (
    <ErrorPage
      code="503 Maintenance"
      title="ただいまメンテナンス中です"
      desc={
        "ご不便をおかけしております。現在サイトメンテナンスを実施しております。\nお手数をおかけしますが、しばらくしてから再度アクセスしてください。"
      }
      showStatusLink
    />
  );
}
