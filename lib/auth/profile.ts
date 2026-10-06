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
