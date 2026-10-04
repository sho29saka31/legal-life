# User Guide: Pending Actions（legal&life）

[User Guide](User-Guide.md) の一部。対応状況の確認が必要なこと(§1)。

## 1-1. Google Tag Manager: GA4タグの設定

GTM経由でGA4を計測する方式を採用しています。コード側の対応(Consent Mode v2、Cookie同意連動)は完了していますが、GTM管理画面側の設定状況は未確認です。

1. [Google Tag Manager](https://tagmanager.google.com/)で新規コンテナを作成(プラットフォーム: ウェブ)し、コンテナID(`GTM-XXXXXXX`)を`NEXT_PUBLIC_GTM_CONTAINER_ID`としてVercelに設定
2. GTM内で「タグ」→ 新規作成 → タグの種類「Google アナリティクス: GA4 設定」を選択し、測定ID(`G-...`)を入力
3. トリガーは「All Pages」を選択
4. 「詳細設定」→「同意設定」で、「追加の同意事項を確認する」を有効化し、`analytics_storage`を要求するタグとして設定(これによりConsent Mode経由でユーザーが同意するまでこのタグは発火しません)
5. 公開(Submit)して、GTMのプレビューモードでタグが発火することを確認
6. GA4側の測定IDを`NEXT_PUBLIC_GA_MEASUREMENT_ID`としてもVercelに設定(Cookie拒否時の削除ロジックで使用)

## 1-2. Supabase: Custom SMTP(Resend)の設定（設定済み）

**Supabase Auth自体が送るメール**(サインアップ確認・パスワードリセット・メールアドレス変更確認など)は、Custom SMTP(Resend)で送信する設定にしてある(2026-10-04時点で変更済み)。sporive/legal-life/authは同一のSupabaseプロジェクト(`saka2931-service`)を共有しているため、この設定は全サービスの認証メールに共通で適用される。

- 場所: Supabaseダッシュボード → Authentication → Emails → SMTP Settings
- 設定値:

| 項目 | 値 |
| --- | --- |
| Sender email | `mail.saka2931.jp`上のアドレス(例: `auth@mail.saka2931.jp`) |
| Sender name | `auth`(認証メールの送信者名は全サービスで **auth に統一**) |
| Host | `smtp.resend.com` |
| Port | `465`(SSL)または`587`(STARTTLS) |
| Username | `resend`(固定文字列) |
| Password | Resendのシークレットキー |

- Sender emailに使うドメイン(`mail.saka2931.jp`)がResend側で検証済み(SPF/DKIM/DMARC設定済み)である必要がある
- **レート制限は未調整の可能性がある(要確認)**：Custom SMTPを有効にしたため、Supabaseの Authentication → Rate Limits の「メール送信」の上限を調整できる状態になった。Supabase側の上限は既定値のままの可能性が高く、認証メールの再送や登録が集中すると、Resendの送信枠に余裕があってもSupabase側で429になる。あわせてResend側の送信上限(プランごとの日次・月次の送信数)も確認する。調整方法は [Security Recommendations](User-Guide-Security-Recommendations.md) §2-3
- 認証メールの文面(Email Templates)や送信まわりは、認証機能を担当する authアプリ(authリポジトリの `docs/Setup.md`・`docs/RUNBOOK.md`)と共通の管理項目
- legal-life自身は現在アプリからのメール送信を行わない(お問い合わせの受付・通知はserviceリポジトリ側、会員向け通知メール機能は削除済み)
