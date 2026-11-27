"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AiConsentModal, { hasAiConsentCookie, saveAiConsentCookie } from "@/components/AiConsentModal";
import { IconWarning, IconTrash, IconBulb } from "@/components/icons";

const STORAGE_KEY = "legalChatHistory";
const MAX_INPUT_LEN = 1000;
const DRAFT_KEY = "legalChatDraft"; // 入力中・送信に失敗した質問(再読み込みで、入力欄に戻す)

type ChatItem = { id: string; question: string; answer: string; category?: string | null };

export default function ChatApp() {
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [askAi, setAskAi] = useState(false); // AI への送信の同意の確認を出しているか
  const [confirmSend, setConfirmSend] = useState<string | null>(null); // 送信前の確認(この内容で送信してよいか)
  const [linkModal, setLinkModal] = useState(false); // アカウント連携の確認(ログイン済みで、連携が未許可のとき)
  const [notLoggedIn, setNotLoggedIn] = useState(false);
  const [needsLink, setNeedsLink] = useState(false); // ログイン済みだが、legal-life との連携を許可していない
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against out-of-order completion of initForUser(): onAuthStateChange
  // can fire again (e.g. sign-out followed quickly by sign-in as a different
  // account, or a near-simultaneous TOKEN_REFRESHED event) before a previous
  // call's awaits (migrateLocalToSupabase/loadFromSupabase) have resolved.
  // Without this, the earlier call's setHistory could land *after* the later
  // call's, showing a different account's chat history than the one `userId`
  // (and any subsequent send) actually points to.
  const authRequestIdRef = useRef(0);

  // ログイン中はSupabase(chat_history)に読み書きし、未ログイン時はブラウザのlocalStorageに保存する。
  // 未ログインで貯まった履歴は、ログインした瞬間にSupabaseへ移行してlocalStorageから消す。
  useEffect(() => {
    const loadFromLocal = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setHistory([]);
        return;
      }
      try {
        setHistory(JSON.parse(saved));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setHistory([]);
      }
    };

    const loadFromSupabase = async (_uid: string, requestId: number) => {
      const res = await fetch("/api/chat-history", { credentials: "include", cache: "no-store" }).catch(() => null);
      const data = res?.ok ? ((await res.json()) as ChatItem[]) : [];
      if (authRequestIdRef.current !== requestId) return; // superseded by a newer auth state change
      setHistory(data);
    };

    const migrateLocalToSupabase = async (uid: string) => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      let local: ChatItem[];
      try {
        local = JSON.parse(raw);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (local.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const res = await fetch("/api/chat-history", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: local.map((item) => ({ question: item.question, answer: item.answer, category: item.category ?? null })) }),
      }).catch(() => null);
      const migrateError = !res?.ok;
      // Only clear the locally-stored history once it has actually been saved to
      // Supabase; previously this ran unconditionally, so a failed insert (network
      // error, RLS rejection, etc.) permanently deleted the user's chat history.
      if (!migrateError) localStorage.removeItem(STORAGE_KEY);
    };

    const initForUser = async (uid: string | null) => {
      const requestId = ++authRequestIdRef.current;
      setUserId(uid);
      if (uid) {
        await migrateLocalToSupabase(uid);
        if (authRequestIdRef.current !== requestId) return; // superseded while migrating
        await loadFromSupabase(uid, requestId);
      } else {
        loadFromLocal();
      }
    };

    // 入力中・送信に失敗した質問を、入力欄に戻す
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setInput(draft.slice(0, MAX_INPUT_LEN));
    } catch {}

    let isMounted = true;
    (async () => {
      // ログイン中かどうかは、サーバー(auth への問い合わせ)で確認する。ログイン・ログアウトはページ遷移を伴うため、変化の購読はしない
      const res = await fetch("/api/me", { credentials: "include", cache: "no-store" }).catch(() => null);
      const user = res?.ok ? ((await res.json()) as { user: { id: string } }).user : null;
      if (!isMounted) return;
      if (res?.status === 403) {
        setNeedsLink(true);
        setLinkModal(true);
      }
      if (!user && res?.status !== 403) setNotLoggedIn(true);
      await initForUser(user?.id ?? null);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 送信ボタン・Enter: すぐには送らず、確認のモーダルを出す
  const handleSend = () => {
    const question = input.trim();
    if (!question || sending) return;
    if (question.length > MAX_INPUT_LEN) {
      setError(`質問は${MAX_INPUT_LEN}文字以内で入力してください。`);
      return;
    }
    // AI(Google Gemini)への送信に同意するまで、質問は送らない
    if (!hasAiConsentCookie()) {
      setAskAi(true);
      return;
    }
    setConfirmSend(question);
  };

  const doSend = async (question: string) => {
    if (sending) return;
    setSending(true);
    setError("");
    setInput("");
    // 送信に成功するまで、質問を端末に残す(失敗したときや、再読み込みしたときに、入力欄に戻すため)
    try { localStorage.setItem(DRAFT_KEY, question); } catch {}
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "エラーが発生しました");
      if (data.ignored) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        setError("法令に関する質問ではないため、回答・保存をスキップしました。");
        return;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch {}

      if (userId) {
        const saveRes = await fetch("/api/chat-history", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ question, answer: data.answer, category: data.category ?? null }] }),
        }).catch(() => null);
        const savedId = saveRes?.ok ? ((await saveRes.json()) as { ids: string[] }).ids[0] : null;
        if (savedId) {
          setHistory((h) => [...h, { id: savedId, question, answer: data.answer, category: data.category ?? null }]);
        } else {
          // Saving to Supabase failed, but the AI already answered — show the
          // answer locally instead of silently discarding it (previously the
          // question and answer both vanished with no feedback to the user).
          setHistory((h) => [
            ...h,
            { id: `local-${Date.now()}`, question, answer: data.answer, category: data.category ?? null },
          ]);
          setError("回答を表示していますが、履歴の保存に失敗しました。");
        }
      } else {
        const item: ChatItem = { id: Date.now().toString(), question, answer: data.answer, category: data.category ?? null };
        const next = [...history, item];
        setHistory(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }

      setTimeout(() => {
        areaRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? `${e.message}(入力した内容は、入力欄に戻しました)` : String(e));
      // Restore the question text on failure so the user doesn't lose what they typed.
      setInput((current) => current || question);
    } finally {
      setSending(false);
    }
  };

  const [confirmTarget, setConfirmTarget] = useState<{ type: "one"; id: string } | { type: "all" } | null>(null);

  const deleteItem = (id: string) => setConfirmTarget({ type: "one", id });
  const clearAll = () => {
    if (history.length === 0) return;
    setConfirmTarget({ type: "all" });
  };
  const runConfirm = async () => {
    if (!confirmTarget) return;
    if (confirmTarget.type === "one") {
      if (userId) await fetch(`/api/chat-history?id=${encodeURIComponent(confirmTarget.id)}`, { method: "DELETE", credentials: "include" }).catch(() => null);
      const next = history.filter((i) => i.id !== confirmTarget.id);
      setHistory(next);
      if (!userId) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      if (userId) await fetch("/api/chat-history", { method: "DELETE", credentials: "include" }).catch(() => null);
      setHistory([]);
      if (!userId) localStorage.removeItem(STORAGE_KEY);
    }
    setConfirmTarget(null);
  };

  const exportHistory = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal-life-chat-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-5 pb-12">
      {askAi && (
        <AiConsentModal
          agreeLabel="同意する"
          onAgree={() => {
            saveAiConsentCookie();
            setAskAi(false);
            // 質問が入力済みなら、続けて、送信の確認へ進む
            const q = input.trim();
            if (q && q.length <= MAX_INPUT_LEN) setConfirmSend(q);
          }}
          onCancel={() => setAskAi(false)}
        />
      )}
      {confirmSend !== null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-5">
          <div role="dialog" aria-modal="true" className="w-full max-w-[460px] rounded-2xl bg-white px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <p className="mb-3 text-center font-bold text-[#1e293b]">この内容で送信してもよろしいですか?</p>
            <p className="mb-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#f8fafc] p-3 text-sm text-[#334155]">{confirmSend}</p>
            <p className="mb-5 text-xs text-gray-500">入力した内容は、回答の生成のため、Google の Gemini API へ送信されます。個人情報は入力しないでください。</p>
            <div className="flex justify-center gap-3">
              <button className="max-w-[160px] flex-1 rounded-[10px] bg-gray-100 py-2.5 font-bold text-gray-700 hover:bg-gray-200" onClick={() => setConfirmSend(null)}>戻る</button>
              <button
                className="max-w-[160px] flex-1 rounded-[10px] bg-[#0f172a] py-2.5 font-bold text-white hover:bg-[#334155]"
                onClick={() => {
                  const q = confirmSend;
                  setConfirmSend(null);
                  void doSend(q);
                }}
              >
                送信する
              </button>
            </div>
          </div>
        </div>
      )}
      {linkModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-5">
          <div role="dialog" aria-modal="true" className="w-full max-w-[460px] rounded-2xl bg-white px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <p className="mb-2 text-center text-lg font-bold text-[#1e293b]">アカウントの連携を確認してください</p>
            <p className="mb-5 text-sm leading-relaxed text-[#334155]">
              アカウントでログイン中ですが、legal-life との連携が許可されていません。このままでは、チャットの履歴は、この端末にだけ保存されます。連携を許可すると、履歴が、アカウントに保存されます。
            </p>
            <div className="flex flex-col gap-2">
              <a
                className="rounded-[10px] bg-[#0f172a] py-3 text-center font-bold text-white hover:bg-[#334155]"
                href={`https://auth.saka2931.jp/link?service=legal_life&return_to=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "https://legal-life.saka2931.jp/")}`}
              >
                連携を許可する
              </a>
              <button className="rounded-[10px] bg-gray-100 py-3 font-bold text-gray-700 hover:bg-gray-200" onClick={() => setLinkModal(false)}>今は許可しない(この端末だけで使う)</button>
            </div>
          </div>
        </div>
      )}
      <div className="text-center py-6 mb-2">
        <h1 className="text-2xl font-bold">法令専門AIチャット</h1>
        <p className="text-sm text-gray-500 mt-2">
          日本の法令に関して聞かれたことに対してAIが詳しく回答します。
          <br />
          履歴はご利用中の端末もしくはサーバーに自動で保存されます。
        </p>
      </div>

      {needsLink && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#f59e0b] bg-[#fffbeb] px-6 py-4">
          <p className="text-sm font-bold text-[#92400e]">アカウントの連携が許可されていません。履歴は、この端末にだけ保存されます。</p>
          <a
            className="rounded-lg bg-[#0f172a] px-5 py-2 text-sm font-bold text-white hover:bg-[#334155]"
            href={`https://auth.saka2931.jp/link?service=legal_life&return_to=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "https://legal-life.saka2931.jp/")}`}
          >
            連携を許可する
          </a>
        </div>
      )}
      {notLoggedIn && (
        <div className="mb-5 rounded-xl border-2 border-[#60a5fa] bg-[#eff6ff] px-6 py-4 text-sm font-bold text-[#1e40af]">
          ログインしていません。履歴は、この端末にだけ保存されます。アカウントに保存したいときは、ログインして、連携を許可してください。
        </div>
      )}

      <div className="bg-[#fff9db] border border-[#ffe066] border-l-[6px] border-l-[#fcc419] rounded-xl px-6 py-4 mb-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <p className="font-bold text-[#856404] text-lg mb-2 flex items-center gap-1.5">
          <IconWarning className="w-5 h-5 shrink-0" /> 重要な注意事項
        </p>
        <ul className="text-sm text-[#856404] leading-relaxed list-disc pl-5 mb-2">
          <li>個人情報(氏名、住所、電話番号等)は絶対に入力しないでください</li>
          <li>本サービスは法的助言ではありません</li>
          <li>AI生成の回答には誤りが含まれる可能性があります</li>
          <li>重要な判断には必ず専門家にご相談ください</li>
        </ul>
        <p className="text-sm text-[#856404] pt-2.5 border-t border-dashed border-[#85640433]">
          当機能利用時は当サイト{" "}
          <a href="https://saka2931.jp/disclaimer" className="underline font-bold">免責事項</a>{" "}
          並びに{" "}
          <a href="https://saka2931.jp/privacy#section6" className="underline font-bold">AI利用に関する詳細情報開示</a>{" "}
          に同意したものをみなします。
        </p>
      </div>

      <div className="bg-[#f0faff] border border-[#e0f2f7] rounded-xl px-6 py-3 mb-5 text-center text-sm text-[#444] flex items-center justify-center gap-1.5 flex-wrap">
        <IconBulb className="w-4 h-4 shrink-0" /> わからない法令名は{" "}
        <Link href="/content/search" className="text-[#008fa6] font-bold border-b-[1.5px] border-primary hover:text-primary">
          法令検索
        </Link>{" "}
        ページで調べてみよう!
      </div>

      <div className="flex flex-col h-[85vh] max-h-[900px] bg-white rounded-2xl border border-[#e2e8f0]/80 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f1f5f9]">
          <span className="font-bold text-[#0f172a]">
            法令専門AIチャット
            <span className="ml-2 text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 rounded-sm px-1.5 py-0.5 align-middle">
              テスト中の機能
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 border border-[#cbd5e1] text-[#334155] text-sm font-bold rounded-xl transition-all hover:bg-[#f1f5f9] disabled:opacity-40"
              disabled={history.length === 0}
              onClick={exportHistory}
            >
              エクスポート
            </button>
            <button
              id="clearAllButton"
              className="px-6 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm font-bold rounded-xl transition-all hover:scale-[1.02]"
              onClick={clearAll}
            >
              全削除
            </button>
          </div>
        </div>

        <div ref={areaRef} className="flex-1 overflow-y-auto p-8 flex flex-col gap-5 bg-[#fcfcfd]">
          {history.length === 0 && (
            <AiBubble text="こんにちは!日本の法令に関する一般的な仕組みや制度について、AIがお答えします。何かお困りですか?" />
          )}
          {history.map((item) => (
            <div key={item.id}>
              <div className="flex items-center gap-3 justify-end mb-3 group">
                <button
                  className="chat-delete-btn order-first text-[#cbd5e1] hover:text-[#ef4444] hover:scale-110 transition-all"
                  onClick={() => deleteItem(item.id)}
                >
                  <IconTrash className="w-4 h-4" />
                </button>
                <div className="bg-[#0f172a] text-white rounded-[18px] rounded-br-[4px] px-5 py-3.5 max-w-[80%] text-sm whitespace-pre-wrap">
                  {item.question}
                </div>
              </div>
              <AiBubble text={item.answer} />
            </div>
          ))}
          {sending && <span className="text-[#64748b] font-bold animate-pulse">考え中...</span>}
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <IconWarning className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-4 items-end px-6 py-5 border-t border-[#f1f5f9]">
          <textarea
            ref={textareaRef}
            className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-3 text-sm resize-none min-h-[45px] max-h-[150px] outline-hidden focus:bg-white focus:border-[#0f172a] focus:ring-2 focus:ring-[#0f172a]/5"
            rows={1}
            placeholder="AIと話すにはここに入力..."
            value={input}
            onFocus={() => {
              // 初めて入力欄にさわったとき、AI(Google Gemini)の利用についての確認を出す
              if (!hasAiConsentCookie()) {
                textareaRef.current?.blur();
                setAskAi(true);
              }
            }}
            onChange={(e) => {
              setInput(e.target.value);
              try { if (e.target.value) localStorage.setItem(DRAFT_KEY, e.target.value); else localStorage.removeItem(DRAFT_KEY); } catch {}
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
            }}
            onKeyDown={(e) => {
              // Enter では、すぐには送信せず、確認のモーダルを出す(日本語の変換の確定の Enter では、何もしない)。Shift+Enter は改行
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            className="chat-send-btn px-7 py-3 bg-[#0f172a] hover:bg-[#334155] text-white font-bold rounded-xl transition-all hover:scale-[1.02] disabled:opacity-60"
            disabled={sending}
            onClick={handleSend}
          >
            送信
          </button>
        </div>
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-9999 p-5">
          <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] px-6 py-7 text-center">
            <IconTrash className="w-8 h-8 mb-2.5 mx-auto text-[#ef4444]" />
            <p className="text-[#1e293b] font-medium leading-relaxed mb-5">
              {confirmTarget.type === "all" ? `${history.length}件の履歴をすべて削除しますか?` : "このメッセージを削除しますか?"}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                className="flex-1 max-w-[160px] py-2.5 rounded-[10px] bg-gray-100 text-gray-700 font-bold hover:bg-gray-200"
                onClick={() => setConfirmTarget(null)}
              >
                キャンセル
              </button>
              <button
                className="flex-1 max-w-[160px] py-2.5 rounded-[10px] bg-[#ef4444] text-white font-bold hover:bg-[#dc2626]"
                onClick={runConfirm}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AiBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <Image
        src="/assets/images/chat_logo.png"
        alt="AI"
        width={32}
        height={32}
        className="rounded-full shrink-0"
      />
      <div className="bg-white border border-[#e2e8f0] rounded-[18px] rounded-tl-[4px] px-5 py-3.5 max-w-[80%] text-sm text-[#334155] whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
