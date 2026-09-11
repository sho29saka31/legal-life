"use client";

import { useEffect } from "react";

export default function AccountLayoutClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ログアウト後にブラウザの「戻る」でaccount配下のページに戻ると、bfcache
    // (back/forward cache)によってJSを再実行せずページがそのまま復元されることがある。
    // このとき各ページのuseEffect(requireAuth()等の認証チェック)は再実行されないため、
    // ログアウト前に取得済みだった氏名・メールアドレス・アクティビティ履歴・端末一覧等の
    // 機密情報がそのまま画面に表示され続けてしまう。event.persisted(bfcacheからの復元)を
    // 検知した場合は強制的にリロードし、各ページの認証チェックを必ず再実行させる。
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <div className="min-h-[calc(100vh-200px)] bg-md-surface flex items-center justify-center px-4 py-10 sm:py-16">
      {children}
    </div>
  );
}
