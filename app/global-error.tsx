"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * root layout自体でエラーが発生した場合の最終フォールバック。
 * root layoutが描画されない状態で使われるため、<html>/<body>を含め
 * ページ全体を自前で用意する(ヘッダー・フッター等の共通コンポーネントには依存しない)。
 */
export default function GlobalError({
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
    <html lang="ja">
      <body className="text-center px-5 py-12 sm:py-20 text-[#333]">
        <div className="max-w-3xl min-h-[250px] mx-auto bg-white px-6 sm:px-8 py-8 sm:py-10 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.08)] border-t-[5px] border-[#cc0000]">
          <h1 className="text-3xl sm:text-5xl text-[#cc0000] tracking-wide mb-2">
            500 Internal Server Error
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold mb-5">サイト全体で問題が発生しました</h2>
          <p
            className="leading-loose text-[#444] mb-6 text-left inline-block max-w-[90%]"
            style={{ whiteSpace: "pre-line" }}
          >
            {
              "申し訳ありませんが、ページの表示中に問題が発生しました。\nお手数をおかけしますが、しばらくしてから再度アクセスしてください。"
            }
          </p>
          <div>
            <button
              type="button"
              onClick={reset}
              className="inline-block m-1 bg-primary text-white font-bold rounded-full px-8 py-4 shadow-[0_4px_15px_rgba(0,200,233,0.2)] transition-all duration-300 hover:bg-primary-dark hover:-translate-y-0.5"
            >
              再読み込みする
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
