# Architecture（legal&life）

## 概要

`legal-life.saka2931.jp` は、法令の学習・相談を身近にすることを目指す法令学習・検索・AIチャットサイト。Next.js(App Router) + TypeScript + Tailwind CSSで構築され、Supabase(PostgreSQL, Realtime)を使用する。**ログイン・アカウント管理は `auth.saka2931.jp`（authリポジトリ）に一元化されており、legal-life自身は認証画面・アカウント画面を持たない。**

## システム構成図（論理）

```
[ブラウザ]
    │
    ▼
Next.js (Vercel, App Router)
    │  middleware.ts … 緊急メンテナンス時のみ全ページを /maintenance へリダイレクト
    │
    ├── /                  トップ(ホーム)
    ├── /content/search    e-Gov法令API連携の法令検索 (公開)
    ├── /content/{study,chat,news}  学習・AIチャット・ニュース (正式公開前。ナビからは「準備中」ポップアップ)
    ├── /api/chat          Gemini API連携 (サーバー側のみ。未認証でも呼べる、IP単位レート制限)
    ├── /info, /info/details/[slug]  お知らせ (saka2931-infra参照、動的)
    ├── /info/{about,faq,history,map}  サイト概要・FAQ・沿革・サイトマップ
    ├── /law/*, /info/contact  → service.saka2931.jp の同名ページへリダイレクト
    ├── /plan, /welcome    料金・ウェルカム (/welcome のみ要ログイン)
    ├── /maintenance       メンテナンス表示 (503)
    ├── 404 / 500          not-found.tsx / error.tsx / global-error.tsx
    │
    ├── アカウント操作 ──▶ https://auth.saka2931.jp/account など (ヘッダーのリンクで遷移)
    │
    ├── Supabase Auth (@supabase/ssr, ブラウザ側クライアント)
    │     セッションCookieは auth が発行 (.saka2931.jp) 。legal-life は読み取り・利用のみ
    │
    └── Supabase Postgres (saka2931-service プロジェクト, schema=legal_life)
          ├─ profiles (photo_url, role) / access_logs / chat_history
          ├─ pg_cron: access_logs(90日)・chat_history(180日) の日次削除
          └─ RLS: maintenance_lockdown (緊急メンテナンス時に anon/authenticated を拒否)

他システムとの連携:
   auth.saka2931.jp ── ログイン/登録/MFA/パスキー/アカウント削除、表示名 (GET/PATCH /api/profile)
   saka2931-infra プロジェクト (adac/statusと共有、読み取り専用)
     ├─ feature_flags         (緊急メンテナンス・account_features・ai_chat)
     └─ service_announcements (お知らせ)
   service.saka2931.jp ── プライバシーポリシー・利用規約・Cookie・免責・お問い合わせ
   status.saka2931.jp  ── 稼働状況ページ (500/メンテナンス画面からリンク)
```

## 主要な設計判断

- **saka2931-serviceプロジェクトをSporive・authと共有**：`legal_life`スキーマで論理分離。RLS + スキーマ単位のGRANTで越境アクセスを防止（GRANT漏れは過去に障害化した実績があるため、新規スキーマ作成時は必ずセットで発行する。`service_role`への付与も必要）
- **認証はauthアプリに委譲**：legal-lifeが持つのは「未ログインなら auth へ `return_to` 付きで転送」（`lib/auth/requireAuth.ts`）と、アプリ固有データ（`profiles.photo_url` / `role`）だけ。表示名は `lib/auth/profile.ts` が auth の `/api/profile` を `credentials: "include"` で呼んで読み書きする（[ADR](ADR.md) ADR-010）
- **SSO**：CookieドメインはSporive・authと同一の`.saka2931.jp`。同一Supabaseプロジェクトの認証セッションを共有する
- **認証状態の判定はブラウザ側**：`@supabase/ssr` のブラウザクライアントで完結し、middlewareではセッションを扱わない（Sporiveとの実装上の違い）。ログイン必須ページは現在 `/welcome` のみで、`requireAuth()` が未ログインを auth へ転送する
- **middlewareは緊急メンテナンスの判定のみ**：adacで有効化されると、静的アセット・`/api`・`/admin`・`/maintenance`・`robots.txt`・`sitemap.xml` 以外の全ページを `/maintenance` へリダイレクトする。判定に失敗した場合は「止めない」側に倒れる（フェイルオープン）
- **緊急メンテナンスの二重化**：ページ転送に加え、`saka2931-service` のRLS（`maintenance_lockdown`）が anon/authenticated の直接アクセスを拒否する。管理者（`legal_life.is_admin()`）とservice_roleは対象外（[ADR](ADR.md) ADR-011）
- **端末管理**：`AuthSessionWatcher` が `auth_app.sessions` にこの端末を登録・監視し、authの「ログイン中のデバイス」から強制ログアウトされるとサインアウトして auth のログイン画面へ送る（旧 `SessionWatcher` の後継）
- **お問い合わせ・プライバシーポリシー・利用規約の集約**：`service.saka2931.jp`に一本化し、`/law/*`・`/info/contact` は互換リダイレクトのみ
- **メール**：アプリ自身からの送信は行わない（会員向け通知メール機能は2026-09-16に削除）。認証メールはSupabase Auth（Custom SMTP、設定はauth側の管理）
- **アクセス解析**：GTM経由のGA4（Consent Mode v2連動。[User Guide Pending Actions](User-Guide-Pending-Actions.md)）に加え、`@vercel/analytics`・`@vercel/speed-insights`を導入済み（Vercelダッシュボードで有効化が必要）
- **Geminiモデル名はコード内に固定**：Sporive（`GEMINI_MODEL`環境変数）と異なり、`/api/chat` 内で `gemini-3.5-flash` を直接指定。モデル変更時はコード修正が必要
- **データ保持ポリシー**：`access_logs`（90日）・`chat_history`（180日）はpg_cronで日次自動削除。未ログイン時のチャット履歴はブラウザのlocalStorageのみ。アクティビティ履歴・端末情報はauth側（`auth_app`）が管理する
- **RLSのカラム単位保護**：`profiles.role` など、本人が更新できると権限昇格につながるカラムには、行レベルのRLSに加えBEFORE UPDATEトリガーでカラム単位の追加チェックを行う（[ADR](ADR.md) ADR-006）
- **公開INSERTテーブルの上限**：`access_logs` は未認証でもINSERTできるため、列の長さ・jsonbサイズのCHECK制約とIP単位のレート制限トリガーを設ける（[ADR](ADR.md) ADR-009）

## SEO・公開ページ

- 公開対象（`sitemap.ts`）：`/` `/content` `/content/search` `/info` `/info/about` `/info/faq`。`robots.ts` は `/content/{chat,news,study}` `/plan` `/info/history` `/api` `/welcome` `/maintenance` をDisallow（正式公開前の機能・要ログイン・メンテナンス表示）
- メタデータは `lib/seo.ts`（`pageMetadata()`）で一元化。OGP・Twitterカード・canonicalを全ページで設定（2026-10-04）
- 基準URLは `NEXT_PUBLIC_SITE_URL`（未設定時は `https://legal-life.saka2931.jp`）

## ディレクトリ構成（主要部分）

`src/`ディレクトリを持たず、`app/`がリポジトリ直下にある点がSporive等他リポジトリと異なる。

```
legal-life/
├── middleware.ts            # 緊急メンテナンス判定
├── app/
│   ├── content/{study,search,chat,news}/
│   ├── info/{about,contact,details,faq,history,map}/  # お知らせ・サイト概要 (contactはリダイレクト)
│   ├── law/{privacy,terms,cookie,disclaimer}/         # serviceへのリダイレクト
│   ├── plan/, welcome/, maintenance/
│   ├── error.tsx, global-error.tsx, not-found.tsx
│   └── api/chat/                # Gemini APIサーバー処理
├── components/                  # Header / Footer / ErrorPage / AuthSessionWatcher / CookieBanner ほか
├── lib/
│   ├── supabase/                # client / serverClient / infra(読み取り専用) / types
│   ├── auth/                    # requireAuth(authへ転送) / profile(authの/api/profile経由)
│   ├── announcements.ts         # お知らせ取得(saka2931-infra参照)
│   ├── feature-flags.ts         # 機能フラグ取得(saka2931-infra参照)
│   ├── lawSearch.ts             # e-Gov法令API連携
│   ├── sanitizeHtml.ts          # お知らせ本文のサニタイズ(sanitize-html)
│   ├── seo.ts / consent.ts      # メタデータ / Cookie同意・Consent Mode v2
│   └── browserInfo.ts / deviceInfo.ts
├── supabase/migrations/         # SQLマイグレーション（手動適用）
├── docs/                        # ドキュメント一式
└── data/
```

環境変数は [Environment](ENVIRONMENT.md) を、変更履歴は [CHANGELOG](CHANGELOG.md) を参照。
