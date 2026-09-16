import { supabase } from "@/lib/supabase/client";
import { parseUA } from "@/lib/browserInfo";

// ログイン・ログアウト・端末管理はauth.saka2931.jpに一元化されたため、
// ここに残るのはlegal-life固有の操作(プロフィール変更・パスワード変更等)の
// アクティビティ履歴記録のみ。
export async function logAct(uid: string, type: string, detail = "") {
  try {
    const ua = parseUA();
    await supabase.from("activity_log").insert({
      user_id: uid,
      type,
      detail,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
    });
  } catch {
    /* ignore */
  }
}
