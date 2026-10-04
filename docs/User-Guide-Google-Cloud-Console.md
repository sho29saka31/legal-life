# User Guide: Google Cloud Console（legal&life）

[User Guide](User-Guide.md) の一部。Google OAuth（Google One Tapログイン）の設定手順。

> **現行（2026-10-04）**：Googleログイン・One Tapは **auth.saka2931.jp** が提供し、OAuthクライアントも auth 専用に新規作成したものを使う。legal-life側のGoogle設定は不要になった（環境変数 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` も削除済み）。現行の手順は authリポジトリの `docs/Setup.md` §2。以下は legal-life 単独運用時の設定の記録で、新規に作る場合は参照しないこと。

## 1. OAuth同意画面の設定

1. https://console.cloud.google.com/ でプロジェクトを作成（Sporiveと同一プロジェクトでも、別プロジェクトでもよい）
2. `API とサービス → OAuth 同意画面` を設定
   - User Type：外部（External）
   - アプリのホームページ：`https://legal-life.saka2931.jp`
   - プライバシーポリシー・利用規約へのリンク：`https://service.saka2931.jp/privacy`・`https://service.saka2931.jp/terms`
   - スコープ：`.../auth/userinfo.email`・`.../auth/userinfo.profile`・`openid`（いずれも「非センシティブ」のため審査不要）

## 2. OAuthクライアントIDの作成

1. `API とサービス → 認証情報` で OAuth クライアントID（ウェブアプリケーション）を作成
2. **承認済みのJavaScript生成元**：
   ```
   https://legal-life.saka2931.jp
   http://localhost:3000
   ```
3. **承認済みのリダイレクトURI**（Supabaseのcallback URLと、Google One Tap用のURL両方が必要な場合がある。実装内容に応じてSupabase側の設定と合わせて確認する）：
   ```
   https://<Supabaseのプロジェクト参照ID>.supabase.co/auth/v1/callback
   ```
4. 発行された **クライアントID** を`NEXT_PUBLIC_GOOGLE_CLIENT_ID`としてVercelに設定（[User Guide Vercel](User-Guide-Vercel.md) 参照）。クライアントシークレットが必要な場合はSupabaseダッシュボード側に直接入力し、チャット等では共有しない

## 3. Supabaseに設定を反映

Sporiveと同一のSupabaseプロジェクト（`saka2931-service`）を共有しているため、Google認証プロバイダの設定自体はSupabase側で一度行えば両サービスに適用される。既にSporive側で設定済みの場合、この手順は重複作業になる可能性があるため、先に `Authentication → Sign In / Providers → Google` の設定状況を確認する。

## トラブルシューティング

- **Google One Tapが表示されない**：`NEXT_PUBLIC_GOOGLE_CLIENT_ID`が正しく設定されているか、承認済みのJavaScript生成元に本番ドメインが含まれているか確認
- **Google同意後にlocalhostへ飛ばされる**：Supabaseの `Authentication → URL Configuration` のSite URL / Redirect URLsを確認
