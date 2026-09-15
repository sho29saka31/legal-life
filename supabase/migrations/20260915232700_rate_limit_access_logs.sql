-- access_logsはRLSで「誰でもINSERT可能」(with_check: true)になっており、
-- 頻度制限が一切なかった。未認証で誰でも到達できるため、DB肥大化・DoSの
-- リスクがある(コード監査で発見)。PostgRESTが公開するrequest.headers GUC
-- からクライアントIPを取り出し、IPアドレス単位で1分あたりの件数を制限する。

create table if not exists legal_life.access_logs_rate_limit (
  client_ip text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_access_logs_rate_limit_ip_time
  on legal_life.access_logs_rate_limit (client_ip, occurred_at);

-- レート制限用の内部データであり、誰からもPostgREST経由で直接読み書きさせない
alter table legal_life.access_logs_rate_limit enable row level security;

create or replace function legal_life.rate_limit_access_logs()
returns trigger
language plpgsql
security definer
set search_path = legal_life
as $$
declare
  v_client_ip text;
  v_recent_count int;
begin
  -- PostgRESTを介さない直接のDB接続、およびservice_role(サーバー側の管理
  -- スクリプト)は素通りさせる
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  v_client_ip := coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true), '{}')::json->>'x-forwarded-for', ',', 1), ''),
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

drop trigger if exists access_logs_rate_limit on legal_life.access_logs;
create trigger access_logs_rate_limit
  before insert on legal_life.access_logs
  for each row
  execute function legal_life.rate_limit_access_logs();

revoke execute on function legal_life.rate_limit_access_logs() from public;
revoke execute on function legal_life.rate_limit_access_logs() from anon;
revoke execute on function legal_life.rate_limit_access_logs() from authenticated;
