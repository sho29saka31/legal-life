"use client";

import { useEffect, useRef, useState } from "react";

// 未成年者への案内(個人情報保護法のガイドラインに沿い、15歳未満の方は、保護者の同意を得て使うよう、利用の前に伝える)。
//  ・ページを開くたびに、まだ確認していなければ表示する。確認すると、ブラウザを閉じる(セッションが切れる)まで出さない
//  ・「30日間、この表示を出さない」にチェックして確認すると、30日間、出さない(全サービスで共通。.saka2931.jp の Cookie)
const SESSION_COOKIE = "age_notice_session";
const SKIP_COOKIE = "age_notice_skip";
const SKIP_DAYS = 30;

function cookieDomain(): string {
  return location.hostname.endsWith("saka2931.jp") ? ";domain=.saka2931.jp" : "";
}
function hasCookie(name: string): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}
function setCookie(name: string, value: string, maxAgeSec?: number) {
  document.cookie = `${name}=${value};path=/${cookieDomain()};SameSite=Lax${location.protocol === "https:" ? ";Secure" : ""}${maxAgeSec ? `;max-age=${maxAgeSec}` : ""}`;
}

export default function AgeNotice() {
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Cookie はブラウザでしか読めないため、表示の判定は、読み込み後に行う
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasCookie(SESSION_COOKIE) && !hasCookie(SKIP_COOKIE)) setOpen(true);
  }, []);
  useEffect(() => {
    if (open) btnRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const confirm = () => {
    setCookie(SESSION_COOKIE, "1"); // 有効期限なし = ブラウザを閉じるまで
    if (skip) setCookie(SKIP_COOKIE, "1", SKIP_DAYS * 24 * 60 * 60);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="age-notice-title" className="w-full max-w-md rounded-xl bg-white p-6 text-gray-900 shadow-2xl">
        <h2 id="age-notice-title" className="text-base font-bold">
          ご利用にあたって(年齢のご確認)
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          saka2931.jp のサービスは、<strong>15歳未満の方の利用を想定していません。</strong>15歳未満の方は、<strong>保護者(親権者)の同意を得たうえで</strong>、ご利用ください。
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          {SKIP_DAYS}日間、この表示を出さない
        </label>
        <button ref={btnRef} type="button" onClick={confirm} className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800">
          確認しました
        </button>
      </div>
    </div>
  );
}
