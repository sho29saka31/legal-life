"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { parseUA } from "@/lib/browserInfo";

/**
 * この端末をauth_app.sessionsに登録・監視するためのlocalStorageキー。
 * authアプリ自身の登録(auth.saka2931.jpのlocalStorage)とはオリジンが異なり
 * 共有されないため、legal-life自身でも同じ仕組みを持つ必要がある
 * (authの`account/devices`でlegal-life経由のこの端末を個別に確認・強制ログアウトできるようにする)。
 * 旧`components/SessionWatcher.tsx`(legal_life.sessionsを監視)の後継。
 */
const SESSION_KEY = "legallife-auth-session-id";
const POLL_INTERVAL_MS = 60_000;

async function registerSession(userId: string): Promise<void> {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    const ua = parseUA();
    const { error } = await supabase.schema("auth_app").from("sessions").upsert({
      id: sid,
      user_id: userId,
      app: "legal_life",
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      last_active: new Date().toISOString(),
    });
    if (error) console.error("Failed to register session", error);
  } catch (error) {
    console.error("Failed to register session", error);
  }
}

async function signOutAndRedirect(sid: string): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
  await supabase.schema("auth_app").from("sessions").delete().eq("id", sid);
  await supabase.auth.signOut();
  window.location.replace("https://auth.saka2931.jp/login");
}

// 他端末の「デバイス管理」からログアウトさせると、該当セッションのshould_logoutが
// trueになるので、それをSupabase Realtimeで監視して自動的にサインアウトする。
//
// RealtimeのWebSocketは切断されうるため、Realtimeを主経路としつつ、一定間隔で
// should_logoutを直接ポーリングするフォールバックを保険として併用する。
export default function AuthSessionWatcher() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      channel?.unsubscribe();
      channel = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      const user = session?.user;
      if (!user) return;

      void registerSession(user.id);
      const sid = localStorage.getItem(SESSION_KEY);
      if (!sid) return;

      pollTimer = setInterval(async () => {
        const { data } = await supabase
          .schema("auth_app")
          .from("sessions")
          .select("should_logout")
          .eq("id", sid)
          .maybeSingle();
        if (!cancelled && data?.should_logout === true) signOutAndRedirect(sid);
      }, POLL_INTERVAL_MS);

      channel = supabase
        .channel(`legallife-session-watch-${sid}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "auth_app", table: "sessions", filter: `id=eq.${sid}` },
          (payload) => {
            if (payload.new.should_logout === true) signOutAndRedirect(sid);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      channel?.unsubscribe();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return null;
}
