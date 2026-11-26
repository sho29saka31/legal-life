"use client";

import { useState } from "react";

export const AI_CONSENT_COOKIE = "legal_life_ai_consent";

export function hasAiConsentCookie(): boolean {
  return document.cookie.split("; ").some((c) => c === `${AI_CONSENT_COOKIE}=1`);
}
export function saveAiConsentCookie() {
  document.cookie = `${AI_CONSENT_COOKIE}=1;path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${location.protocol === "https:" ? ";Secure" : ""}`;
}

/**
 * AI チャットを使う前の確認。入力した質問は、回答の生成のため、Google の Gemini API(米国)へ送信される。
 * 同意するまで、AI には何も送らない。
 */
export default function AiConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" className="w-full max-w-md rounded-xl bg-white p-6 text-gray-900 shadow-2xl">
        <h2 id="ai-consent-title" className="text-base font-bold">AIチャットのご利用について</h2>
        <p className="mt-3 text-sm leading-relaxed">
          入力した質問は、回答の生成のため、<strong>Google の Gemini API(米国)</strong>へ送信されます。氏名・メールアドレス・IPアドレスは送信しません。
        </p>
        <ul className="mt-3 list-disc pl-5 text-xs leading-relaxed text-gray-600">
          <li><strong>住所・電話番号・マイナンバー・クレジットカード番号・健康情報など、個人を特定できる情報や機密情報は、入力しないでください。</strong></li>
          <li>送信したデータは、Google により、最大30日間保持されます。</li>
          <li>同意は、このブラウザに記録されます(ブラウザの Cookie を消すと、再び確認します)。</li>
          <li>詳しくは、<a className="underline" href="https://saka2931.jp/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>をご確認ください。</li>
        </ul>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          上記の内容を理解し、AIへの送信に同意します
        </label>
        <button type="button" disabled={!agree} onClick={onAgree} className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          同意して、質問を送る
        </button>
        <button type="button" onClick={onCancel} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
          同意しない(送らない)
        </button>
      </div>
    </div>
  );
}
