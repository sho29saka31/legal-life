import { Resend } from "resend";

let resendClient: Resend | undefined;

// Resend経由でメールを送信する。RESEND_FROM_EMAILはmail.saka2931.jp
// (SPF/DKIM/DMARC設定済み、adacと共有のドメイン)上のアドレスを指定する。
function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY が設定されていません。");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type MailType = "notice";

export function buildSubject(_type: MailType, purpose?: string): string {
  return `【legal&life】${purpose || "重要なお知らせ"}`;
}

function layout(bodyHtml: string): string {
  const siteUrl = process.env.SITE_URL || "https://legal-life.vercel.app";
  const siteLabel = siteUrl.replace(/^https?:\/\//, "");
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;max-width:520px;width:100%;">
<tr><td style="background:#00C8E9;padding:24px 32px;border-radius:12px 12px 0 0;">
  <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">legal&amp;life</p>
</td></tr>
<tr><td style="padding:32px;">
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px;">
  <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">
    このメールは legal&amp;life から自動送信されています。<br>
    心当たりがない場合は無視してください。<br>
    <a href="${siteUrl}" style="color:#00C8E9;">${esc(siteLabel)}</a>
  </p>
</td></tr></table></td></tr></table></body></html>`;
}

export function buildNoticeHTML({ to_name, purpose }: { to_name?: string; purpose?: string }): string {
  const n = esc(to_name || "ユーザー");
  return layout(`
<p style="margin:0 0 16px;color:#334155;font-size:15px;">${n} 様</p>
<p style="margin:0;color:#475569;font-size:15px;line-height:1.8;">
  ${esc(purpose || "")}
</p>`);
}

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL が設定されていません。");
  const { error } = await getResendClient().emails.send({
    from: `legal&life <${from}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) throw new Error(`メール送信に失敗しました: ${error.message}`);
}
