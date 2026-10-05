# User Guide: Security Recommendations（legal&life）

[User Guide](User-Guide.md) の一部。セキュリティ強化のための推奨設定(任意)(§2)。

## 2-1. Cloudflare Turnstile(CAPTCHA)の有効化

> **現行**：CAPTCHAはログインを担当する **authアプリ** の機能で、`auth.saka2931.jp` 専用のTurnstileサイトを使う(legal-lifeの環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` は削除済み)。設定手順は authリポジトリの `docs/Setup.md` §3。Secret KeyはSupabaseダッシュボードの Authentication → Bot and Abuse Protection(CAPTCHA)に設定する。

## 2-2. 漏洩パスワード保護（利用不可）

- Supabaseの「Leaked password protection」（HaveIBeenPwned.orgとの照合）は **有料プラン向けの機能のため、現在のプランでは利用できない**。有効化しない（できない）前提で運用する
- 代わりの対策：パスワードの強度要件（Supabase側のPassword Requirementsとauthアプリ側の検証）、CAPTCHA（Turnstile）、MFA（TOTP）・パスキーの利用推奨で補う
- 有料プランへ移行した場合は、Authentication → Policies (Password) で有効化する

## 2-3. レートリミットの調整

- 場所: Supabaseダッシュボード → Authentication → Rate Limits

| 項目 | 対象 | カスタマイズ可否 |
| --- | --- | --- |
| サインアップ・パスワードリセット等のメール送信 | プロジェクト全体の合計 | カスタムSMTP設定時のみ変更可（**Resend SMTPは設定済みのため変更できる。現在は未調整の可能性があり要確認**） |
| OTP送信 | プロジェクト全体の合計 / ユーザーごとの間隔 | 変更可 |
| サインアップ確認・パスワードリセットの再送間隔 | ユーザーごと | 変更可 |
| 確認(verify)・トークンリフレッシュ・MFAチャレンジ | IPアドレスごと | 変更不可(固定値) |

不正利用が心配な場合は、CAPTCHAを有効化した上でOTP/確認メールの送信間隔を広げるのが効果的です。
