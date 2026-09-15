-- コード監査で発見: access_logs・contact_inquiriesはRLSで「誰でもINSERT可
-- (with check (true))」となっており、かつテーブル定義側にも文字数・サイズの
-- 上限が一切ないため、公開anonキーを使えばアプリのUI・レート制限を完全に
-- バイパスして、任意サイズ・無制限頻度のPOSTを直接PostgRESTエンドポイントに
-- 送りつけられる(ストレージ/コストの浪費、スパム投稿)状態だった。

-- access_logs: AccessLogger.tsxから実際に書き込まれる現役テーブルのため、
-- INSERT自体は許可したまま、各text列に妥当な長さ上限を設ける
alter table public.access_logs
  add constraint access_logs_path_length check (path is null or char_length(path) <= 500),
  add constraint access_logs_browser_length check (browser is null or char_length(browser) <= 200),
  add constraint access_logs_os_length check (os is null or char_length(os) <= 200),
  add constraint access_logs_device_length check (device is null or char_length(device) <= 200),
  add constraint access_logs_screen_length check (screen is null or char_length(screen) <= 50),
  add constraint access_logs_lang_length check (lang is null or char_length(lang) <= 50),
  add constraint access_logs_theme_length check (theme is null or char_length(theme) <= 50),
  add constraint access_logs_country_length check (country is null or char_length(country) <= 100),
  add constraint access_logs_region_length check (region is null or char_length(region) <= 100),
  add constraint access_logs_city_length check (city is null or char_length(city) <= 100),
  add constraint access_logs_extra_size check (pg_column_size(extra) <= 4096);

-- contact_inquiries: 現在のアプリコードからは一切参照されておらず(お問い合わせ
-- 窓口はservice.saka2931.jp/contact/legal-lifeへ統合済み)、「使われていないのに
-- 誰でも書き込みだけは可能」という状態だったため、書き込み経路自体を閉じる
drop policy "contact_inquiries_insert_anyone" on public.contact_inquiries;
