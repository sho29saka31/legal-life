# API（legal&life）

legal-life自身が公開するRoute Handlerは `POST /api/chat` のみ。ログイン・アカウント関連のAPIは auth（`auth.saka2931.jp`）側にある。

## `POST /api/chat`

Gemini APIを利用した法令に関する対話機能のサーバー側エンドポイント。APIキーはこのRoute Handler経由のみで使用し、クライアントに露出しない。

- 認証：**不要**（ログイン前でもチャットを試せる仕様）。ログイン中はチャット履歴を `legal_life.chat_history` に保存し、未ログイン時はブラウザのlocalStorageのみに保持する（`app/content/chat/ChatApp.tsx`）
- 機能フラグ：`ai_chat`（`saka2931-infra`の`feature_flags`、`service='legal_life'`）がOFFなら停止（OFF時は503と案内メッセージ）
- 入力：メッセージは最大1000文字（`MAX_INPUT_LEN`）
- レート制限：IP単位で1分あたり10回（インメモリのスライディングウィンドウ）。IPは偽装できない `x-vercel-forwarded-for` を優先し、無ければ `x-real-ip`。サーバーレスでインスタンスごとに状態が分かれるため完全な防御ではなく、単純な連打への抑止力という位置づけ
- 外部呼び出し：`gemini-3.5-flash`（コード内固定）。例外メッセージは内部詳細を返さず汎用メッセージにする
- 注：チャット機能はサイト上では正式公開前（ナビからは「準備中」ポップアップ）

## 公開ページ・メタ

| パス | 内容 |
|---|---|
| `/` `/content` `/content/search` `/info` `/info/about` `/info/faq` | 公開ページ（sitemapに掲載） |
| `/content/{study,chat,news}` `/plan` `/info/history` | 正式公開前（robotsでDisallow、sitemap非掲載） |
| `/welcome` | 要ログイン（`requireAuth()` が未ログインを authへ転送）。`robots` でDisallow |
| `/maintenance` | メンテナンス表示（503）。緊急メンテナンス時の転送先。稼働状況ページへのリンクあり |
| `/sitemap.xml` `/robots.txt` | 上記の基準で自動生成 |
| 404 / 500 | `not-found.tsx` / `error.tsx` / `global-error.tsx`（共通部品 `ErrorPage`） |

## リダイレクト（互換）

`/law/privacy` `/law/terms` `/law/cookie` `/law/disclaimer` は `https://service.saka2931.jp/{privacy,terms,cookie,disclaimer}`、`/info/contact` は `https://service.saka2931.jp/contact/legal-life`へのリダイレクト専用ページ。既存のリンク・ブックマーク・検索エンジンのインデックスを生かすために残している（法的文書は service に集約済み）。

## お知らせ（読み取り専用、外部プロジェクト参照）

`/info`・`/info/details/[slug]`・ヘッダーバナーは `saka2931-infra` の `service_announcements` テーブルを anon キーで読み取り、動的にレンダリングする（`lib/announcements.ts`）。本文は `sanitize-html` でサニタイズして表示する。書き込みは adac の管理画面からのみで、legal-life側にAPIは存在しない。

## お問い合わせ

legal-life自体にはお問い合わせ用APIを持たない。`service.saka2931.jp/contact/legal-life` のフォーム送信APIに集約されており、送信内容は `saka2931-infra` の `contact_inquiries` テーブルに保存される（詳細はserviceリポジトリの [API](https://github.com/sho29saka31/service/blob/main/docs/API.md) を参照）。

## 認証との境界

- 未ログインでログイン必須ページへ来た場合、`requireAuth()` が `https://auth.saka2931.jp/login?return_to=<現在のURL>` へ転送する（`return_to` の検証は auth の `resolveReturnTo()`）
- ヘッダーの「アカウント」は `https://auth.saka2931.jp/account` へのリンク
- 表示名：auth の `GET/PATCH https://auth.saka2931.jp/api/profile`（`lib/auth/profile.ts`、`credentials: "include"`、失敗時は `null`）
- `profiles`（`photo_url` / `role`）のみlegal-life自身がDBから読む
- 端末管理：ブラウザが `auth_app.sessions` に自端末を upsert・監視（`AuthSessionWatcher`。RLSで本人の行のみ）

専用のカスタム認証APIは持たず、Supabase Auth標準のクライアントSDKとauthアプリの仕様に従う（authリポジトリの `docs/API.md`）。
