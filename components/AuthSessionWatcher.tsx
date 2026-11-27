"use client";

import { useEffect } from "react";
import { parseUA } from "@/lib/browserInfo";

/**
 * この端末を auth_app.sessions に登録・監視する。
 * authアプリ自身の登録(auth.saka2931.jpのlocalStorage)とはオリジンが異なり共有されないため、
 * legal-life 自身でも同じ仕組みを持つ(authの`account/devices`で、この端末を個別に確認・強制ログアウトできる)。
 * 他端末の「ログアウトさせる」指示は、60秒ごとの確認で検知する。
 */
const SESSION_KEY = "legallife-auth-session-id";
const POLL_INTERVAL_MS = 60_000;

async function registerSession(): Promise<boolean> {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    const ua = parseUA();
    const res = await fetch("/api/auth-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sid, browser: ua.browser, os: ua.os, device: ua.device }),
    });
    return res.ok; // 401 は未ログイン(何もしない)
  } catch {
    return false;
  }
}

async function signOutAndRedirect(sid: string): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
  // auth 側で、この端末のセッションは既に失効している。ログイン画面へ戻す
  window.location.replace("https://auth.saka2931.jp/login");
}

export default function AuthSessionWatcher() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      if (!(await registerSession()) || cancelled) return;
      const sid = localStorage.getItem(SESSION_KEY);
      if (!sid) return;
      timer = setInterval(async () => {
        const res = await fetch(`/api/auth-session?sid=${encodeURIComponent(sid)}`, { credentials: "include", cache: "no-store" }).catch(() => null);
        if (cancelled || !res?.ok) return;
        if (((await res.json()) as { should_logout: boolean }).should_logout) void signOutAndRedirect(sid);
      }, POLL_INTERVAL_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
