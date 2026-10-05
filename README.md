# legal&life

`legal-life.saka2931.jp` — 法令の学習・相談を身近にすることを目指す、法令学習・検索・AIチャットサイト。

サイト概要は [`/info/about`](https://legal-life.saka2931.jp/info/about) を参照してください。

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)

## ライセンスについて

本リポジトリはソースコードを公開しておりますが、再利用・複製・改変・再配布は許可していません。閲覧のみでの利用に限ります。

This repository provides the source code, but reuse, copying, modification, and redistribution are not permitted. Use is limited to viewing only.

## 主な機能

| 機能 | パス | 状態 |
|---|---|---|
| 法令検索 | `/content/search` | 公開中。e-Gov法令API（APIキー不要）を利用 |
| AIチャット | `/content/chat` | 正式公開前。Gemini APIを利用（サーバー側 `/api/chat` 経由のみ。APIキーは露出しない） |
| 法令学習 | `/content/study` | 正式公開前 |
| ニュース | `/content/news` | 正式公開前 |
| お知らせ | `/info` `/info/details/[slug]` | 公開中。adacの管理画面から配信、ヘッダーバナーにも表示 |
| サイト概要・FAQ・沿革 | `/info/about` `/info/faq` `/info/history` | 公開中（沿革は非公開） |
| ウェルカム | `/welcome` | 要ログイン（初回ログイン後の案内） |

正式公開前のページは、サイト内ナビゲーションからは「準備中」ポップアップになり、`robots.txt` でもクロールを抑制している。

### アカウント機能について

**ログイン・新規登録・パスワード再設定・多要素認証（TOTP）・パスキー・ログイン端末の管理・アクティビティ履歴・アカウント削除は、すべて `auth.saka2931.jp`（[authリポジトリ](https://github.com/sho29saka31/auth)）が提供します。** legal-life自身にはアカウント画面がなく、未ログインで要ログインページを開くと `auth.saka2931.jp/login?return_to=<元のURL>` へ転送され、認証後に戻ります。ヘッダーの「アカウント」も auth の `/account` へのリンクです。

## saka2931.jpドメインとの連携

| 連携先 | 内容 |
|---|---|
| [auth](https://github.com/sho29saka31/auth) | 認証・アカウント管理。`.saka2931.jp` スコープのCookieでセッションを共有（SSO）。表示名は `GET/PATCH /api/profile` 経由 |
| [adac](https://github.com/sho29saka31/adac) | 機能フラグ・緊急メンテナンス・お知らせの管理画面 |
| `saka2931-infra`（Supabase） | `service_announcements`・`feature_flags` を読み取り専用（anonキー）で参照 |
| [service](https://github.com/sho29saka31/service) | プライバシーポリシー・利用規約・Cookie・免責・お問い合わせ（`/law/*` と `/info/contact` はそちらへリダイレクト） |
| [status](https://github.com/sho29saka31/status) | 稼働状況の公開ページ（500・メンテナンス画面からリンク） |
| [Sporive](https://github.com/sho29saka31/Sporive) | 兄弟アプリ。同じ `saka2931-service` プロジェクトを共有（スキーマは `legal_life` / `sporive` / `auth_app` で分離） |

## 運用の仕組み

- **緊急メンテナンス**：adacで有効化すると、全ページ（静的アセット・API・管理画面を除く）について、URLを変えずに `/maintenance` の画面が HTTP 503（`Retry-After: 600`）で返され、稼働状況ページにも自動で反映される。DB側もRLS（`maintenance_lockdown`）で anon/authenticated の直接アクセスを拒否する。管理者とservice_roleは対象外。取得失敗時は止めない（フェイルオープン）
- **機能フラグ**：`ai_chat` をOFFにすると `/api/chat` が503を返す
- **データ保持**：`access_logs` は90日、`chat_history` は180日でpg_cronが日次削除。未ログイン時のチャット履歴はブラウザのlocalStorageのみ
- **エラー画面**：404・500・メンテナンスの専用画面（500とメンテナンスには稼働状況ページへのリンク）

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript（`app/` がリポジトリ直下）
- **スタイル**: Tailwind CSS v3（`next/font/local` でBIZUDGothicを自己ホスト化）
- **データベース**: Supabase（PostgreSQL、`saka2931-service` プロジェクトの `legal_life` スキーマ）。ブラウザ側で `@supabase/ssr` のクライアントを使用
- **AIチャット**: Gemini API（`gemini-3.5-flash`、サーバー側 `/api/chat`、IP単位のレート制限）
- **法令検索**: e-Gov法令API
- **お知らせ本文のサニタイズ**: `sanitize-html`
- **アクセス解析**: Google Tag Manager経由のGA4（Consent Mode v2対応）、Vercel Analytics / Speed Insights
- **ホスティング**: Vercel

## ディレクトリ構成

```
legal-life/
├── middleware.ts       # 緊急メンテナンス判定
├── app/                # ページ・Route Handler（content / info / law / plan / welcome / maintenance / api/chat）
├── components/         # Header・Footer・ErrorPage・AuthSessionWatcher・CookieBanner ほか
├── lib/                # supabase / auth(requireAuth・profile) / announcements / feature-flags / lawSearch / seo ほか
├── supabase/migrations/# SQLマイグレーション（SQL Editorで日時順に手動適用）
├── docs/               # ドキュメント一式
└── data/               # FAQなどの静的データ
```

## 開発

```bash
npm install
touch .env.local   # 値は docs/ENVIRONMENT.md を参照（サンプルファイルはGitHubに置かない方針）
npm run dev                        # http://localhost:3000
```

```bash
npm run lint
npx tsc --noEmit
npm run build
```

ログインは `auth.saka2931.jp` に転送されます。Cookieのドメインが `.saka2931.jp` のため、ローカル開発ではログイン状態を再現できません（本番/プレビュー環境で確認）。外部サービスの設定は [docs/User-Guide.md](docs/User-Guide.md)、デプロイは [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## ドキュメント

リポジトリは非公開のため、ドキュメントはGitHub Wikiではなく `docs/` で管理している（目次は [docs/Home.md](docs/Home.md)）。

| ドキュメント | 内容 |
|---|---|
| [docs/Home.md](docs/Home.md) | 目次・目的別ガイド |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | システム構成・設計判断・SEO |
| [docs/API.md](docs/API.md) | `/api/chat`・公開ページ・認証との境界 |
| [docs/ADR.md](docs/ADR.md) | 設計判断の記録 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 変更履歴 |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | 環境変数・関連外部サービス |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | デプロイ・マイグレーション・ロールバック |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | 障害・トラブル対応 |
| [docs/User-Guide.md](docs/User-Guide.md) | ダッシュボード設定など、ユーザー自身の操作が必要な項目 |

## 既知の問題

- Webアクセシビリティ: ハンバーガーメニュー表示時に、背後の要素にTabキーが反応してしまう問題を調査中（[docs/User-Guide-Known-Issues.md](docs/User-Guide-Known-Issues.md)）
