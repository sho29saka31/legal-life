"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PopupLink from "./PopupLink";
import type { Announcement } from "@/lib/announcements";

export default function Header({
  importantAnnouncements,
}: {
  importantAnnouncements: Announcement[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    // マウスでオーバーレイをクリックすれば閉じられるが、キーボード操作のみの
    // ユーザーにはそれに相当する手段がなくメニューを閉じられなくなるため、
    // Escapeキーでも閉じられるようにする。閉じた後はフォーカスをハンバーガー
    // ボタンへ戻し、フォーカスがメニュー項目のまま(閉じて非表示化された要素)
    // に取り残されるのを防ぐ。
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="flex items-center justify-between bg-gradient-to-r from-primary to-primary px-6 shadow-md relative">
        <h1>
          <Link href="/" className="flex items-center gap-3 py-3 text-white font-bold text-xl">
            <Image src="/assets/images/logo.png" alt="site-logo" width={44} height={44} className="rounded-md" />
            legal&life
          </Link>
        </h1>
        <nav className="flex items-center">
          <button
            ref={buttonRef}
            className="hamberger-btn relative z-[1001] ml-2.5 flex flex-col gap-1.5 p-0"
            aria-expanded={open}
            aria-controls="main-menu"
            aria-label="メニューを開く"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <span
              className={`block w-6 h-0.5 bg-black transition-all duration-300 ${open ? "translate-y-2 rotate-45" : ""}`}
            />
            <span className={`block w-6 h-0.5 bg-black transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span
              className={`block w-6 h-0.5 bg-black transition-all duration-300 ${open ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </button>
          {open && (
            <div className="fixed inset-0 bg-black/30 z-[999] transition-opacity" onClick={() => setOpen(false)} />
          )}
          <ul
            ref={menuRef}
            id="main-menu"
            className={`absolute top-0 right-0 w-[220px] max-h-screen p-8 bg-[#d6eaef] z-[1000] list-none transition-transform duration-300 ${
              open ? "translate-x-0 visible" : "translate-x-full invisible"
            }`}
          >
            <li className="mb-5"><Link href="/" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">ホーム</Link></li>
            <li className="mb-5"><PopupLink onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">法令学習</PopupLink></li>
            <li className="mb-5"><PopupLink onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">AIチャット</PopupLink></li>
            <li className="mb-5"><Link href="/content/search" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">法令検索</Link></li>
            <li className="mb-5"><PopupLink onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">ニュース</PopupLink></li>
            <li className="mb-5"><hr className="border-t-2 border-black/15" /></li>
            <li className="mb-5"><Link href="/account/login" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">アカウント</Link></li>
            <li className="mb-5"><hr className="border-t-2 border-black/15" /></li>
            <li className="mb-5"><Link href="/info/about" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">サイト概要</Link></li>
            <li className="mb-5"><Link href="/info" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">お知らせ</Link></li>
            <li className="mb-5"><Link href="/info/faq" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">よくある質問</Link></li>
            <li className="mb-5"><Link href="https://service.saka2931.jp/contact/legal-life" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">お問い合わせ</Link></li>
            <li className="mb-5"><Link href="/info/map" onClick={() => setOpen(false)} className="text-gray-800 hover:text-primary-dark">サイトマップ</Link></li>
          </ul>
        </nav>
      </header>
      <Announcements items={importantAnnouncements} />
    </>
  );
}

function ImportantIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="10" fill="#ff4d4d" stroke="#ff4d4d" />
      <line x1="12" y1="8" x2="12" y2="12" stroke="white" />
      <line x1="12" y1="16" x2="12.01" y2="16" stroke="white" />
    </svg>
  );
}


function Announcements({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;

  return (
    <div className="w-full box-border">
      {items.map((item, i) => (
        <div
          key={item.slug}
          className={`max-w-[1000px] mx-auto flex items-center gap-3 px-5 py-2.5 bg-[#fff5f5] ${
            i > 0 ? "border-t border-dashed border-[#ffcccc]" : ""
          }`}
        >
          <span className="w-[22px] h-[22px] shrink-0"><ImportantIcon /></span>
          <p className="text-sm text-[#333] leading-snug m-0">
            {item.title} {item.dateLabel}
            <Link
              href={`/info/details/${item.slug}`}
              className="text-[#0076a3] font-bold underline ml-2"
            >
              確認する
            </Link>
          </p>
        </div>
      ))}
    </div>
  );
}
