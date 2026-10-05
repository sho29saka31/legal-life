# legal&life ドキュメント

`legal-life.saka2931.jp` — 法令の学習・相談を身近にすることを目指す、法令学習・検索・AIチャットサイト。

リポジトリの [README](../README.md) に収まらない詳細ドキュメントをここにまとめている。リポジトリの非公開化に伴い、Wikiで管理していたページ群をそのまま `docs/` に取り込んだ（[ADR](ADR.md) ADR-012）。ページ名はWiki時代と同じ。

> **現行仕様の見方**：ログイン・アカウント関連は `auth.saka2931.jp`（authリポジトリ）に移管済み。以降の変更は [CHANGELOG](CHANGELOG.md) が最新、実装済みの現在の姿は [Architecture](ARCHITECTURE.md)。

## 目的別ガイド

| 目的 | ページ |
|---|---|
| 現在のシステム構成を知りたい | [Architecture](ARCHITECTURE.md) |
| ダッシュボード設定など、ユーザー自身の操作が必要な項目 | [User Guide](User-Guide.md) |
| 環境変数・外部サービスを確認したい | [Environment](ENVIRONMENT.md) |
| リリースする | [Deployment](DEPLOYMENT.md) |
| 障害・問い合わせに対応する | [Runbook](RUNBOOK.md) |
| エンドポイント・公開ページを調べる | [API](API.md) |
| なぜそうなっているか | [ADR](ADR.md) / [Changelog](CHANGELOG.md) |

## ページ一覧

### 標準ドキュメント
| ドキュメント | 内容 |
|---|---|
| [Architecture](ARCHITECTURE.md) | システム構成・設計判断・SEO・ディレクトリ構成 |
| [API](API.md) | `/api/chat`・公開ページ・リダイレクト・認証との境界 |
| [ADR](ADR.md) | Architecture Decision Records（ADR-001〜012） |
| [Changelog](CHANGELOG.md) | 変更履歴 |
| [Deployment](DEPLOYMENT.md) | デプロイ・マイグレーション適用・ロールバック |
| [Runbook](RUNBOOK.md) | 障害・トラブル対応手順 |
| [Environment](ENVIRONMENT.md) | 環境変数・関連外部サービス |

### ユーザーガイド（[User Guide](User-Guide.md)）
[Pending Actions](User-Guide-Pending-Actions.md)（GTM・Custom SMTP設定済み） / [Security Recommendations](User-Guide-Security-Recommendations.md) / [Known Issues](User-Guide-Known-Issues.md) / [Vercel](User-Guide-Vercel.md) / [Google Cloud Console](User-Guide-Google-Cloud-Console.md)（履歴） / [Google AI Studio](User-Guide-Google-AI-Studio.md) / [Search Console](User-Guide-Search-Console.md)

## 更新の作法

- 仕様・構成を変えたら該当ページを更新し、**必ず [CHANGELOG](CHANGELOG.md) に追記**する。設計判断を伴うなら [ADR](ADR.md) にも追記する
- 他リポジトリ（auth / adac / Sporive）に影響する変更は、そちらの `docs/` も確認する
