# Architecture（legal&life）

## 概要

`legal-life.saka2931.jp` は、法令の学習・相談を身近にすることを目指す法令学習・検索・AIチャットサイト。Next.js(App Router) + TypeScript + Tailwind CSSで構築され、Supabase(Auth, PostgreSQL, Realtime)を使用する。

## システム構成図（論理）

```
[ブラウザ]
    │
    ▼
Next.js (Vercel, App Router)
    │
    ├── /content/study   法令学習コンテンツ
    ├── /content/search  e-Gov法令API連携の法令検索
    ├── /content/chat     Gemini API連携のAIチャット(サーバー側/api/chat経由のみ)
    ├── /content/news     法令関連ニュース
    ├── /info, /info/details/[slug]  お知らせ(saka2931-infra参照、動的)
    ├── /law/{privacy,terms,cookie,disclaimer}  法的文書
    ├── /account/{login,signup,profile,security,device,activity,delete,logout,privacy}  アカウント機能
    ├── /plan, /welcome   料金・ウェルカム
    ├── /error/{401,503}  エラーページ
    │
    ├── Supabase Auth (@supabase/ssr)
    │     Cookieドメイン: .saka2931.jp (Sporiveと共有、SSO)
    │     メール+パスワード / Google OAuth / パスキー(WebAuthn) / TOTP
    │
    └── Supabase Postgres (saka2931-service プロジェクト, schema=legal_life)

外部連携（読み取り専用）:
   saka2931-infra プロジェクト (adac/statusと共有)
     ├─ feature_flags        (機能フラグ)
     └─ service_announcements(お知らせ)

外部連携（書き込み）:
   saka2931-infra の contact_inquiries は service.saka2931.jp/contact/legal-life 経由で作成
```

## 主要な設計判断

- **saka2931-serviceプロジェクトをSporiveと共有**：`legal_life`スキーマで論理分離。RLS + スキーマ単位のGRANTで越境アクセスを防止（GRANT漏れは過去に障害化した実績があるため、新規スキーマ作成時は必ずセットで発行する）
- **SSO**：CookieドメインをSporiveと同一の`.saka2931.jp`にすることで、同一Supabaseプロジェクトの認証セッションを共有
- **認証はブラウザ側で完結**：legal-lifeは`@supabase/ssr`によるセッション管理をブラウザ側（クライアントコンポーネント）で完結させており、middlewareではセッションを扱わない（Sporiveとの実装上の違い）。middlewareは緊急メンテナンスモードの判定（`isEmergencyMaintenanceActive`が真の場合、静的アセット・`/api`・`/admin`・`/error/503`自身を除く全ページを`/error/503`へrewrite）のみを行う
- **お問い合わせ・プライバシーポリシー・利用規約の集約**：`service.saka2931.jp`に一本化し、各サービス固有ページを廃止
- **メール送信**：Resend経由（`mail.saka2931.jp`）。アプリからの送信とSupabase Auth自体のメール送信の両方をResendに統一
- **アクセス解析**：GTM経由のGA4計測（[User Guide Pending Actions](User-Guide-Pending-Actions) 参照）に加え、`@vercel/analytics`・`@vercel/speed-insights`（Vercel Analytics / Speed Insights）を導入済み。後者2つはVercelダッシュボード側でプロジェクトごとに有効化が必要（無料プランでは基本的な計測のみ利用可）
- **Geminiモデル名はコード内に固定**：Sporive（`GEMINI_MODEL`環境変数必須）とは異なり、legal-lifeは`/api/chat`内で`gemini-3.5-flash`を直接指定している（環境変数化されていない）。モデル変更時はコード修正が必要
- **データ保持ポリシー**：`access_logs`（90日）・`chat_history`（AIチャット履歴、180日）はpg_cronで日次自動削除。未ログイン時のチャット履歴はSupabaseに保存されずブラウザのlocalStorageのみで保持される（[CHANGELOG](CHANGELOG) 参照）。一方`activity_log`（`/account/activity`のアクティビティ履歴）には自動削除ジョブがなく、無期限に保持される（UI側は2026-09-14の監査で「最新50件」表示に訂正済み。以前は実装と食い違う「最大1年」という表示だった）
- **RLSのカラム単位保護**：`profiles.role`・`sessions.should_logout`等、所有者本人が更新できてしまうと権限昇格やセキュリティ機能の無効化につながるカラムには、行レベルのRLSに加えBEFORE UPDATEトリガーでカラム単位の追加チェックを行う（[ADR](ADR) ADR-006参照）

## ディレクトリ構成（主要部分）

`src/`ディレクトリを持たず、`app/`がリポジトリ直下にある点がSporive等他リポジトリと異なる。

```
legal-life/
├── app/
│   ├── content/{study,search,chat,news}/
│   ├── info/{about,contact,details,faq,history,map}/  # お知らせ・サイト概要
│   ├── law/{privacy,terms,cookie,disclaimer}/         # 法的文書
│   ├── account/{login,signup,profile,security,device,activity,delete,logout,privacy}/  # アカウント機能
│   ├── plan/, welcome/
│   ├── error/{401,503}/
│   └── api/{chat,mail}/         # Gemini APIサーバー処理・会員向け通知メール送信
├── components/
├── lib/
│   ├── supabase/                # client/server/infra ヘルパー
│   ├── auth/                    # mfa・passkey(WebAuthn)・session・requireAuth等
│   ├── mail/resend.ts           # Resend送信ラッパー
│   ├── announcements.ts         # お知らせ取得(saka2931-infra参照)
│   ├── feature-flags.ts         # 機能フラグ取得(saka2931-infra参照)
│   ├── lawSearch.ts             # e-Gov法令API連携
│   └── consent.ts               # Cookie同意・Consent Mode v2管理
└── data/
```

新設予定の標準ドキュメント（本ページを含む7点）の全体像は [CHANGELOG](CHANGELOG) を、環境変数は [Environment](ENVIRONMENT) を参照。
