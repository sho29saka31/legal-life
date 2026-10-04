# legal&life ユーザーガイド

このページは、コード側の対応だけでは完結せず、**ユーザー様ご自身の操作が必要な項目**をまとめたものです。Supabase・Vercel・Cloudflare・Google関連のダッシュボード設定など、AIエージェントからは実行できない（または実行すべきでない）作業が対象です。

> **認証関連の設定は authアプリ側で管理している**（2026-09-16〜）。Supabase Authの Site URL / Redirect URLs・Googleログイン・Turnstile（CAPTCHA）・認証メールの設定は legal-life ではなく **authリポジトリの `docs/Setup.md`** が正。このガイドの該当箇所は、authアプリ用の設定として読み替える。

以下のページに分割しています。

- [User Guide Pending Actions](User-Guide-Pending-Actions.md) — 対応状況の確認が必要なこと(GTM・Custom SMTP)(§1)
- [User Guide Security Recommendations](User-Guide-Security-Recommendations.md) — セキュリティ強化のための推奨設定(任意)(§2)
- [User Guide Known Issues](User-Guide-Known-Issues.md) — 未解決の問題(§3)
- [User Guide Vercel](User-Guide-Vercel.md) — Vercelプロジェクトの作成・環境変数・ドメイン接続
- [User Guide Google Cloud Console](User-Guide-Google-Cloud-Console.md) — Google OAuth(One Tap)の設定（現在はauth専用。履歴として保存）
- [User Guide Google AI Studio](User-Guide-Google-AI-Studio.md) — Gemini APIキーの取得
- [User Guide Search Console](User-Guide-Search-Console.md) — Search Consoleへのサイト登録・サイトマップ送信

環境変数の一覧は [Environment](ENVIRONMENT.md) を参照してください。

最終更新: 2026年10月4日（認証関連の注記を追加）
