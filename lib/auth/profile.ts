import { supabase } from "@/lib/supabase/client";

const AUTH_APP_URL = "https://auth.saka2931.jp";

export type Profile = {
  display_name: string | null;
  photo_url: string | null;
  role: string;
};

/** display_nameは全サービス共通データのため、auth.saka2931.jpの/api/profile経由でのみ読み書きする。 */
async function getDisplayName(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_APP_URL}/api/profile`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string | null };
    return typeof data.display_name === "string" ? data.display_name : null;
  } catch {
    return null;
  }
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const [{ data }, displayName] = await Promise.all([
    supabase.from("profiles").select("photo_url, role").eq("id", uid).maybeSingle(),
    getDisplayName(),
  ]);
  if (!data) return null;
  return { display_name: displayName, photo_url: data.photo_url, role: data.role };
}

// 呼び出し元(プロフィール編集ページ)がtry/catchで失敗を検知できるよう、
// 更新の成否をboolean で返す(以前のSupabaseエラーthrowと同じ理由: 失敗を
// 握りつぶすと保存に失敗していても画面上は成功したかのように見えてしまう)。
export async function updateDisplayName(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_APP_URL}/api/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
