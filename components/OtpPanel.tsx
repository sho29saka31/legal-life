"use client";

import { useEffect, useId, useRef, useState } from "react";
import MdButton from "@/components/material/MdButton";

export type OtpVerifyResult = { ok: boolean; reason?: string };

export default function OtpPanel({
  title = "認証コードを入力",
  desc = "",
  length = 6,
  onVerify,
  onCancel,
}: {
  title?: string;
  desc?: string;
  /**
   * コードの桁数。認証アプリ(TOTP)は規格上常に6桁だが、Supabaseの
   * メールOTP(reauthenticate()等で送信されるコード)はプロジェクト設定
   * (メールOTPの長さ)に従うため、呼び出し元で桁数を指定できるようにする。
   */
  length?: number;
  onVerify: (input: string) => Promise<OtpVerifyResult>;
  onCancel?: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const uid = useId();
  const titleId = `${uid}-otp-title`;
  const descId = `${uid}-otp-desc`;
  const errorId = `${uid}-otp-error`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    // Enterキーはボタンのdisabled状態を経由しないため、ここでガードしないと
    // 連打で二重にonVerify(検証API呼び出し)が発行されてしまう
    // (試行回数制限のあるOTP検証では、意図せず残り試行回数を消費するバグになる)。
    if (submitting) return;
    const input = code.trim();
    if (!input) {
      setError("コードを入力してください");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await onVerify(input);
      if (!res.ok) {
        setError(res.reason || "コードが正しくありません");
        setSubmitting(false);
      }
    } catch {
      // onVerify(検証API呼び出し)がネットワークエラー等で例外を投げた場合、
      // ここでcatchしないとsubmittingがtrueのまま固まり、ボタンが
      // disabledの「確認中...」表示のまま操作不能になる(ページ再読み込み
      // でしか復帰できなくなる)。エラーメッセージを出してユーザーが
      // 再試行できる状態に戻す。
      setError("通信エラーが発生しました。もう一度お試しください");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    // モーダルが開いた瞬間、キーボード操作のユーザーがどこにフォーカスがあるか
    // 分からない状態になるため、コード入力欄へ自動でフォーカスする。
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // 全画面モーダルのため、キーボードのみの操作でも閉じられるようEscapeで
    // キャンセルできるようにする(送信中は誤ってキャンセルされないよう除外)。
    // さらに、このモーダルの背後にはページの残りのコンテンツがそのままDOM上に
    // 残っており、Tab/Shift+Tabで最後(最初)の要素を抜けるとフォーカスが
    // モーダル外(背後の非表示要素)へ漏れてしまう。モーダル内の要素間でのみ
    // フォーカスが循環するようにする(フォーカストラップ)。
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!submitting) onCancel?.();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [submitting, onCancel]);

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-md-on-surface/40 p-5">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={desc ? descId : undefined}
        className="w-full max-w-[380px] rounded-m3-xl bg-md-surface-container-high px-7 py-8 text-center shadow-m3-3"
      >
        <p id={titleId} className="mb-2.5 text-m3-headline-small text-md-on-surface">{title}</p>
        <p id={descId} className="mb-5 text-m3-body-medium leading-relaxed text-md-on-surface-variant">{desc}</p>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={length}
          placeholder={"0".repeat(length)}
          autoComplete="one-time-code"
          aria-label={title}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="w-full rounded-m3-sm border-2 border-md-outline-variant bg-md-surface-container-lowest py-3.5 text-center text-3xl font-bold tracking-[12px] text-md-on-surface outline-none transition-colors focus:border-md-primary"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <p id={errorId} role="alert" className="my-2 min-h-[20px] text-m3-body-small text-md-error">{error}</p>
        <div className="mt-1 flex gap-2.5">
          <MdButton variant="outlined" className="flex-1" onClick={onCancel}>
            キャンセル
          </MdButton>
          <MdButton variant="filled" className="flex-[2]" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "確認中..." : "確認する"}
          </MdButton>
        </div>
      </div>
    </div>
  );
}
