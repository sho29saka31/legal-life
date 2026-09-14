# legal&life

`legal-life.saka2931.jp` — 法令の学習・相談を身近にすることを目指す、法令学習・検索・AIチャットサイト。

サイト概要は [`/info/about`](https://legal-life.saka2931.jp/info/about) を参照してください。

## 主な機能

- **法令学習** — 法令をわかりやすく学べるコンテンツページ（`/content/study`）
- **法令検索** — e-Gov法令APIを利用した法令検索（`/content/search`）
- **AIチャット** — Gemini APIを利用した法令に関する対話機能（`/content/chat`。APIキーはサーバー側`/api/chat`経由のみで使用）
- **ニュース** — 法令関連ニュースの掲載（`/content/news`）
- **アカウント機能** — メール＋パスワード・Google OAuth・パスキー(WebAuthn)によるログイン、TOTPによる2段階認証、ログイン中デバイスの一覧・強制ログアウト、アクティビティ履歴、アカウント削除
- **お知らせ** — adacの管理画面から配信されるお知らせをヘッダーバナー・お知らせ一覧（`/info`）に表示

## saka2931.jpドメインとの連携

sporive・service等、saka2931.jp配下の他サービスと以下を共有しています。

- **Supabase認証セッションの共有(SSO)** — Cookieドメインを`.saka2931.jp`に設定し、sporiveとログイン状態を共有(`lib/supabase/client.ts`)。認証データベース自体もsporiveと同一のSupabaseプロジェクト(`saka2931-service`、スキーマは`legal_life`で分離)を共有
- **お知らせ・機能フラグ** — `saka2931-infra`(adac/statusと共有)の`service_announcements`・`feature_flags`テーブルから取得。作成・切替はadacの管理画面から行う
- **お問い合わせ** — サイト上のお問い合わせは`service.saka2931.jp/contact/legal-life`へ集約
- **プライバシーポリシー・利用規約** — `service.saka2931.jp`のページに集約
- **稼働状況** — `status.saka2931.jp`で公開監視

## 技術スタック

本サイトはCloudflare Pages上の静的HTML/CSS/vanilla-JSサイトから、Next.js(App Router)+ TypeScript + Tailwind CSSへ全面リライトし、Vercelへ移行しました。

- **フレームワーク**: Next.js 15 (App Router) + TypeScript
- **スタイル**: Tailwind CSS(`next/font/local`でBIZUDGothicフォントを自己ホスト化)
- **認証**: Supabase Auth(メール・パスワード、Google OAuth、パスキー、TOTPによる2段階認証、セッション管理)。sporiveとSSO連携
- **データベース**: Supabase(PostgreSQL、`saka2931-service`プロジェクトの`legal_life`スキーマ)
- **メール送信**: Resend(送信元は独自ドメイン`mail.saka2931.jp`。Supabase Auth自体のメールもSupabaseダッシュボード側のCustom SMTP設定でResendのSMTPリレーを使用)
- **AIチャット**: Gemini API(サーバー側`/api/chat`経由のみで使用)
- **法令検索**: e-Gov法令API
- **CAPTCHA**: Cloudflare Turnstile(未設定時はウィジェット非表示)
- **アクセス解析**: Google Tag Manager経由のGoogle Analytics(GA4)、Consent Mode v2対応
- **ホスティング**: Vercel

## ドキュメント

詳細ドキュメントは [GitHub Wiki](https://github.com/sho29saka31/legal-life/wiki) に移行しました。

| ドキュメント | 内容 |
|---|---|
| [User Guide](https://github.com/sho29saka31/legal-life/wiki/User-Guide) | ダッシュボード設定等、ユーザー自身の操作が必要な項目 |

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 値の設定はWiki: User Guide参照
npm run dev
```

必要な環境変数は [Wiki: User Guide](https://github.com/sho29saka31/legal-life/wiki/User-Guide) の環境変数一覧を参照してください。

## 既知の問題

- Webアクセシビリティ: ハンバーガーメニュー表示時・アカウントログイン画面表示時に、背後の要素にTabキーが反応してしまう問題を調査中
