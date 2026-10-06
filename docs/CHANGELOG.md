# Changelog（legal&life）

このセッションで把握している主要な変更履歴。日付が特定できないものは実施内容のみ記載。

## 2026-10-06（ポニーテール再監査）
- 参照のないコードを削除：`lib/deviceInfo.ts`、`lib/supabase/serverClient.ts`、表示名の更新をauthへ移した後に残っていた `updateDisplayName()`、使われていない依存 `resend`（メール送信はserviceへ移行済み）
## 2026-10-05（.env.local.exampleをGitHubから削除）
- サンプルの環境変数ファイル `.env.local.example` を、GitHub上の全履歴から削除した（`git filter-repo` による履歴の書き換え。過去のコミットのSHAはすべて変わっている）。`.gitignore` で再追加を防ぎ、README・docsのセットアップ手順を `docs/ENVIRONMENT.md` の参照に変更した。履歴中に秘密の値（APIキー等）は含まれていなかった

## 2026-10-05
- ドキュメント監査：READMEのメンテナンス記述を503の挙動に合わせた
- 表示名をauthに統一（#48）。本番DBの `legal_life.profiles.display_name` 列を削除（ADR-010の未完了事項のうち表示名の列は完了。旧アカウント機能のテーブル削除は未実施）
- 緊急メンテナンスの `/maintenance` を、リダイレクト（最終的に200）からURLを変えないrewriteによる **HTTP 503＋`Retry-After: 600`** に変更。外形監視が正常と誤判定していた問題の解消。稼働状況ページへの自動連動はadac側

## 2026-10-04
- ドキュメント更新：Supabase AuthのCustom SMTP（Resend）は設定済み（Sender nameは `auth` に統一）、漏洩パスワード保護は有料プラン向けのため利用不可、メール送信のレート制限は未調整の可能性があり要確認、と反映
- ドキュメント一式をWikiから `docs/` へ取り込み、現行仕様に合わせて更新（ADR-012）。旧 `docs/user_guide.md` は `User-Guide*.md` に置き換え
- 全ページのmetadata説明文を書き換え、OGP・Twitterカード・canonicalを整備（`lib/seo.ts`）
- エラーページを標準の配置（`not-found.tsx` / `error.tsx` / `global-error.tsx` / `maintenance/page.tsx`）へ整理し、緊急メンテナンス時は `/maintenance` へのリダイレクトに統一（以前は `/error/503` へのrewrite。ADR-011）
- 緊急メンテナンスが `saka2931-service` のRLS（`maintenance_lockdown`）でも効くようになった（adac→infra→service同期）。`legal_life` の全テーブルが対象で、管理者とservice_roleは対象外

## 2026-09-20
- `CLAUDE.md` にponytail（怠け者のシニア開発者）規約を導入し、Phase D移行で残った未使用コードを削除

## 2026-09-16（認証機能のauthアプリへの一元化、Phase D）
- ログイン・サインアップ・パスワード再設定・MFA・パスキー・端末管理・アクティビティ履歴・アカウント削除を `auth.saka2931.jp` へ完全移管。legal-lifeの `/account/*` 一式を削除し、`requireAuth()` は auth への転送のみに（ADR-010）。表示名は auth の `/api/profile` 経由（`lib/auth/profile.ts`）
- `AuthSessionWatcher` を新設（`auth_app.sessions` にこの端末を登録・監視。旧 `SessionWatcher` の後継）
- 会員向け通知メール（`/api/mail`・`lib/mail/resend.ts`）機能を削除。アプリからのメール送信は無くなった
- `service_role` に `legal_life` スキーマの権限が無かった点を修正（`20260916094500`）
- サニタイズ処理を `isomorphic-dompurify`（jsdom）から `sanitize-html` へ置き換え。jsdom依存がturbopackバンドルでESMエラーとなり全ページ500になる障害の再発を根本的に解消（#37・#38）
- **[Medium]** `access_logs` のレート制限がXFF偽装で無効化できた点を修正（`x-vercel-forwarded-for` 基準へ。`20260916051500`）。お知らせ本文のXSS対策・セキュリティヘッダーを追加（#36）

## 2026-09-15（追記）
- `robots.txt` を追加し、正式公開前ページのクロールを抑制（#34）

## 2026-09-15
- アカウント削除(予約制)機能をauthアプリ(`auth.saka2931.jp`)へ移設。`/account/delete`は外部リンクへのリダイレクトに変更。**下記「既知の問題」にあった実削除未実装の問題は、auth側に猶予期間経過後の削除を実行するpg_cron+APIルートを新設したことで解消済み**（`sho29saka31/auth`リポジトリ参照）
- 全リポジトリ横断セキュリティ監査（security-reviewスキル）で発見・修正:
  - **[Medium]** `api/chat/route.ts`のレート制限がX-Forwarded-Forの先頭要素（クライアントが自由に付与できる値）をキーにしており、リクエストごとにランダムなIPを送るだけで無効化できた。改ざん不可な`x-vercel-forwarded-for`に切り替え
  - **[Medium]** お知らせ本文（`service_announcements.body`）を無サニタイズで`dangerouslySetInnerHTML`していた。書き込みは管理コンソール(adac)経由のみだが、多層防御として`isomorphic-dompurify`でサニタイズ
  - **[Low]** `access_logs`に頻度制限が一切なく、未認証で誰でも到達できるためDB肥大化・DoSのリスクがあった。IPアドレス単位のレート制限トリガーを追加
  - `api/chat/route.ts`の例外メッセージをそのまま返していた箇所を汎用メッセージに変更（内部実装の詳細漏洩防止）
  - `next.config.ts`にセキュリティヘッダーを追加
  - Next.js 15→16.3.5に更新（前回「既知の受容リスク」としていたpostcssのmoderate/high脆弱性もこれで解消）

## 2026-09-14
- ハンバーガーメニューの「アカウント」が常にログイン画面になる不具合を修正
- `legal_life`スキーマの`anon`/`authenticated`ロールへのテーブルGRANT漏れを修正（Sporiveと同時に発覚。プロフィール登録・各種書き込みが失敗する障害の原因）
- ドキュメント整理：`docs/session-handoff.md`（旧Firebase移行ログ）・`docs/vercel-new-project-guide.md`（完了済みセットアップ手順）を削除、`docs/user_guide.md`を最新化、README全面刷新、`.env.local.example`を新規作成
- ユーザーガイドをGitHub Wikiへ移行
- 包括ドキュメント監査で発見：`SessionWatcher.tsx`のRealtime購読スキーマ不一致により強制ログアウトの即時反映が機能していなかったバグを修正（[ADR](ADR.md) ADR-007参照）
- 包括ドキュメント監査（ラウンド2）で発見：`/account`・`/account/activity`のUI表示が「アクティビティ履歴は最大1年/過去1年間」となっていたが、実際は`activity_log`に自動削除ジョブがなく無期限保持だった（表示とデータ保持の不一致）。UI文言を「最新50件」に修正
- 包括ドキュメント監査（ラウンド3）で発見：`components/MaintenancePopup.tsx`（準備中ページのポップアップ）にフォーカストラップが未実装だった問題を修正（`OtpPanel.tsx`と同じパターンを適用）。`npm audit fix`で`next`由来のcritical/high脆弱性・`nanoid`/`sharp`のhigh脆弱性を解消（`postcss`のmoderate/highはNext.js 16メジャーアップグレードが必要なため既知の受容リスクとして残存）
- 包括ドキュメント監査（ラウンド4）で発見：アカウント削除ページが「30日後に完全削除されます」と表示するが、`scheduled_deletion`到来後に実際の削除を実行するcronジョブ・APIが実装されていないことが判明（[ADR](ADR.md) ADR-008参照）
- `lib/browserInfo.ts`の`fetchLocation()`が外部サービス（ipapi.co、失敗時はCloudflareのtraceエンドポイント）へブラウザから直接IPアドレスを送信していた。プライバシーポリシーへの開示漏れが監査で発覚し、この外部送信を停止（呼び出し元`AccessLogger.tsx`・`lib/auth/session.ts`の変更は避け、`fetchLocation()`は常に「不明」を返すのみに変更。ログイン地域・アクセス地域のUI表示自体は維持）
- コード監査（ラウンド5・セキュリティ観点）で発見：`decR()`単体では防げないオープンリダイレクトの構造的リスク、`access_logs`/`contact_inquiries`への無制限・無検証な公開INSERTを修正（PR #32）
- コード監査（ラウンド6・ロジック/正確性観点）で発見：共有端末で別ユーザーがログインするとセッション登録が失敗し後発ユーザーのセッションがDBに一切登録されない問題、複数登録したTOTPファクターのうち先頭以外が実際には機能しない問題、ログイン方法ページの「最後の手段」判定がパスキーを数えていなかった問題を修正（PR #33）

## 全面リライト（Cloudflare Pages → Next.js/Vercel）
- 静的HTML/CSS/vanilla-JSサイト（Cloudflare Pages）から、Next.js(App Router) + TypeScript + Tailwind CSSへ全面リライトし、Vercelへ移行

## 認証基盤の刷新
- localStorage認証からCookieベース（`@supabase/ssr`）へ移行
- Cookieドメインを`.saka2931.jp`に設定し、Sporiveとのログインセッション共有（SSO）に対応
- Google OAuth・パスキー(WebAuthn)・TOTPによる2段階認証を追加

## セキュリティレビュー（Round 1・2）
- `profiles.role`の権限昇格を防止：RLSポリシーがカラム単位の制限をしていなかったため、一般ユーザーがPostgREST経由で自分自身に管理者権限を付与できる脆弱性を発見・修正（BEFORE UPDATEトリガー`prevent_role_self_escalation`を追加）
- `sessions.should_logout`の巻き戻しを防止：セッショントークンを盗んだ攻撃者が強制ログアウトを打ち消せる脆弱性を発見・修正（BEFORE UPDATEトリガー`restrict_session_self_update`を追加。`browser`/`os`/`device`/`location`/`login_at`等の偽装も同時に防止）
- 強制ログアウトの監査証跡を追加：`should_logout`のfalse→true変化を`activity_log`に自動記録するAFTER UPDATEトリガー（`log_session_forced_logout`）を追加し、`/account/activity`から確認可能に
- 詳細は [ADR](ADR.md) ADR-006を参照

## データ保持ポリシー
- `access_logs`：90日を超えたものをpg_cronで日次自動削除
- `chat_history`（AIチャット履歴、ログイン中のみSupabaseに保存）：180日を超えたものをpg_cronで日次自動削除

## データベース基盤の統合
- 独自のSupabaseプロジェクトから、Sporiveと共有する`saka2931-service`プロジェクト（`legal_life`スキーマ）へ移行
- 注意：`supabase/migrations/`の既存ファイルは`public`スキーマを前提に書かれたままで、`public`→`legal_life`への実際のテーブル移動はマイグレーション履歴として残っていない（手動操作）。新規環境を構築する場合は、マイグレーション適用後に別途`legal_life`スキーマへの移動が必要
- 初期実装（Cloudflare Pagesからのリライト時）で作成した`announcements`・`contents`・`history`の3テーブルは、saka2931-infra参照への切替後は完全に未使用（デッドテーブル）。クリーンアップ用のDROPマイグレーションは未実施

## メール送信基盤の移行
- Gmail SMTPからResendへ移行（送信元ドメイン`mail.saka2931.jp`）
- Supabase Auth自体のメール（サインアップ確認・パスワードリセット等）についてもCustom SMTP設定でResend経由に切り替える予定（設定自体はユーザー作業待ちで本セッション終了時点では未完了。[User Guide Pending Actions](User-Guide-Pending-Actions.md) §1-2参照）

## saka2931.jpインフラ統合
- お知らせ機能を`saka2931-infra`の`service_announcements`参照に変更し、`/info`・`/info/details/[slug]`を動的化。ヘッダーバナーを`show_in_bar`列で制御
- 既存お知らせ(~20件)を`service_announcements`へ移行
- 機能フラグ（緊急メンテナンス・アカウント機能・メール送信・AIチャット）を`saka2931-infra`の`feature_flags`参照で実装
- お問い合わせを`service.saka2931.jp/contact/legal-life`へ集約、旧お問い合わせページ・管理画面を廃止しリダイレクト
- プライバシーポリシー・利用規約の文言を`service.saka2931.jp`と重複排除

## その他
- `error.tsx`/`global-error.tsx`を新規作成
- アカウント削除予定日の表示をJSTに統一

## 既知の問題
- Webアクセシビリティ：ハンバーガーメニュー表示時に、背後の要素にTabキーが反応してしまう問題を調査中（アカウントログイン画面のOTP/パスキー再認証モーダルは解消済み、詳細は[Runbook](RUNBOOK.md)参照）
- ~~アカウント削除の実削除処理が未実装（[ADR](ADR.md) ADR-008参照）~~ → 2026-09-15解消。アカウント削除機能をauthアプリへ移設し、猶予期間経過後の実削除を実行するpg_cron+APIルートを新設済み（上記「2026-09-15」参照）
