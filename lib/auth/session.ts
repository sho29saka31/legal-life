import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { fetchLocation, parseUA } from "@/lib/browserInfo";
import { getSid, SESSION_KEY } from "./utils";

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

export async function regSession(user: Pick<User, "id">) {
  try {
    // getSid()はlocalStorageへアクセスするため、プライベートブラウジングやストレージが
    // ブロックされた環境では例外を投げ得る。この関数はログイン処理をブロックしない
    // 「失敗しても無視する」設計のため、try内に含めてまとめて捕捉する
    // (以前はtryの外にあり、ここで投げるとログイン後のリダイレクトごと失敗しかねなかった)。
    const sid = getSid();
    const ua = parseUA();
    // 以前は id=sid のみで既存行を検索しており、共有端末で別ユーザーがログイン
    // すると、そのsidの行はRLS(sessions_select_own)により見えず常にnull(existing)
    // になっていた。その結果INSERTを試み、主キー(id)衝突で例外(捕捉され無視)が
    // 発生し、後から使ったユーザーのセッションがDBに一切登録されない不具合があった
    // (コード監査で発見)。user_idも条件に含めて自分の行かどうかを判定する。
    const { data: existing } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", sid)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from("sessions").update({ last_active: new Date().toISOString() }).eq("id", sid);
      return;
    }

    const loc = await fetchLocation();
    const { error } = await supabase.from("sessions").insert({
      id: sid,
      user_id: user.id,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      location: loc.country,
    });

    if (error?.code === "23505") {
      // sidが別ユーザー所有(RLSにより見えないだけ)で一意制約違反になった場合、
      // 共有端末での取り違えを避けるため新しいsidを発行してやり直す
      const newSid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, newSid);
      await supabase.from("sessions").insert({
        id: newSid,
        user_id: user.id,
        browser: ua.browser,
        os: ua.os,
        device: ua.device,
        location: loc.country,
      });
    }
  } catch {
    /* ignore */
  }
}

export async function delSession(user: Pick<User, "id">) {
  try {
    const sid = localStorage.getItem(SESSION_KEY);
    if (sid) {
      await supabase.from("sessions").delete().eq("id", sid).eq("user_id", user.id);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}
