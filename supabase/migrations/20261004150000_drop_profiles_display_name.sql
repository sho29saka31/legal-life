-- 表示名は全サービス共通データとして auth アプリ(auth_app.user_profiles)が所有する
-- ため、legal_life.profiles.display_name は不要になった。
--
-- 適用順序(重要):
--   1. handle_new_user() から display_name の書き込みを外す(本ファイル 1)。
--      列を先に削除すると、auth.users への INSERT(新規登録)で
--      このトリガー関数が失敗し、新規登録そのものが止まるため。
--   2. 既存の表示名を auth_app.user_profiles へ移行(未設定の利用者のみ)してから、
--      列を削除する(本ファイル 2)。
-- 実行: Supabase Dashboard の SQL Editor(各ステップを順に実行)。

-- 1. 新規登録時に display_name を書き込まない(先に実行)
create or replace function legal_life.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'legal_life'
as $$
begin
  insert into legal_life.profiles (id, photo_url)
  values (new.id, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. 列を削除する(データ移行後に実行)
-- 2026-10-05 に本番(saka2931-service)へ適用済み(移行はSporive側のmigration 0035で実施)。
alter table legal_life.profiles drop column display_name;
