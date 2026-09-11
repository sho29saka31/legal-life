import { NextRequest, NextResponse } from "next/server";
import { buildNoticeHTML, buildSubject, sendMail } from "@/lib/mail/resend";
import { supabaseServer as supabase } from "@/lib/supabase/serverClient";
import { getFeatureFlag } from "@/lib/feature-flags";

// notice(会員向け通知)側は認証済みユーザーであれば
// 誰でも呼べてしまうため、巨大なpurpose/to_name等を送りつけて肥大化したメールを大量生成
// させることができてしまう。to_email自体は正規の呼び出し元(email_change等)で任意の宛先
// (変更先の未確認メールアドレス)になり得るため制限できないが、各フィールドの長さは制限する。
const NOTICE_MAX_LENGTHS: Record<string, number> = {
  to_email: 254,
  to_name: 100,
  purpose: 300,
};

// Resend SDKは"a@x.com,b@y.com"のようなカンマ区切り文字列を複数の宛先として
// 解釈する。to_emailは単一の宛先を想定した値であり、これをそのままsendMail()の
// "to"へ渡すと、認証済みユーザーが1回のリクエストで(長さ254文字の上限内で)
// カンマ区切りの複数アドレスを詰め込むことができ、NOTICE_RATE_LIMIT_MAX_REQUESTS
// によるユーザー単位のレート制限を実質的にバイパスして多数の第三者へメールを
// 送りつけられてしまう。単一のメールアドレス形式であることをここで検証する。
const SINGLE_EMAIL_RE = /^[^\s,<>]+@[^\s,<>]+\.[^\s,<>]+$/;

// フィールドが文字列型でない場合(配列・オブジェクト等)、これまでは長さチェックを
// 素通りしてしまい、NOTICE_MAX_LENGTHSが本来防ぐはずの巨大ペイロード
// (ネストしたJSONオブジェクト等、文字列のlengthでは測れない値)をメール本文への
// 埋め込みに使えてしまっていた。存在する値は文字列型であることも合わせて要求する。
function findInvalidField(params: Record<string, unknown>, limits: Record<string, number>): string | null {
  for (const [field, max] of Object.entries(limits)) {
    const value = params[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > max) return field;
  }
  return null;
}

// notice送信は認証済みユーザーなら誰でも呼べ、Bearer検証(Round1)は「未ログインの第三者」
// からの乱用しか防げない。to_emailは正規のユースケース(メールアドレス変更確認等)で
// 呼び出し元ユーザー自身のアドレスと一致しないことがあるため宛先を本人メールに固定できず、
// 制限なしだと本サイトのGmailアカウントを使って認証済みユーザーが任意の第三者へ大量の
// メールを送りつける踏み台(スパム/なりすまし)に悪用され得る。ユーザーID単位の
// インメモリ・スライディングウィンドウで送信頻度を抑える(chat/route.tsのIP制限と同様、
// サーバーレスの複数インスタンスでは完全な防御にはならないが最低限の抑止力とする)。
const NOTICE_RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const NOTICE_RATE_LIMIT_MAX_REQUESTS = 5;
const noticeRequestTimestamps = new Map<string, number[]>();

function isNoticeRateLimited(uid: string): boolean {
  const now = Date.now();
  const timestamps = (noticeRequestTimestamps.get(uid) || []).filter(
    (t) => now - t < NOTICE_RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= NOTICE_RATE_LIMIT_MAX_REQUESTS) {
    noticeRequestTimestamps.set(uid, timestamps);
    return true;
  }
  timestamps.push(now);
  noticeRequestTimestamps.set(uid, timestamps);
  return false;
}

// メール送信API。旧 legal-life-mailer (Cloudflare Workers) の api/index.js を統合したもの。
// 送信はResend経由(mail.saka2931.jpドメインで送信元アドレスを検証済み)。
// お問い合わせフォームはservice.saka2931.jp/contact/legal-lifeに統合されたため、
// このAPIはnotice(会員向け通知)専用。

export async function POST(req: NextRequest) {
  // adacの管理画面で「メール送信機能」を停止している間は、お問い合わせ・会員向け
  // 通知のいずれも送信せず、その旨を呼び出し元(フォーム等)へ明示的に伝える。
  if (!(await getFeatureFlag("mail_sending"))) {
    return NextResponse.json(
      { error: "現在メール送信機能を停止しているため、メールを送信できません。時間をおいて再度お試しください。" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as string | undefined;
  if (!type) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  if (type !== "notice") {
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  }

  try {
    // notice: 会員向け通知メール。任意の宛先へメールを送れてしまう不正中継(オープンリレー)を
    // 防ぐため、認証済みユーザーのリクエストのみを受け付ける(送信元アドレス自体は限定しないが、
    // 未ログインの第三者が任意の宛先へ本サイトのGmailアカウントから送信することを防止する)。
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (isNoticeRateLimited(authData.user.id)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待ってから再度お試しください。" },
        { status: 429 },
      );
    }

    const to_email = body.to_email;
    if (typeof to_email !== "string" || !to_email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!SINGLE_EMAIL_RE.test(to_email)) {
      return NextResponse.json({ error: "to_emailが不正です" }, { status: 400 });
    }

    const invalidNoticeField = findInvalidField(body, NOTICE_MAX_LENGTHS);
    if (invalidNoticeField) {
      return NextResponse.json(
        { error: `${invalidNoticeField}が不正です(最大${NOTICE_MAX_LENGTHS[invalidNoticeField]}文字の文字列)` },
        { status: 400 },
      );
    }

    const purpose = body.purpose as string | undefined;
    const html = buildNoticeHTML({ to_name: body.to_name as string | undefined, purpose });

    await sendMail({ to: to_email, subject: buildSubject("notice", purpose), html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // err.messageはResend側の内部エラー文言(APIキー不正の詳細等)をそのまま含み得る。
    // クライアントへ返すと内部インフラの手がかりを与えてしまうため、詳細は
    // サーバーログにのみ残し、クライアントへは汎用メッセージだけを返す。
    console.error("Mail delivery failed:", err);
    return NextResponse.json({ error: "Mail delivery failed" }, { status: 500 });
  }
}
