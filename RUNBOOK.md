# Runbook（legal&life）

## 会員登録・データ書き込みが「permission denied for table X」で失敗する

**原因**：`legal_life`スキーマの`anon`/`authenticated`ロールへのGRANTが欠落している（2026-09-14に実際に発生。Sporiveの`sporive`スキーマと同時に発覚）。

**確認方法**：
```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'legal_life' and grantee in ('anon', 'authenticated');
```

**対処**：
```sql
grant usage on schema legal_life to anon, authenticated;
grant select, insert, update, delete on all tables in schema legal_life to anon, authenticated;
grant usage, select on all sequences in schema legal_life to anon, authenticated;
alter default privileges in schema legal_life grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema legal_life grant usage, select on sequences to anon, authenticated;
```

## 他端末からの強制ログアウトが即座に反映されない

1. `supabase_realtime` publicationに`legal_life.sessions`が含まれているか確認（含まれていない場合、Realtimeイベントが届かず60秒間隔のポーリングだけが経路になる。2026-09-14にこの不一致がバグとして発見・修正済み。[ADR](ADR) ADR-007参照）
```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'sessions';
```
2. `components/SessionWatcher.tsx`の`postgres_changes`購読が`schema: "legal_life"`を指定しているか確認（`db.schema`クライアント設定はRealtime購読には継承されないため、購読側で明示的に指定する必要がある）

## SSO（Sporiveとのセッション共有）が効いていない

1. 両サービスがCookieドメイン`.saka2931.jp`を使用しているか、`lib/supabase/client.ts`（および`server.ts`）の設定を確認
2. 両サービスが同一のSupabaseプロジェクト（`saka2931-service`）を参照しているか確認
3. `db.schema`オプション（`legal_life`/`sporive`）はPostgRESTのテーブル参照先にのみ影響し、Authセッションには無関係。SSOが効かない場合はスキーマ設定ではなくCookieドメイン・プロジェクトURLを疑う

## お知らせが表示されない・更新されない

- `/info`・`/info/details/[slug]`は`saka2931-infra`プロジェクトの`service_announcements`をanonキーで参照する。表示されない場合は、まずadacの管理画面で該当お知らせが「公開」状態になっているか確認する
- `NEXT_PUBLIC_INFRA_SUPABASE_URL`/`NEXT_PUBLIC_INFRA_SUPABASE_ANON_KEY`が正しく設定されているか確認

## 認証メール（パスワードリセット等）が届かない

- Supabase **Authentication → Emails → SMTP Settings** のCustom SMTP（Resend）設定を確認（[User Guide Pending Actions](User-Guide-Pending-Actions) §1-2参照）
- `mail.saka2931.jp`のSPF/DKIM/DMARCがResend側で検証済みか確認
- 未設定の間はSupabaseデフォルト送信元（低いレート制限）にフォールバックする

## 機能フラグで一時停止したい

- 対象機能（緊急メンテナンス・アカウント機能・メール送信・AIチャット）は`saka2931-infra`の`feature_flags`テーブルを参照。adacの管理画面から該当フラグをOFFにする

## 緊急にサイト全体を止めたい

- 緊急メンテナンス機能フラグをONにする（実装済み。コード変更・デプロイ不要）

## ハンバーガーメニュー表示時にTabキーが背後の要素に反応する

既知のWebアクセシビリティ課題（調査中、`components/Header.tsx`）。フォーカストラップが未実装であることが原因。`components/OtpPanel.tsx`・`components/MaintenancePopup.tsx`で実装済みの手動Tabトラップ（`role="dialog"` + `aria-modal` + コンテナ内`querySelectorAll`によるフォーカス循環）と同じパターンを適用して修正する。

なお、アカウントログイン画面のOTP/パスキー再認証モーダル（`OtpPanel.tsx`）と、準備中ページのメンテナンスポップアップ（`MaintenancePopup.tsx`）は、包括ドキュメント監査で発見された同種の未実装課題を含め、いずれもフォーカストラップ実装済み（解消済み）。

## アカウント削除を申請したユーザーのデータが30日経過後も残っている（2026-09-15解消）

**状況（解消済み）**：2026-09-15、アカウント削除機能を`auth.saka2931.jp`アプリ（`sho29saka31/auth`リポジトリ）へ移設し、`scheduled_deletion`到来後に実際に`auth.users`・関連データを削除するpg_cronジョブ＋APIルートを新設した。legal-lifeの`/account/delete`ページは現在auth アプリへのリダイレクトのみで、削除申請・実削除ともauth側で完結する（[ADR](ADR) ADR-008参照）。以下は移設前の旧手順（履歴として残置）。

**旧原因**：`/account/delete`は`profiles.deletion_pending`フラグと`scheduled_deletion`（30日後の日時）を立てるだけで、その日時が到来した際に実際に`auth.users`・関連データを削除する処理（cronジョブ・Edge Function等）が実装されていなかった（2026-09-14の包括ドキュメント監査で発見）。`access_logs`/`chat_history`のような自動削除cronはこのテーブル・フローには存在しなかった。

**旧対処**：
1. `select id, email, deletion_pending, scheduled_deletion from auth.users u join legal_life.profiles p on p.id = u.id where p.deletion_pending = true and p.scheduled_deletion < now();`で削除待ちのユーザーを確認する
2. 自動削除が実装される前は、該当ユーザーがいる場合はSupabaseダッシュボード（Authentication → Users）から手動で削除するか、`supabase.auth.admin.deleteUser()`をservice_roleキーで呼び出す

## エラー監視（Sentry等）は未導入

`app/error.tsx`・`app/global-error.tsx`・`app/api/mail/route.ts`等の本番エラーは全て`console.error`のみで記録され、Sentry等の外部エラートラッキングサービスとは連携していない。本番エラーの調査は、Vercelダッシュボードの **Deployments → Runtime Logs**（または`vercel logs`コマンド）でサーバー側のログを確認する（保持期間はVercelのプランに依存）。クライアント側のみで発生したエラーはVercelログに残らないため、再現手順の聞き取りやブラウザの開発者ツールでの確認も併用する。

## npm auditで重大な脆弱性が報告された

1. `npm audit --production`で報告内容を確認する
2. `npm audit fix`（breaking changeを伴わない範囲）でまず修正を試みる。Next.jsのメジャーバージョンアップ（`npm audit fix --force`）が必要な指摘は、既存コードとの互換性を確認した上で別途対応する
3. 2026-09-14の包括ドキュメント監査で、`next`由来のcritical/high脆弱性（Windows RCE等、GHSA-p293-qw3h-jr36ほか）と`nanoid`・`sharp`のhigh脆弱性を`npm audit fix`で解消済み。残っていた`postcss`（next 15内部の同梱依存、moderate/high）も2026-09-15にNext.js 16.3.5へのメジャーアップグレードを実施し解消済み

## 法令検索が表示されない・AIチャットが応答しない

1. 法令検索：e-Gov法令API（デジタル庁が提供する公開API）自体の障害・レート制限の可能性がある。`lib/lawSearch.ts`はAPIキー不要で直接エンドポイントを叩く実装のため、e-Gov側の障害情報は自前では確認できない（デジタル庁のお知らせ等を確認する）
2. AIチャット：`GEMINI_API_KEY`がVercel環境変数に正しく設定されているか確認する
3. AIチャットには1分間に10回のレート制限（`app/api/chat/route.ts`）があるため、短時間の連続失敗はこの制限に達している可能性がある
4. 機能フラグ`ai_chat`がOFFになっていないか、adacの管理画面で確認する
