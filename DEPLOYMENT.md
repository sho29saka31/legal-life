# Deployment（legal&life）

## ホスティング

- **Vercel**（無料プラン）、GitHubリポジトリ連携による自動デプロイ
- 本番ドメイン：`legal-life.saka2931.jp`
- `main`へのマージでVercelが自動的に本番デプロイを実行

## デプロイフロー

1. `origin/main`から作業ブランチを作成
2. 実装・`npm run build`でローカル検証
3. コミット・push、draft PRを作成
4. Vercelのプレビューデプロイ・CIチェックがグリーンになったらdraft解除
5. マージ（squash）→ 本番デプロイ

## 環境変数の設定

Vercelの **Settings → Environment Variables** に、[Environment](ENVIRONMENT) 記載の変数を設定する。設定後は **Redeploy** が必要。

## データベースマイグレーション

`saka2931-service`プロジェクト（`legal_life`スキーマ）に対し、Supabaseダッシュボードの **SQL Editor** でマイグレーションSQLを適用する。Sporiveと同一プロジェクトを共有しているため、他方のスキーマへ影響しないことを確認してから実行する。

## デプロイ前チェックリスト

- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run build`
- [ ] 新規マイグレーションがあれば`legal_life`スキーマに適用済みか確認
- [ ] カスタムスキーマへの新規テーブル追加時はGRANT文を必ずセットで発行（[Runbook](RUNBOOK) 参照）
- [ ] 新規環境変数はVercelに設定済みか確認（設定後Redeploy）

## ロールバック

Vercelダッシュボードの **Deployments** から直前の正常なデプロイメントを **Promote to Production** することでロールバック可能。DBマイグレーションはロールバックされない点に注意。
