# Environment（legal&life）

Vercelダッシュボードの Project Settings → Environment Variables で設定する。

| 変数名 | 用途 | 必須 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクト(`saka2931-service`)のURL | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのpublishable(anon)キー | ○ |
| `NEXT_PUBLIC_SITE_URL` | サイトの本番URL(メタデータ・サイトマップ・robots生成に使用)。`https://legal-life.saka2931.jp`。未設定時は同URLにフォールバック | ○ |
| `GEMINI_API_KEY` | Gemini API(サーバー専用、`/api/chat`のみで参照) | ○ |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | Google Tag ManagerのコンテナID。未設定時はGTM自体を読み込まない | ○ |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4測定ID。Cookie拒否時の既存GA Cookie削除にのみ使用 | ○ |
| `NEXT_PUBLIC_INFRA_SUPABASE_URL` | `saka2931-infra`(adacと共有)プロジェクトのURL。お知らせ・機能フラグ(緊急メンテナンス含む)の取得に使用 | ○ |
| `NEXT_PUBLIC_INFRA_SUPABASE_ANON_KEY` | 同上のanonキー(読み取り専用) | ○ |

○ = 必須（コードが参照している変数は上表のみ）

## 関連する外部サービスプロジェクト

| サービス | プロジェクト/ID | 用途 |
|---|---|---|
| Supabase | `saka2931-service`(`legal_life`スキーマ、Sporive・authと共有) | アプリ本体データ(認証セッションはauthが発行) |
| Supabase | `saka2931-infra`(adac/statusと共有、読み取り専用) | 機能フラグ・お知らせ |
| Vercel | legal-lifeプロジェクト | ホスティング(`legal-life.saka2931.jp`) |
| Vercel | authプロジェクト(`auth.saka2931.jp`) | ログイン・アカウント管理(legal-lifeから転送) |
| Resend | `mail.saka2931.jp` | Supabase Authの認証メール(Custom SMTP。設定はauth側で管理。アプリからの送信は行わない) |

## 削除済みの環境変数（Vercelに残っていても動作に影響しない）

| 変数名 | 削除理由 |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ログイン関連がauthアプリへ移ったため（設定先はauth） |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | お問い合わせの受付・通知がserviceへ、会員向け通知メールは機能ごと削除したため。Supabase Custom SMTPのPasswordにResendキーを設定するのはSupabase側の設定 |
| `SITE_URL` | メール本文のリンク生成が不要になったため |

## Supabase Dashboard側で設定する項目（コードでは管理しない）

Authentication系（Site URL / Redirect URLs / Providers / CAPTCHA / MFA / SMTP）は **authアプリのための設定** で、`saka2931-service` 共有のためlegal-life単独で変更しない（正は authリポジトリの `docs/Setup.md`）。legal-lifeが依存するのは次の項目。

- Project Settings → Data API → Exposed schemas に `legal_life` と `auth_app`
- Database → Cron Jobs（`access_logs` / `chat_history` の日次削除）

詳細は [User Guide](User-Guide.md) を参照。
