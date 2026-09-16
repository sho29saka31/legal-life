-- 20260914051413_grant_schema_privileges.sqlでanon/authenticatedへのテーブル
-- 権限付与漏れを修正した際、service_roleへの付与を見落としていた。service_role
-- はRLSをバイパスする権限を持つが、それとは別にテーブルレベルのGRANT自体が
-- 必要であるため、service_roleを使う機能があればPostgRESTから
-- 「permission denied for table」相当(403)で失敗する状態だった
-- (Sporive側の管理者ダッシュボードで実際に発覚。同一プロジェクト内の
-- legal_lifeスキーマでも同じ抜け漏れがあったため合わせて修正する)。
--
-- RLSは既存ポリシーのまま各テーブルで有効化されているが、service_roleは
-- バイパスするため実害はない。

grant usage on schema legal_life to service_role;
grant select, insert, update, delete on all tables in schema legal_life to service_role;

-- 今後このスキーマに新しいテーブルが追加された際にも
-- 同じ付与漏れが再発しないよう、デフォルト権限として設定しておく
alter default privileges in schema legal_life grant select, insert, update, delete on tables to service_role;
