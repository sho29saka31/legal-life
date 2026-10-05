# User Guide: Known Issues（legal&life）

[User Guide](User-Guide.md) の一部。未解決の問題(§3)。

- **ハンバーガーメニューのフォーカストラップ未実装**：ハンバーガーメニュー表示時に、背後の要素にTabキーが反応してしまう(Webアクセシビリティ。`components/Header.tsx`)。調査中。詳細は [Runbook](RUNBOOK.md) を参照してください。アカウント画面(旧OTP/パスキー再認証モーダル)はauthアプリへ移ったため、このリポジトリの課題ではなくなりました。
- **旧アカウント機能のテーブルが未削除**：旧アカウント機能のテーブル(`sessions` / `activity_log` 等)は未使用のままDBに残っています(削除migrationは未発行。[ADR](ADR.md) ADR-010)。表示名の列(`legal_life.profiles.display_name`)は2026-10-05に削除済みです。
- **未使用の旧テーブル**：初期実装で作成した `announcements` / `contents` / `history`(infra参照への切替後は未使用)と、お問い合わせの旧 `contact_inquiries` も未削除です。
