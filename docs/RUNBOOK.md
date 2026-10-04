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

強制ログアウトは auth の「ログイン中のデバイス」（`/account/devices`）が `auth_app.sessions.should_logout` を立てる方式で、legal-lifeは `components/AuthSessionWatcher.tsx` がそれを検知してサインアウトする（Realtime購読 + 60秒間隔のポーリングを併用）。

1. `supabase_realtime` publicationに `auth_app.sessions` が含まれているか確認（無いとRealtimeが届かず、60秒ポーリングだけが経路になる）
```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'sessions';
```
2. `AuthSessionWatcher` の購読が `schema: "auth_app"` を指しているか確認（`db.schema` クライアント設定はRealtime購読には継承されないため、購読側で明示指定が必要。旧 `SessionWatcher` が `public` を指したまま機能していなかった事例がある。[ADR](ADR.md) ADR-007）
3. この端末の登録は localStorage の `legallife-auth-session-id`。消えている場合は次回ログイン後に再登録される

## SSO（auth・Sporiveとのセッション共有）が効いていない

1. 各サービスがCookieドメイン`.saka2931.jp`を使用しているか、`lib/supabase/client.ts`（および`serverClient.ts`）の設定を確認（Cookieを発行するのは auth。legal-lifeは読み取り・更新）
2. 各サービスが同一のSupabaseプロジェクト（`saka2931-service`）を参照しているか確認
3. `db.schema`オプション（`legal_life`/`sporive`）はPostgRESTのテーブル参照先にのみ影響し、Authセッションには無関係。SSOが効かない場合はスキーマ設定ではなくCookieドメイン・プロジェクトURLを疑う

## お知らせが表示されない・更新されない

- `/info`・`/info/details/[slug]`は`saka2931-infra`プロジェクトの`service_announcements`をanonキーで参照する。表示されない場合は、まずadacの管理画面で該当お知らせが「公開」状態になっているか確認する
- `NEXT_PUBLIC_INFRA_SUPABASE_URL`/`NEXT_PUBLIC_INFRA_SUPABASE_ANON_KEY`が正しく設定されているか確認

## 認証メール（パスワードリセット等）が届かない

- Supabase **Authentication → Emails → SMTP Settings** のCustom SMTP（Resend）設定を確認（[User Guide Pending Actions](User-Guide-Pending-Actions.md) §1-2参照）。認証メール（パスワード再設定等）の送信元・テンプレートは auth の設定で、authリポジトリの `docs/RUNBOOK.md` も参照
- `mail.saka2931.jp`のSPF/DKIM/DMARCがResend側で検証済みか確認
- 未設定の間はSupabaseデフォルト送信元（低いレート制限）にフォールバックする

## 機能フラグで一時停止したい

- 対象は `saka2931-infra` の `feature_flags`（`service='legal_life'`）。コードが参照するキーは `emergency_maintenance`・`ai_chat`・`account_features`（`lib/feature-flags.ts`）。adacの `/admin/features` から該当フラグをOFFにする
- `ai_chat` をOFFにすると `/api/chat` が503（案内メッセージ）を返す
- フラグ取得に失敗した場合は「有効」がデフォルト（`saka2931-infra` 側の障害で誤って機能が止まらないフェイルオープン設計）

## 緊急にサイト全体を止めたい（緊急メンテナンス）

- adac の `/admin/features` で legal-life の `emergency_maintenance` をONにする。コード変更・デプロイ不要
- 効果：①`middleware.ts` が全ページ（静的アセット・`/api`・`/admin`・`/maintenance`・`robots.txt`・`sitemap.xml` を除く）を `/maintenance` へリダイレクト ②`saka2931-service` のRLS（`maintenance_lockdown`）が `legal_life` の全テーブルで anon/authenticated を拒否（管理者とservice_roleは対象外）
- 同期：adac → infra の `feature_flags` → トリガー+pg_net → `auth_app.maintenance_state`（`service='legal_life'`）。失敗しても5分ごとの再同期cronで収束する。解除後に画面は戻ったのにデータが拒否される場合は、`select * from auth_app.maintenance_state;` で `active` を確認（最大5分）
- 取得失敗時は「止めない」側（フェイルオープン）。新しいテーブルを追加したときは `maintenance_lockdown` ポリシーを付ける（付け忘れるとそのテーブルだけロック対象外）

## ログインできない・ログイン画面に飛ばされ続ける

ログイン・登録・MFA・パスキー・パスワード再設定は **auth.saka2931.jp** の機能。まず authリポジトリの `docs/RUNBOOK.md` を参照する。legal-life側で確認すること：

1. `/welcome` など要ログインページを未ログインで開くと `https://auth.saka2931.jp/login?return_to=...` へ転送されるか（`lib/auth/requireAuth.ts`）
2. ログイン後に戻ってきても再度転送される → `.saka2931.jp` スコープのCookieをlegal-lifeが読めていない。Supabase URL/anon keyが `saka2931-service` を指しているか、ブラウザがCookieを拒否していないか
3. 表示名が空 → auth の `GET /api/profile` が応答しているか（`lib/auth/profile.ts` は失敗時 `null`）。CORSエラーなら authの許可リスト（`https://legal-life.saka2931.jp`）を確認
4. ヘッダーの「アカウント」は auth の `/account` へのリンク（legal-life内にアカウント画面は無い）

## 書き込み系が「permission denied for schema legal_life」になる（service_role）

`service_role` に `legal_life` スキーマの権限が無い場合に起きる（2026-09-16に修正済み。`20260916094500_grant_service_role_schema_privileges.sql`）。`select has_schema_privilege('service_role','legal_life','usage');` で確認し、`grant usage on schema legal_life to service_role; grant select, insert, update, delete on all tables in schema legal_life to service_role;` で復旧する。

## 「Deployment was blocked」でVercelのデプロイが止まる

ヘッドコミットの作者がVercelチームのメンバーでない。`git log origin/<branch> -1 --format='%an <%ae>'` を確認する。**gitの作者設定は変更しない**。誤った作者のコミットを含むPRは、正しい作者で作り直す（履歴の書き換えはしない）。

## お知らせ本文が崩れる・表示されない

お知らせ本文は `lib/sanitizeHtml.ts`（`sanitize-html`）でサニタイズしてから表示する。許可していないタグ・属性は除去される。意図したHTMLが消える場合は許可リストを確認する。過去に `isomorphic-dompurify`（jsdom依存）がturbopackバンドルでESMエラーとなり全ページ500になる障害があり、`sanitize-html` へ置き換えた（[CHANGELOG](CHANGELOG.md) 2026-09-16）。依存を変更するときはビルドと本番プレビューで全ページが500にならないことを確認する。

## 法令検索・AIチャットの429/503

- `/api/chat` の429：IP単位10回/分の制限。503：`ai_chat` フラグがOFF。上記「法令検索が表示されない・AIチャットが応答しない」も参照

## ハンバーガーメニュー表示時にTabキーが背後の要素に反応する

既知のWebアクセシビリティ課題（`components/Header.tsx`）。フォーカストラップが未実装であることが原因。`components/MaintenancePopup.tsx` で実装済みの手動Tabトラップ（`role="dialog"` + `aria-modal` + コンテナ内`querySelectorAll`によるフォーカス循環）と同じパターンを適用して修正する。準備中ページのポップアップ（`MaintenancePopup.tsx`）はフォーカストラップ実装済み。アカウント画面（旧OTP/パスキー再認証モーダル）はauthアプリへ移ったため対象外。

## アカウント削除を申請したユーザーのデータが30日経過後も残っている

アカウント削除は **auth** が担当する（申請も実削除も）。`auth_app.user_profiles` の `deletion_pending` / `scheduled_deletion` を見て、毎日19:00 UTCの `pg_cron` ジョブ（`auth-finalize-deletions`）が `auth.admin.deleteUser()` で `auth.users` を削除し、`ON DELETE CASCADE` で関連行（legal-lifeの `profiles` を含む）が連動して消える。確認と対処は authリポジトリの `docs/RUNBOOK.md`「アカウント削除関連」を参照。

> 履歴：2026-09-14の監査で「削除予約はできるが実削除の仕組みが無い」ギャップが見つかり、2026-09-15にauthへ機能を移設して解消した（[ADR](ADR.md) ADR-008）。

## エラー監視（Sentry等）は未導入

`app/error.tsx`・`app/global-error.tsx`（500系の専用画面。稼働状況ページへのリンク付き）等の本番エラーは`console.error`のみで記録され、Sentry等の外部エラートラッキングサービスとは連携していない。本番エラーの調査は、Vercelダッシュボードの **Deployments → Runtime Logs**（または`vercel logs`コマンド）でサーバー側のログを確認する（保持期間はVercelのプランに依存）。クライアント側のみで発生したエラーはVercelログに残らないため、再現手順の聞き取りやブラウザの開発者ツールでの確認も併用する。

## npm auditで重大な脆弱性が報告された

1. `npm audit --production`で報告内容を確認する
2. `npm audit fix`（breaking changeを伴わない範囲）でまず修正を試みる。Next.jsのメジャーバージョンアップ（`npm audit fix --force`）が必要な指摘は、既存コードとの互換性を確認した上で別途対応する
3. 2026-09-14の包括ドキュメント監査で、`next`由来のcritical/high脆弱性（Windows RCE等、GHSA-p293-qw3h-jr36ほか）と`nanoid`・`sharp`のhigh脆弱性を`npm audit fix`で解消済み。残っていた`postcss`（next 15内部の同梱依存、moderate/high）も2026-09-15にNext.js 16.3.5へのメジャーアップグレードを実施し解消済み

## 法令検索が表示されない・AIチャットが応答しない

1. 法令検索：e-Gov法令API（デジタル庁が提供する公開API）自体の障害・レート制限の可能性がある。`lib/lawSearch.ts`はAPIキー不要で直接エンドポイントを叩く実装のため、e-Gov側の障害情報は自前では確認できない（デジタル庁のお知らせ等を確認する）
2. AIチャット：`GEMINI_API_KEY`がVercel環境変数に正しく設定されているか確認する
3. AIチャットには1分間に10回のレート制限（`app/api/chat/route.ts`）があるため、短時間の連続失敗はこの制限に達している可能性がある
4. 機能フラグ`ai_chat`がOFFになっていないか、adacの管理画面で確認する
