"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { requireAuth } from "@/lib/auth/requireAuth";
import { logAct } from "@/lib/auth/session";
import { getProfile, type Profile } from "@/lib/auth/profile";
import { IconPerson, IconBell, IconClipboard } from "@/components/icons";
import MdAccountCard from "@/components/material/MdAccountCard";

// ログイン・メールアドレス・パスワード・MFA・パスキー・デバイス管理・
// アカウント削除はauth.saka2931.jpに一元化されているため、legal-life自身の
// メニューには含めず、authアプリのアカウント設定ハブへのリンクのみ提供する。
const AUTH_APP_ACCOUNT_URL = "https://auth.saka2931.jp/account";

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const u = await requireAuth();
      setUser(u);
      setProfile(await getProfile(u.id));
    })();
  }, []);

  const handleLogout = async () => {
    if (user) await logAct(user.id, "logout", "");
    await supabase.auth.signOut();
    window.location.replace("https://auth.saka2931.jp/login");
  };

  if (!user) return null;

  const lastSignIn = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "--";

  return (
    <MdAccountCard title="アカウント設定">
      <div className="flex items-start gap-4 rounded-m3-md bg-md-surface-container p-4 mb-6">
        {profile?.photo_url ? (
          <Image src={profile.photo_url} alt="avatar" width={64} height={64} className="rounded-full object-cover border-2 border-md-primary shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-md-surface-container-high flex items-center justify-center shrink-0">
            <IconPerson className="w-8 h-8 text-md-on-surface-variant" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="mb-1.5">
            <span className="block text-m3-label-small text-md-on-surface-variant uppercase tracking-wide">アカウント名</span>
            <span className="block text-m3-body-medium font-bold text-md-on-surface truncate">{profile?.display_name || "名前未設定"}</span>
          </div>
          <div>
            <span className="block text-m3-label-small text-md-on-surface-variant uppercase tracking-wide">メールアドレス</span>
            <span className="block text-m3-body-medium font-bold text-md-on-surface truncate">{user.email || "（未設定）"}</span>
          </div>
          <p className="text-m3-body-small text-md-on-surface-variant mt-2">最終ログイン: {lastSignIn}</p>
        </div>
      </div>

      <nav className="flex flex-col mb-6 border-t border-md-outline-variant">
        {[
          { href: "/account/profile", icon: IconPerson, label: "プロフィール", sub: "表示名・メール確認・アカウント削除" },
          { href: "/account/privacy", icon: IconBell, label: "通知・プライバシー", sub: "メール通知・ニュースレター設定" },
          { href: "/account/activity", icon: IconClipboard, label: "アクティビティ", sub: "ログイン・設定変更の履歴(最大1年)" },
        ].map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center gap-3.5 py-4 border-b border-md-outline-variant hover:bg-md-surface-container -mx-2 px-2 rounded-m3-sm transition-colors"
          >
            <span className="w-9 h-9 rounded-full bg-md-primary-container flex items-center justify-center shrink-0">
              <m.icon className="w-[18px] h-[18px] text-md-on-primary-container" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-m3-body-medium text-md-on-surface">{m.label}</p>
              <p className="text-m3-body-small text-md-on-surface-variant mt-0.5">{m.sub}</p>
            </div>
            <span className="text-md-outline shrink-0">›</span>
          </Link>
        ))}
        <a
          href={AUTH_APP_ACCOUNT_URL}
          className="flex items-center gap-3.5 py-4 border-b border-md-outline-variant hover:bg-md-surface-container -mx-2 px-2 rounded-m3-sm transition-colors"
        >
          <span className="w-9 h-9 rounded-full bg-md-primary-container flex items-center justify-center shrink-0">
            <IconPerson className="w-[18px] h-[18px] text-md-on-primary-container" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-m3-body-medium text-md-on-surface">アカウント</p>
            <p className="text-m3-body-small text-md-on-surface-variant mt-0.5">
              メールアドレス・パスワード・二段階認証・パスキー・デバイス管理・アカウント削除
            </p>
          </div>
          <span className="text-md-outline shrink-0">›</span>
        </a>
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center justify-center w-full h-10 rounded-full border border-md-outline text-md-primary text-m3-label-large font-medium hover:bg-md-primary/8 transition-colors"
      >
        ログアウト
      </button>
      <div className="text-center mt-4">
        <Link href="/" className="text-m3-body-small text-md-on-surface-variant">ホームへ戻る</Link>
      </div>
    </MdAccountCard>
  );
}
