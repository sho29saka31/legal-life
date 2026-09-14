# ユーザー対応ガイド

このドキュメントは、コード側の対応だけでは完結せず、**ユーザー様ご自身の操作が必要な項目**をまとめたものです。Supabase・Vercel・Cloudflare・Google関連のダッシュボード設定など、AIエージェントからは実行できない(または実行すべきでない)作業が対象です。

最終更新: 2026年9月14日

---

## 1. 対応状況の確認が必要なこと

### 1-1. Google Tag Manager: GA4タグの設定

GTM経由でGA4を計測する方式を採用しています。コード側の対応(Consent Mode v2、Cookie同意連動)は完了していますが、GTM管理画面側の設定状況は未確認です。

1. [Google Tag Manager](https://tagmanager.google.com/)で新規コンテナを作成(プラットフォーム: ウェブ)し、コンテナID(`GTM-XXXXXXX`)を`NEXT_PUBLIC_GTM_CONTAINER_ID`としてVercelに設定
2. GTM内で「タグ」→ 新規作成 → タグの種類「Google アナリティクス: GA4 設定」を選択し、測定ID(`G-...`)を入力
3. トリガーは「All Pages」を選択
4. 「詳細設定」→「同意設定」で、「追加の同意事項を確認する」を有効化し、`analytics_storage`を要求するタグとして設定(これによりConsent Mode経由でユーザーが同意するまでこのタグは発火しません)
5. 公開(Submit)して、GTMのプレビューモードでタグが発火することを確認
6. GA4側の測定IDを`NEXT_PUBLIC_GA_MEASUREMENT_ID`としてもVercelに設定(Cookie拒否時の削除ロジックで使用)

### 1-2. Supabase: Custom SMTP(Resend)の設定

メール送信をResendに一本化しました。このアプリ自身が送るメール(お問い合わせ通知・会員向け通知メール)は`RESEND_API_KEY`/`RESEND_FROM_EMAIL`経由で既にResendを使っていますが、**Supabase Auth自体が送るメール**(サインアップ確認・パスワードリセット・メールアドレス変更確認など)は別設定が必要です。sporive/legal-lifeは同一のSupabaseプロジェクト(`saka2931-service`)を共有しているため、この設定は両サービスの認証メールに共通で適用されます。

- 場所: Supabaseダッシュボード → Authentication → Emails → SMTP Settings
- 「Enable Custom SMTP」を有効化し、以下を入力:

| 項目 | 値 |
| --- | --- |
| Sender email | `mail.saka2931.jp`上のアドレス(例: `auth@mail.saka2931.jp`) |
| Sender name | 任意(例: legal&life) |
| Host | `smtp.resend.com` |
| Port | `465`(SSL)または`587`(STARTTLS) |
| Username | `resend`(固定文字列) |
| Password | Resendのシークレットキー(`RESEND_API_KEY`と同じ値) |

- Sender emailに使うドメイン(`mail.saka2931.jp`)がResend側で検証済み(SPF/DKIM/DMARC設定済み)である必要があります
- 未設定の間はSupabaseのデフォルト送信元(無料枠・低いレート制限)が使われ続けます

---

## 2. セキュリティ強化のための推奨設定(任意)

### 2-1. Cloudflare Turnstile(CAPTCHA)の有効化

1. [Cloudflareダッシュボード](https://dash.cloudflare.com/)でTurnstileウィジェットを新規作成
2. **Site Key** をVercelの環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` に設定
3. **Secret Key** をSupabaseダッシュボードの Authentication → Bot and Abuse Protection に設定
4. 未設定の間はCAPTCHAウィジェット自体が表示されず、認証機能自体には影響ありません

### 2-2. 漏洩パスワード保護の有効化

- 場所: Supabaseダッシュボード → Authentication → Policies (Password)
- 「Leaked password protection」を有効化すると、HaveIBeenPwned.orgと照合し、漏洩済みパスワードの使用を防げます
- 無料・設定のみで完結します

### 2-3. レートリミットの調整

- 場所: Supabaseダッシュボード → Authentication → Rate Limits

| 項目 | 対象 | カスタマイズ可否 |
| --- | --- | --- |
| サインアップ・パスワードリセット等のメール送信 | プロジェクト全体の合計 | カスタムSMTP設定時のみ変更可 |
| OTP送信 | プロジェクト全体の合計 / ユーザーごとの間隔 | 変更可 |
| サインアップ確認・パスワードリセットの再送間隔 | ユーザーごと | 変更可 |
| 確認(verify)・トークンリフレッシュ・MFAチャレンジ | IPアドレスごと | 変更不可(固定値) |

不正利用が心配な場合は、CAPTCHAを有効化した上でOTP/確認メールの送信間隔を広げるのが効果的です。

---

## 3. 未解決の問題

現時点で特にありません。

---

## 環境変数一覧

Vercelダッシュボードの Project Settings → Environment Variables で設定してください。

| 変数名 | 用途 | 必須 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクト(`saka2931-service`)のURL | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのpublishable(anon)キー | ○ |
| `NEXT_PUBLIC_SITE_URL` | サイトの本番URL(メタデータ・サイトマップ生成に使用)。`https://legal-life.saka2931.jp` | ○ |
| `GEMINI_API_KEY` | Gemini API(サーバー専用、`/api/chat`のみで参照) | ○ |
| `RESEND_API_KEY` | Resendのシークレットキー。Supabase Custom SMTP(1-2)のPasswordにも同じ値を設定 | ○ |
| `RESEND_FROM_EMAIL` | `mail.saka2931.jp`上の送信元アドレス(例: `legal-life@mail.saka2931.jp`) | ○ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare TurnstileのSite Key。未設定時はCAPTCHAウィジェット非表示 | 任意(2-1参照) |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | Google Tag ManagerのコンテナID(`GTM-`から始まる)。未設定時はGTM自体を読み込まない | ○(1-1参照) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GTM内で設定するGA4設定タグの測定ID(`G-`から始まる)。Cookie拒否時の既存GA Cookie削除にのみ使用 | ○(再設定時は要更新) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth 2.0クライアントID(Google One Tap用、`.apps.googleusercontent.com`で終わる)。Supabase側のGoogle Provider設定にも同じ値の登録が必要 | ○(再設定時は要更新) |
| `NEXT_PUBLIC_INFRA_SUPABASE_URL` | `saka2931-infra`(adacと共有)プロジェクトのURL。お知らせ・機能フラグの取得に使用 | ○ |
| `NEXT_PUBLIC_INFRA_SUPABASE_ANON_KEY` | 同上のanonキー(読み取り専用) | ○ |

○ = 現状必須 / 任意 = なくても動作する追加機能
