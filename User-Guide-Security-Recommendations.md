# User Guide: Security Recommendations（legal&life）

[User Guide](User-Guide) の一部。セキュリティ強化のための推奨設定(任意)(§2)。

## 2-1. Cloudflare Turnstile(CAPTCHA)の有効化

1. [Cloudflareダッシュボード](https://dash.cloudflare.com/)でTurnstileウィジェットを新規作成
2. **Site Key** をVercelの環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` に設定
3. **Secret Key** をSupabaseダッシュボードの Authentication → Bot and Abuse Protection に設定
4. 未設定の間はCAPTCHAウィジェット自体が表示されず、認証機能自体には影響ありません

## 2-2. 漏洩パスワード保護の有効化

- 場所: Supabaseダッシュボード → Authentication → Policies (Password)
- 「Leaked password protection」を有効化すると、HaveIBeenPwned.orgと照合し、漏洩済みパスワードの使用を防げます
- 無料・設定のみで完結します

## 2-3. レートリミットの調整

- 場所: Supabaseダッシュボード → Authentication → Rate Limits

| 項目 | 対象 | カスタマイズ可否 |
| --- | --- | --- |
| サインアップ・パスワードリセット等のメール送信 | プロジェクト全体の合計 | カスタムSMTP設定時のみ変更可 |
| OTP送信 | プロジェクト全体の合計 / ユーザーごとの間隔 | 変更可 |
| サインアップ確認・パスワードリセットの再送間隔 | ユーザーごと | 変更可 |
| 確認(verify)・トークンリフレッシュ・MFAチャレンジ | IPアドレスごと | 変更不可(固定値) |

不正利用が心配な場合は、CAPTCHAを有効化した上でOTP/確認メールの送信間隔を広げるのが効果的です。
