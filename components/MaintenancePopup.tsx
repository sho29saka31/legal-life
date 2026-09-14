"use client";

import { useEffect, useRef, useState } from "react";

const EVENT_NAME = "ll:maintenance-popup";

export function showMaintenancePopup() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

// 旧important.jsの「開発中ページポップアップ」(js-popup-show)相当。
// 準備中のページへのリンククリック時に、遷移せずこのポップアップを表示する。
export default function MaintenancePopup() {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // モーダルが開いた瞬間、キーボード操作のユーザーがどこにフォーカスがあるか
    // 分からない状態になるため、閉じるボタンへ自動でフォーカスする。
    closeButtonRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    // 背景クリックでは閉じられるが、キーボードのみの操作やスクリーンリーダー
    // 利用者には同等の手段がない(全画面を覆うモーダルのため、閉じるボタンまで
    // Tabで辿り着く必要がある)。Escapeキーでも閉じられるようにする。
    // さらに、このモーダルの背後にはページの残りのコンテンツがそのままDOM上に
    // 残っており、Tab/Shift+Tabで最後(最初)の要素を抜けるとフォーカスが
    // モーダル外(背後の非表示要素)へ漏れてしまう。モーダル内の要素間でのみ
    // フォーカスが循環するようにする(フォーカストラップ)。
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVisible(false);
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setVisible(false);
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-xl p-8 max-w-sm w-[90%] text-center shadow-xl"
      >
        <p className="text-sm text-gray-700 leading-relaxed mb-5">
          選択いただいたページは現在メンテナンス中です
          <br />
          メンテナンス終了までしばらくお待ちください
        </p>
        <button
          ref={closeButtonRef}
          className="inline-block bg-primary text-white text-sm font-bold rounded-lg px-6 py-2"
          onClick={() => setVisible(false)}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
