# Deployment（legal&life）

## ホスティング

- **Vercel**（無料プラン）、GitHubリポジトリ連携による自動デプロイ
- 本番ドメイン：`legal-life.saka2931.jp`
- `main`へのマージでVercelが自動的に本番デプロイを実行

## デプロイフロー

1. `origin/main`から作業ブランチを作成
2. 実装・`npm run build`でローカル検証
3. コミット・push、draft PRを作成。**コミットの作者を確認**する（`git log origin/main..HEAD --format='%an <%ae>'`）。Vercelはヘッドコミットの作者がチームメンバーでないとデプロイを「Deployment was blocked」にする（gitの`user.name`/`user.email`は変更しない）
4. Vercelのプレビューデプロイ・CIチェックがグリーンになったらdraft解除
5. マージ → 本番デプロイ。複数PRを順にマージする場合は、衝突が出ないか事前に確認する

## 環境変数の設定

Vercelの **Settings → Environment Variables** に、[Environment](ENVIRONMENT.md) 記載の変数を設定する。設定後は **Redeploy** が必要。

## データベースマイグレーション

`saka2931-service`プロジェクト（`legal_life`スキーマ）に対し、Supabaseダッシュボードの **SQL Editor** でマイグレーションSQLを `supabase/migrations/` のファイル名（日時）順に適用する。Vercelのデプロイでは適用されない。Sporive・authと同一プロジェクトを共有しているため、他のスキーマへ影響しないことを確認してから実行する。DDLは先頭に `set local lock_timeout = '4s';` を付け、ロック待ちで固まらないようにする。

## デプロイ前チェックリスト

- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run build`
- [ ] 新規マイグレーションがあれば`legal_life`スキーマに適用済みか確認
- [ ] カスタムスキーマへの新規テーブル追加時はGRANT文を必ずセットで発行（`anon`/`authenticated`/`service_role`。[Runbook](RUNBOOK.md) 参照）
- [ ] 新規テーブルには緊急メンテナンス用のRLSポリシー `maintenance_lockdown` を付ける（付け忘れるとそのテーブルだけロック対象外。[ADR](ADR.md) ADR-011）
- [ ] 新規環境変数はVercelに設定済みか確認（設定後Redeploy）

## ロールバック

Vercelダッシュボードの **Deployments** から直前の正常なデプロイメントを **Promote to Production** することでロールバック可能。DBマイグレーションはロールバックされない点に注意。

## 関連アプリとの順序

- 認証まわり（`return_to`・Cookie・`/api/profile`）の変更は **authアプリ側を先に** デプロイする
- 緊急メンテナンスのDBロックは `saka2931-service` 側のmigrationで管理され、legal-lifeのデプロイとは独立している
