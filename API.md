# API（legal&life）

## `POST /api/chat`

Gemini APIを利用した法令に関する対話機能のサーバー側エンドポイント。APIキーはこのRoute Handler経由のみで使用し、クライアントに露出しない。

- 認証：ログイン必須（アカウント機能の一部として提供）
- 機能フラグ：AIチャット機能フラグ（`saka2931-infra`の`feature_flags`参照）で一括停止可能

## `POST /api/mail`

会員向け通知メール（Resend経由）の送信エンドポイント。パスワード再設定・メールアドレス変更確認以外の、アプリ独自の通知メール（`purpose`で種別指定）を送信する。

- 認証：ログイン必須
- 機能フラグ：メール送信機能フラグ（`saka2931-infra`の`feature_flags`参照）で一括停止可能
- 悪用防止：`to_email`・`to_name`・`purpose`等の各フィールドに長さ制限。`to_email`は単一メールアドレス形式のみ許可（カンマ区切りの複数宛先を拒否し、レート制限のバイパスを防止）

## お知らせ（読み取り専用、外部プロジェクト参照）

`/info`・`/info/details/[slug]`は`saka2931-infra`プロジェクトの`service_announcements`テーブルをanonキーで読み取り、動的にレンダリングする。書き込みはadacの管理画面からのみ行われ、legal-life側にAPIエンドポイントは存在しない。

## お問い合わせ

legal-life自体にはお問い合わせ用APIを持たない。`service.saka2931.jp/contact/legal-life`のフォーム送信APIに集約されており、送信内容は`saka2931-infra`の`contact_inquiries`テーブルに保存される（詳細はserviceリポジトリの [API](https://github.com/sho29saka31/service/wiki/API) を参照）。

## 認証

Supabase Auth（`@supabase/ssr`）。メール+パスワード・Google OAuth・パスキー(WebAuthn)・TOTPの各フローはSupabase Auth標準のクライアントSDK経由で、専用のカスタムAPIは実装していない。
