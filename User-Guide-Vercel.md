# User Guide: Vercel（legal&life）

[User Guide](User-Guide) の一部。Vercelプロジェクトの作成・環境変数設定・ドメイン接続。

## 1. プロジェクトのImport

1. https://vercel.com/ でアカウントを作成（GitHubアカウントでのサインインを推奨）
2. ダッシュボードの **Add New → Project** から、GitHubの`sho29saka31/legal-life`リポジトリを選択してImport
3. Framework Presetは自動的に**Next.js**が検出される。Build Command・Output Directory・Install Commandはデフォルトのままでよい

## 2. 環境変数の設定

Import画面（または作成後の **Settings → Environment Variables**）で、[Environment](ENVIRONMENT) 記載の変数をすべて設定する。

- Production / Preview / Development の**すべてにチェック**を入れる
- 環境変数を追加・変更した場合は **Deployments → 該当デプロイ → Redeploy** が必要

## 3. 独自ドメインの接続

1. **Settings → Domains** で `legal-life.saka2931.jp` を追加
2. 表示されるDNSレコードを、ドメインのDNS管理画面（`saka2931.jp`のDNSプロバイダ）に追加
3. DNS反映後、Vercel側で自動的にHTTPS証明書が発行される

## 4. GitHub連携によるデプロイ

- `main`ブランチへのpushで自動的に本番デプロイが実行される
- 他のブランチへのpush・PR作成ではプレビューデプロイが作成される

## 5. Vercel Analytics / Speed Insights

コード側は`@vercel/analytics`・`@vercel/speed-insights`を導入済み（`app/layout.tsx`）。計測を有効にするにはVercelダッシュボード側の設定が必要。

1. プロジェクトの **Analytics** タブ → **Enable** をクリック
2. **Speed Insights** タブ → **Enable** をクリック
3. 無料プランでは基本的な計測のみ利用可能（詳細な絞り込み等は有料プラン限定）

## トラブルシューティング

- **デプロイは成功するが画面が真っ白・エラーになる**：環境変数の設定漏れが多い。`NEXT_PUBLIC_`接頭辞の変数は追加後に必ずRedeployが必要
- **プレビューデプロイでSupabase認証が失敗する**：Supabaseの`Authentication → URL Configuration`にプレビュードメインが未登録の可能性（Sporiveと共有プロジェクトのため、設定変更時は互いに影響しないか要確認）
