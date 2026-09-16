-- セキュリティ監査(3周目)で発見: legal_life.rate_limit_access_logs()は
-- X-Forwarded-Forの「先頭」要素をクライアントIPとして扱っていた。
-- しかしこの値はPostgRESTへ直接POSTするクライアント自身が自由に設定できる
-- (Supabase/Kongが実際のクライアントIPを追記するのは末尾であり、先頭は
-- リクエスト送信者が最初から指定した任意の値)。攻撃者が毎回ランダムな
-- X-Forwarded-Forを送るだけで、IP単位の上限(120件/分)は無意味になる。
--
-- 末尾要素(Supabase/Kongが実際に観測した送信元を追記する位置)を使うよう修正する。

create or replace function legal_life.rate_limit_access_logs()
returns trigger
language plpgsql
security definer
set search_path = legal_life
as $$
declare
  v_xff text;
  v_client_ip text;
  v_recent_count int;
begin
  -- PostgRESTを介さない直接のDB接続、およびservice_role(サーバー側の管理
  -- スクリプト)は素通りさせる
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  v_xff := coalesce(current_setting('request.headers', true), '{}')::json->>'x-forwarded-for';
  -- reverse()を2回使い、カンマ区切りの最後の要素(=プロキシチェーンの最終ホップが
  -- 追記した実際の送信元)だけを取り出す。先頭要素はクライアントが自由に
  -- 詐称できるため使わない。
  v_client_ip := coalesce(
    nullif(trim(reverse(split_part(reverse(coalesce(v_xff, '')), ',', 1))), ''),
    'unknown'
  );

  -- 掃除は毎回ではなく確率的に行い、書き込みごとのオーバーヘッドを抑える
  if random() < 0.01 then
    delete from legal_life.access_logs_rate_limit
    where occurred_at < now() - interval '5 minutes';
  end if;

  select count(*) into v_recent_count
  from legal_life.access_logs_rate_limit
  where client_ip = v_client_ip and occurred_at > now() - interval '1 minute';

  if v_recent_count >= 120 then
    raise exception 'rate_limit_exceeded: too many access_logs events from this client'
      using errcode = 'P0001';
  end if;

  insert into legal_life.access_logs_rate_limit (client_ip) values (v_client_ip);

  return new;
end;
$$;

revoke execute on function legal_life.rate_limit_access_logs() from public, anon, authenticated;
