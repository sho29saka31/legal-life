-- saka2931-serviceへの移行(legal_lifeスキーマ化)の際、publicスキーマでは
-- Supabaseが自動的に設定するanon/authenticatedロールへのテーブル権限(GRANT)を、
-- 非publicスキーマでは自動設定してくれないため付与し忘れていた。RLSポリシー
-- 自体は正しく作成済みだったが、RLS評価より手前のテーブルレベルの権限が
-- 無かったため、PostgREST経由の全クエリが「permission denied for table」で
-- 失敗していた(エラーを握りつぶす読み取り処理では気づきにくく、書き込み
-- 処理では失敗として表面化していた)。
--
-- RLSは既存ポリシーのまま各テーブルで有効化されているため、ここで広くGRANTしても
-- 実際のアクセス範囲はRLSにより制限される。

grant usage on schema legal_life to anon, authenticated;
grant select, insert, update, delete on all tables in schema legal_life to anon, authenticated;
grant usage, select on all sequences in schema legal_life to anon, authenticated;

-- 今後このスキーマに新しいテーブル・シーケンスが追加された際にも
-- 同じ付与漏れが再発しないよう、デフォルト権限として設定しておく
alter default privileges in schema legal_life grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema legal_life grant usage, select on sequences to anon, authenticated;
