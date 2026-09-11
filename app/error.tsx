"use client";

import { useEffect } from "react";
import ErrorPage from "@/components/ErrorPage";

/**
 * ルートセグメント配下でのレンダリング時エラーを捕捉する境界(いわば500相当)。
 * React Error Boundaryとして機能するため、Next.jsの規約上Client Componentである必要がある。
 * root layout(ヘッダー・フッター等)はこの外側でそのまま描画され続ける。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPage
      code="500 Internal Server Error"
      title="予期しないエラーが発生しました"
      desc={
        "申し訳ありませんが、処理中に問題が発生しました。\nお手数をおかけしますが、もう一度お試しいただくか、ホームページからやり直してください。"
      }
      onRetry={reset}
    />
  );
}
