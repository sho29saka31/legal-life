# Environment（legal&life）

Vercelダッシュボードの Project Settings → Environment Variables で設定する。

| 変数名 | 用途 | 必須 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクト(`saka2931-service`)のURL | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのpublishable(anon)キー | ○ |
| `NEXT_PUBLIC_SITE_URL` | サイトの本番URL(メタデータ・サイトマップ生成に使用)。`https://legal-life.saka2931.jp` | ○ |
| `GEMINI_API_KEY` | Gemini API(サーバー専用、`/api/chat`のみで参照) | ○ |
| `RESEND_API_KEY` | Resendのシークレットキー。Supabase Custom SMTPのPasswordにも同じ値を設定 | ○ |
| `RESEND_FROM_EMAIL` | `mail.saka2931.jp`上の送信元アドレス | ○ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare TurnstileのSite Key。未設定時はCAPTCHAウィジェット非表示 | 任意 |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | Google Tag ManagerのコンテナID。未設定時はGTM自体を読み込まない | ○ |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4測定ID。Cookie拒否時の既存GA Cookie削除にのみ使用 | ○ |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth 2.0クライアントID(Google One Tap用) | ○ |
| `NEXT_PUBLIC_INFRA_SUPABASE_URL` | `saka2931-infra`(adacと共有)プロジェクトのURL。お知らせ・機能フラグの取得に使用 | ○ |
| `NEXT_PUBLIC_INFRA_SUPABASE_ANON_KEY` | 同上のanonキー(読み取り専用) | ○ |
| `SITE_URL` | メール本文内のリンク生成等サーバー側で使用（`NEXT_PUBLIC_SITE_URL`とは別）。未設定時は`https://legal-life.saka2931.jp`にフォールバックする | 任意 |

○ = 現状必須 / 任意 = なくても動作する追加機能

## 関連する外部サービスプロジェクト

| サービス | プロジェクト/ID | 用途 |
|---|---|---|
| Supabase | `saka2931-service`(`legal_life`スキーマ、Sporiveと共有) | Auth・アプリ本体データ |
| Supabase | `saka2931-infra`(adac/statusと共有) | 機能フラグ・お知らせ・お問い合わせ |
| Vercel | legal-lifeプロジェクト | ホスティング(`legal-life.saka2931.jp`) |
| Resend | `mail.saka2931.jp` | メール送信(アプリ内 + Supabase Auth) |

Supabaseダッシュボード側で設定する項目(コードでは管理しない)は [User Guide](User-Guide) を参照。
