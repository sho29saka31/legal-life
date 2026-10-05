# Architecture Decision Records（legal&life）

## ADR-001: Cloudflare Pages（静的サイト）からNext.js/Vercelへ全面リライト

- **状況**：既存サイトは静的HTML/CSS/vanilla-JSサイトとしてCloudflare Pages上で運用
- **決定**：Next.js(App Router) + TypeScript + Tailwind CSSへ全面リライトし、Vercelへ移行
- **結果**：Sporive等他サービスとの技術スタック統一、SSR/動的お知らせ表示等が可能に

## ADR-002: 認証をlocalStorageからCookieベース（@supabase/ssr）へ移行

- **状況**：旧実装はlocalStorageでセッションを管理しており、SSRとの相性が悪くSSOも実現できない
- **決定**：`@supabase/ssr`によるCookieベースのセッション管理に移行
- **結果**：Sporiveとのログインセッション共有（SSO、Cookieドメイン`.saka2931.jp`）が可能に

## ADR-003: `saka2931-service`プロジェクトをSporiveと共有

- **状況**：Supabase Freeプランのプロジェクト数上限により、全サービスを個別プロジェクトで持てない
- **決定**：Sporiveと共有し、`legal_life`スキーマで論理分離
- **教訓**：カスタムスキーマは`public`と異なり`anon`/`authenticated`へのGRANTが自動付与されないため、作成時に明示的なGRANT文が必須（2026-09-14に両サービスで書き込み障害として顕在化）

## ADR-004: メール送信をGmail SMTPからResendへ移行

- **状況**：Gmail SMTPは本番運用の信頼性・送信量制限の観点で不向き
- **決定**：Resend（送信元`mail.saka2931.jp`）へ移行
- **結果**：アプリ自身が送るメールはResend経由に移行したが、その後お問い合わせはserviceへ、会員向け通知メールは機能ごと削除（2026-09-16）したため、legal-lifeのコードからResendは使わなくなった。**Supabase Auth自体が送るメール**（サインアップ確認・パスワードリセット等）のCustom SMTP設定は、auth集約（ADR-010）以降はauth側の管理項目で、`saka2931-service`共有のため全サービスに共通適用される。設定状況は [User Guide Pending Actions](User-Guide-Pending-Actions.md) §1-2 で要確認

## ADR-005: お問い合わせ・プライバシーポリシー・利用規約をserviceへ集約

- **状況**：各サービスが個別にプライバシーポリシー・利用規約・お問い合わせ窓口を持つと、内容の同期漏れ・保守コストが発生
- **決定**：`service.saka2931.jp`に集約し、legal-lifeは個別ページを廃止してリンク・リダイレクトのみ持つ
- **結果**：法的文書の一貫性を保ちやすくなった

## ADR-006: RLSポリシーにカラム単位の権限チェックをBEFORE/AFTER UPDATEトリガーで追加（セキュリティレビュー Round 1・2）

- **状況**：`profiles_update_own_or_admin`・`sessions_update_own`等のRLSポリシーは「行の所有者本人か管理者か」しかチェックしておらず、更新可能な**カラム**を制限していなかった。この結果、次の重大な脆弱性が存在した：
  1. ログイン済みの一般ユーザーがPostgREST経由で`PATCH /rest/v1/profiles?id=eq.<自分のuid>` に`{"role":"admin"}`を直接送るだけで、自分自身に管理者権限を付与できた（発見時点で管理者は1人も存在せず、誰でもこの経路で管理者になれる状態だった）
  2. セッショントークンを盗んだ攻撃者が`PATCH /rest/v1/sessions?id=eq.<盗んだセッションID>`に`{"should_logout": false}`を送ることで、正規ユーザーが実行した強制ログアウトを打ち消せた（デバイス管理機能`/account/device`の防御自体を無効化できた）
  3. `sessions`の`browser`/`os`/`device`/`location`/`login_at`等を偽装し、不正端末の発見を妨害できた
- **決定**：BEFORE UPDATEトリガー（`prevent_role_self_escalation`・`restrict_session_self_update`）でカラム単位の変更を検知し、許可されていない変更は拒否する。PostgRESTを介さない直接DB接続（SQL Editor等）と`service_role`はチェックを素通りさせる
- **追加対策**：強制ログアウト（`should_logout`のfalse→true変化）をAFTER UPDATEトリガー（`log_session_forced_logout`）で`activity_log`に監査記録として残し、`/account/activity`から確認できるようにした（SECURITY DEFINERでRLSをバイパスして挿入するが、`user_id`は改ざん不可であることが上記トリガーにより保証されているため、なりすまし挿入は発生しない）
- **結果**：行レベルの所有権チェックだけでは不十分な場合、カラム単位のBEFORE UPDATEトリガーによる追加検証が必要という教訓。同種のテーブル設計（所有者が特定カラムを直接更新できるテーブル）を新設する際は同じ観点でレビューする
- **関連する初期対策**：同種のSECURITY DEFINER関数の防御パターンとして、初期実装時点（Cloudflare Pagesからのリライト直後）から`handle_new_user()`（新規ユーザー作成時のprofilesレコード自動作成トリガー関数）の`execute`権限を`public`/`anon`/`authenticated`から`revoke`し、PostgREST経由でのRPC直接実行ができないようにしていた。これにより、修正前でも任意ユーザーがこの関数を直接叩いて`profiles`行を挿入することはできなかった

## ADR-007: SessionWatcherのRealtime購読スキーマ不一致バグを修正

- **状況**：2026-09-14の包括ドキュメント監査で、`components/SessionWatcher.tsx`の`postgres_changes`購読が`schema: "public"`を指定していることが判明。しかし本番の`sessions`テーブルは`saka2931-service`プロジェクトへの統合時に`legal_life`スキーマへ移行済みで、かつ`supabase_realtime` publicationにも`legal_life.sessions`が追加されていなかった（統合時に`public.sessions`向けの設定が引き継がれず漏れていた）。Supabase RealtimeのPostgres Changesはクライアントの`db.schema`設定を継承しないため、この不一致により強制ログアウトのRealtimeイベントは常に届かず、60秒間隔のポーリング（保険用のフォールバック）だけが実質的な唯一の経路になっていた
- **決定**：`SessionWatcher.tsx`の購読先スキーマを`legal_life`に修正し、`alter publication supabase_realtime add table legal_life.sessions;`を新規マイグレーション（`20260914060000_fix_sessions_realtime_publication_schema.sql`）として追加・本番DBにも適用
- **結果**：強制ログアウト（デバイス管理からの他端末ログアウト、ADR-006のセキュリティ対策）が即時に反映されるようになった。同種の「クライアント側`db.schema`設定とRealtime購読のスキーマ指定は別物」という落とし穴は、今後カスタムスキーマでRealtimeを使う際に再発しうるため、レビュー観点として記録する

## ADR-008: アカウント削除の実削除処理は未実装（既知のギャップ）→ 2026-09-15解消

- **状況**：2026-09-14の包括ドキュメント監査（ラウンド4）で、`/account/delete`ページが「削除申請から30日後にすべてのデータが完全削除されます。この操作は取り消せません」とユーザーに明示的に約束している（`app/account/delete/page.tsx`）一方、実装（`lib/auth/profile.ts`の`setDeletionPending()`）は`profiles.deletion_pending`フラグと`scheduled_deletion`（30日後の日時）を立ててサインアウトするだけであることが判明した。この`scheduled_deletion`到来後に実際に`auth.users`・関連データを削除するpg_cronジョブ・Edge Function・APIルートはリポジトリ内に一切存在せず、`access_logs`（90日）・`chat_history`（180日）のような自動削除cronとは異なり、削除申請後もデータは無期限に残り続ける
- **決定**：本ラウンドの監査では実装（削除実行の仕組みの新設）までは行わず、既知のギャップとして記録するに留める。理由：実際にユーザーデータを削除する仕組み（`supabase.auth.admin.deleteUser()`をservice_role権限で呼ぶ日次バッチ等）の追加は、削除範囲（どのテーブルまで消すか）・削除タイミング・監査ログの要否など製品側の判断を要する変更であり、ドキュメント監査の一存で実装すべきではないと判断した
- **結果**：ユーザー（プロダクトオーナー）に本ギャップを明示的に報告し、対応要否の判断を仰ぐ。対応するまでは、`/account/delete`ページの文言が実態（データは削除されず保持され続ける）と一致していない状態が続く。GDPR的な「消去権」に相当する機能が名目上のみ存在し実効性を持たない点は、法的リスクとしても認識しておく必要がある
- **追記（2026-09-15）**：アカウント削除機能自体を新設の`auth.saka2931.jp`アプリ（`sho29saka31/auth`リポジトリ）へ移設し、その一環として`scheduled_deletion`到来後に`auth.users`・関連データを実際に削除するpg_cronジョブ＋APIルートを新設した。本ページ（legal-lifeの`/account/delete`）は現在auth アプリへのリダイレクトのみとなり、本ギャップは解消済み

## ADR-009: コード監査（Round5）で発見したオープンリダイレクトの構造的リスク・公開INSERTテーブルの無制限書き込みを修正

- **状況**：コード監査で以下2点を発見
  1. `lib/auth/utils.ts`の`decR()`は`"/"`から始まる文字列であれば許可しており、`"//evil.com"`のようなプロトコル相対URLも`"/"`から始まるため単体では弾けない。現状は`LoginForm.tsx`・`SignupForm.tsx`の両呼び出し元で`isSafeRedirectPath()`という追加チェックを重複実装しており実害はなかったが、将来この追加チェックを経由しない3つ目の呼び出しが増えた場合や、リファクタでどちらかの安全チェックが誤って削除された場合に、ログイン/登録後に外部ドメインへ誘導されるオープンリダイレクトが再発する構造だった
  2. `access_logs`・`contact_inquiries`はRLSで「誰でもINSERT可（`with check (true)`）」となっており、テーブル定義側にも文字数・jsonbサイズの上限が一切なかった。公開anonキーがあれば、アプリのUI・レート制限を完全にバイパスして直接PostgRESTエンドポイントへ任意サイズ・無制限頻度のPOSTを送りつけられる状態だった。うち`contact_inquiries`はアプリコードから一切参照されていない（お問い合わせ窓口はservice.saka2931.jpへ統合済み）デッドテーブルで、「使われていないのに書き込みだけは誰でも可能」という状態だった
- **決定**：
  1. 安全性チェックを`decR()`自体に内包し、呼び出し元での重複実装への依存をなくす
  2. `access_logs`（現役利用中）には各text列の長さ上限・`extra`（jsonb）のサイズ上限をCHECK制約で追加。`contact_inquiries`（未使用）はINSERTポリシー自体を削除
- **結果**：オープンリダイレクトは将来の実装変更に対しても構造的に防げるようになり、公開INSERT可能な2テーブルは経済的DoS・スパム投稿への耐性を獲得した

## ADR-010: 認証・アカウント機能を `auth.saka2931.jp` に集約し、legal-lifeは転送のみにする（2026-09-16）

- **状況**：Sporive・legal-lifeは同一のSupabase Authプロジェクト（`saka2931-service`）を共有している。CAPTCHA・OAuthのリダイレクト許可リストはプロジェクト単位の設定で、一方向けの設定変更がもう一方のログインを壊した
- **決定**：ログイン・サインアップ・パスワード再設定・MFA・パスキー・端末管理・アクティビティ履歴・アカウント削除を authリポジトリに集約し、legal-lifeの `/account/*` 一式（`login` `signup` `profile` `security` `device` `activity` `delete` `logout` `privacy`）と関連コンポーネント・`lib/auth` の大半を削除した。`requireAuth()` は未ログインを `auth.saka2931.jp/login?return_to=...` へ転送するだけにした。表示名は auth の `/api/profile` 経由
- **残したもの**：アプリ固有データ（`profiles.photo_url` / `role`）、端末の登録・監視（`AuthSessionWatcher`）
- **結果**：認証設定の影響範囲がauthアプリに限定された。代償として、legal-lifeのログイン可否がauthの可用性に依存する。詳細は authリポジトリの `docs/ADR.md`
- **未完了**：`legal_life.profiles.display_name` 列は未削除（表示名が実際にauth経由で流れていることを確認した後にDROP予定）。旧機能のテーブル（`legal_life.sessions` / `activity_log` 等）も削除migrationは未発行

## ADR-011: 緊急メンテナンスはページ転送に加えてDB層（RLS）でも止める（2026-10-04）

- **状況**：adacの緊急メンテナンスがmiddlewareの転送だけで、認証済みの利用者がブラウザからSupabaseへ直接アクセスするのを止められなかった
- **決定**：`saka2931-service` に `maintenance_state` を置き、infraの`feature_flags`からトリガー+pg_netで同期（5分ごとの再同期cronで収束）。`legal_life` の全テーブルにRESTRICTIVEポリシー `maintenance_lockdown` を付け、anon/authenticatedを拒否する。管理者（`legal_life.is_admin()`）とservice_roleは復旧作業のため対象外
- **フェイルオープン**：state行が無い・同期できない場合はロックしない（誤って全サービスを止めるほうが危険と判断。ユーザー確認済み）。解除の反映が最大5分遅れうる
- **転送先の統一**：以前の `/error/503` へのrewriteをやめ、`/maintenance` の表示に統一（他アプリと同じ表示）。2026-10-05に、リダイレクト（最終的に200）をURLを変えないrewriteによる **HTTP 503＋`Retry-After: 600`** に変更した（外形監視が正常と誤判定していたため）。エラーページも標準配置（`not-found.tsx` / `error.tsx` / `global-error.tsx` / `maintenance/page.tsx`）に整理した

## ADR-012: ドキュメントはリポジトリ内 `docs/` で管理する（2026-10-04）

- **状況**：ユーザーガイド等をGitHub Wikiで管理していたが、リポジトリを非公開化したため可視性・レビュー導線が弱くなった
- **決定**：Wikiのページ群を `docs/` にそのまま取り込み、リンクを相対パス（`*.md`）に変更。`Home.md` を目次とし、変更はPRでレビューする
- **結果**：コードと同じ履歴でドキュメントを管理できる。旧 `docs/user_guide.md`（単一ファイル）は `User-Guide*.md` に置き換えた
