"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { logAct } from "@/lib/auth/session";
import { listTotpFactors, challengeAndVerifyFirstFactor } from "@/lib/auth/mfa";
import { sendNoticeForUser } from "@/lib/auth/notifications";
import { validatePassword } from "@/lib/auth/utils";
import OtpPanel, { type OtpVerifyResult } from "@/components/OtpPanel";
import MdAccountCard from "@/components/material/MdAccountCard";
import MdButton from "@/components/material/MdButton";
import MdTextField from "@/components/material/MdTextField";
import { useSecurityGate, SecurityGateScreen } from "../SecurityGate";

export default function PassPage() {
  const { user, needsGate } = useSecurityGate();
  const [hasPassword, setHasPassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: string }>({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showReauthOtp, setShowReauthOtp] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHasPassword((user.identities ?? []).some((i) => i.provider === "email"));
  }, [user]);

  const finishPasswordChange = async () => {
    setCurrent("");
    setNewPass("");
    setConfirm("");
    setMsg({ text: "変更しました", type: "success" });
    await logAct(user!.id, "password_change", "");
    sendNoticeForUser(user!, "password_change", "パスワードが変更されました");
    setHasPassword(true);
  };

  /**
   * パスワード更新を1回試みる。Supabase側の「安全なパスワード変更」設定により
   * セッションが最近のログイン(24時間以内)とみなされない場合、
   * reauthentication_neededが返る(nonce未指定時のみ)。この場合は呼び出し元で
   * reauthenticate()により確認コードを送信し、ユーザーに入力させる必要がある。
   */
  const attemptPasswordUpdate = async (nonce?: string): Promise<{ needsReauth: boolean }> => {
    if (!nonce && hasPassword) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user!.email!, password: current });
      if (reauthError) throw new Error("現在のパスワードが間違っています");
    }
    const { error } = await supabase.auth.updateUser(
      nonce ? { password: newPass, nonce } : { password: newPass },
    );
    if (error) {
      if (error.code === "reauthentication_needed") return { needsReauth: true };
      throw error;
    }
    return { needsReauth: false };
  };

  /** 戻り値: 追加の確認コード入力待ち(reauthenticate)に遷移した場合はtrue */
  const execChange = async (): Promise<boolean> => {
    if (!user?.email) throw new Error("メールアドレスが設定されていません");
    try {
      const { needsReauth } = await attemptPasswordUpdate();
      if (needsReauth) {
        const { error: sendError } = await supabase.auth.reauthenticate();
        if (sendError) throw sendError;
        setShowReauthOtp(true);
        return true;
      }
      await finishPasswordChange();
      return false;
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), type: "error" });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleReauthOtpVerify = async (input: string): Promise<OtpVerifyResult> => {
    try {
      const { needsReauth } = await attemptPasswordUpdate(input);
      if (needsReauth) {
        // コードが誤っている・期限切れの場合、Supabaseは同じreauthentication_neededを
        // 返す。ユーザーが再入力できるよう新しいコードを送り直す。
        const { error: sendError } = await supabase.auth.reauthenticate();
        if (sendError) return { ok: false, reason: "確認コードの再送信に失敗しました" };
        return { ok: false, reason: "コードが正しくないか期限切れです。新しいコードを送信しました" };
      }
      await finishPasswordChange();
      setShowReauthOtp(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  };

  const handleSubmit = async () => {
    if (!newPass) return setMsg({ text: "新しいパスワードを入力してください", type: "error" });
    const pwError = validatePassword(newPass);
    if (pwError) return setMsg({ text: pwError, type: "error" });
    if (newPass !== confirm) return setMsg({ text: "パスワードが一致しません", type: "error" });
    if (hasPassword && !current) return setMsg({ text: "現在のパスワードを入力してください", type: "error" });

    setSubmitting(true);
    setMsg({ text: "", type: "" });
    // 二段階認証の登録有無の確認はフェイルクローズにする(app/account/delete/page.tsxと同じ理由)。
    // 以前使っていたhasMFA()はエラー時に「2FA未設定」としてfalseを返すフェイルオープン設計のため、
    // listTotpFactors()の通信が何らかの理由(回線不調や、悪意ある拡張機能等によるリクエスト妨害)で
    // 失敗しただけで、2FA登録済みアカウントでも本人確認(OTP)なしにパスワード変更が実行できてしまう。
    // 確認できない場合は変更を進めず、エラーを表示して中断する。
    let factorCount: number;
    try {
      factorCount = (await listTotpFactors()).length;
    } catch (e) {
      setSubmitting(false);
      setMsg({
        text:
          e instanceof Error
            ? `二段階認証の設定状況を確認できませんでした: ${e.message}`
            : "二段階認証の設定状況を確認できませんでした。時間をおいて再試行してください",
        type: "error",
      });
      return;
    }
    if (factorCount > 0) {
      setShowOtp(true);
      return;
    }
    await execChange();
  };

  const handleOtpVerify = async (input: string) => {
    const res = await challengeAndVerifyFirstFactor(input);
    if (!res.ok) {
      setSubmitting(false);
      return res;
    }
    // 追加の確認コード(reauthenticate)待ちに遷移した場合は、そちらのパネルへ
    // 差し替えるためこのTOTPパネルを閉じる。完了した場合もメイン画面(結果メッセージ)
    // に戻すため、いずれの場合もshowOtpは閉じてよい。
    await execChange();
    setShowOtp(false);
    return { ok: true };
  };

  if (needsGate) return <SecurityGateScreen title="パスワード" />;

  if (!user) return null;

  return (
    <MdAccountCard
      backHref="/account/security"
      backLabel="セキュリティに戻る"
      title={hasPassword ? "パスワードを変更する" : "パスワードを設定する"}
      subtitle="安全なパスワードでアカウントを保護しましょう"
    >
      {!showOtp && !showReauthOtp && (
        <div>
          {hasPassword && (
            <MdTextField
              id="current-password"
              label="現在のパスワード"
              type="password"
              autoComplete="current-password"
              containerClassName="mb-4"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
          <MdTextField
            id="new-password"
            label="新しいパスワード(8文字以上、大文字・小文字・数字・記号を含む)"
            type="password"
            autoComplete="new-password"
            containerClassName="mb-4"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <MdTextField
            id="confirm-password"
            label="パスワード(確認)"
            type="password"
            autoComplete="new-password"
            containerClassName="mb-3"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          {msg.text && (
            <p className={`text-m3-body-small mb-2 ${msg.type === "error" ? "text-md-error" : "text-[#146c2e]"}`}>{msg.text}</p>
          )}
          <MdButton variant="filled" className="w-full" disabled={submitting} onClick={handleSubmit}>
            {hasPassword ? "パスワードを変更する" : "パスワードを設定する"}
          </MdButton>
        </div>
      )}

      {showOtp && (
        <OtpPanel
          title="本人確認"
          desc="コードを入力してください"
          onVerify={handleOtpVerify}
          onCancel={() => {
            setShowOtp(false);
            setSubmitting(false);
          }}
        />
      )}

      {showReauthOtp && (
        <OtpPanel
          title="本人確認"
          desc="現在のメールアドレスに送信した確認コードを入力してください"
          length={8}
          onVerify={handleReauthOtpVerify}
          onCancel={() => {
            setShowReauthOtp(false);
            setSubmitting(false);
          }}
        />
      )}

      <div className="text-center mt-4">
        <Link href="/account/security" className="text-m3-body-medium text-md-on-surface-variant">セキュリティに戻る</Link>
      </div>
    </MdAccountCard>
  );
}
