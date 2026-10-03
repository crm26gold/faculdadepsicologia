-- Shared admission limits, independent of model/vendor and Vercel cold starts.
-- These are application reservations, not provider billing or total Supabase egress.
create table private.jornada_global_budgets (
  scope text primary key check (scope in ('ai','live','upload','media')),
  minute_limit bigint not null check (minute_limit > 0),
  day_limit bigint not null check (day_limit > 0),
  window_limit bigint not null check (window_limit > 0),
  minute_start timestamptz not null default '-infinity',
  minute_count bigint not null default 0 check (minute_count >= 0),
  created_at timestamptz not null default now()
);
create table private.jornada_budget_days (
  scope text not null references private.jornada_global_budgets(scope),
  day_start timestamptz not null,
  units bigint not null check (units >= 0),
  primary key (scope,day_start)
);
alter table private.jornada_global_budgets enable row level security;
alter table private.jornada_budget_days enable row level security;
revoke all on private.jornada_global_budgets, private.jornada_budget_days from public,anon,authenticated;

insert into private.jornada_global_budgets(scope,minute_limit,day_limit,window_limit) values
  ('ai',80,600,6000), ('live',8,30,300), ('upload',40,100,1000),
  ('media',150000000,300000000,4000000000);

-- Application admission is independent of whether Telegram has been configured.
-- Reuse the existing server derivation for compatibility, but keep its verifier separate.
create table private.jornada_budget_server (
  id boolean primary key default true check(id),
  secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$')
);
alter table private.jornada_budget_server enable row level security;
revoke all on private.jornada_budget_server from public,anon,authenticated;
insert into private.jornada_budget_server(id,secret_hash) select id,secret_hash from private.bot_server;

create function private.jornada_budget_check(server_secret text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if server_secret is null or length(server_secret) not between 32 and 128 or not exists(
    select 1 from private.jornada_budget_server where secret_hash=encode(extensions.digest(server_secret,'sha256'),'hex')
  ) then raise exception 'Application server not authorized' using errcode='42501'; end if;
end $$;
revoke all on function private.jornada_budget_check(text) from public,anon,authenticated;

-- Only the owner may establish/rotate the server verifier. The caller sends its hash, never a client key.
create function public.configure_jornada_budget_guard(server_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  if server_hash is null or server_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid server verifier' using errcode='22023'; end if;
  insert into private.jornada_budget_server as guard(id,secret_hash) values(true,server_hash)
    on conflict(id) do update set secret_hash=excluded.secret_hash where guard.secret_hash is distinct from excluded.secret_hash;
  return true;
end $$;
revoke all on function public.configure_jornada_budget_guard(text) from public,anon;
grant execute on function public.configure_jornada_budget_guard(text) to authenticated;

-- Lock the scope first, then the account. Reserve both counters or neither.
-- No external calls, retryable business exceptions, unbounded history, or user-chosen limits.
create function private.reserve_jornada_budget(actor uuid,budget_scope text,budget_units integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  current_at timestamptz; minute_at timestamptz; day_at timestamptz;
  account_minute integer; account_day integer; minute_used integer; day_used integer;
  global_day bigint; global_window bigint; global_minute bigint; retry_at timestamptz;
  policy private.jornada_global_budgets%rowtype;
  personal private.jornada_request_limits%rowtype;
begin
  if actor is null or not exists(select 1 from public.accounts where user_id=actor) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  case budget_scope
    when 'ai' then account_minute:=40; account_day:=400;
    when 'live' then account_minute:=4; account_day:=40;
    when 'upload' then account_minute:=20; account_day:=100;
    when 'media' then account_minute:=104857600; account_day:=1073741824;
    else raise exception 'Invalid scope' using errcode='22023';
  end case;
  if budget_units is null or budget_units<1 or budget_units>26214400
     or (budget_scope<>'media' and budget_units<>1) then
    raise exception 'Invalid units' using errcode='22023';
  end if;
  select * into strict policy from private.jornada_global_budgets where scope=budget_scope for update;
  current_at:=clock_timestamp();
  minute_at:=date_trunc('minute',current_at);
  day_at:=date_trunc('day',current_at at time zone 'UTC') at time zone 'UTC';
  insert into private.jornada_request_limits(user_id,scope,minute_start,minute_count,day_start,day_count)
    values(actor,budget_scope,minute_at,0,day_at,0) on conflict(user_id,scope) do nothing;
  select * into strict personal from private.jornada_request_limits where user_id=actor and scope=budget_scope for update;
  minute_used:=case when personal.minute_start=minute_at then personal.minute_count else 0 end;
  day_used:=case when personal.day_start=day_at then personal.day_count else 0 end;
  if day_used>account_day-budget_units or minute_used>account_minute-budget_units then
    retry_at:=case when day_used>account_day-budget_units then day_at+interval '1 day' else minute_at+interval '1 minute' end;
    return jsonb_build_object('allowed',false,'limited_by','account','retry_after',greatest(1,ceil(extract(epoch from retry_at-current_at))));
  end if;
  select coalesce(sum(units) filter(where day_start=day_at),0),coalesce(sum(units),0)
    into global_day,global_window from private.jornada_budget_days
    where scope=budget_scope and day_start>=day_at-interval '30 days';
  global_minute:=case when policy.minute_start=minute_at then policy.minute_count else 0 end;
  if global_window>policy.window_limit-budget_units or global_day>policy.day_limit-budget_units or global_minute>policy.minute_limit-budget_units then
    if global_window>policy.window_limit-budget_units then
      select min(day_start)+interval '31 days' into retry_at from private.jornada_budget_days
        where scope=budget_scope and units>0 and day_start>=day_at-interval '30 days';
    elsif global_day>policy.day_limit-budget_units then retry_at:=day_at+interval '1 day';
    else retry_at:=minute_at+interval '1 minute'; end if;
    return jsonb_build_object('allowed',false,'limited_by','application','retry_after',greatest(1,ceil(extract(epoch from retry_at-current_at))));
  end if;
  update private.jornada_request_limits set minute_start=minute_at,minute_count=minute_used+budget_units,
    day_start=day_at,day_count=day_used+budget_units where user_id=actor and scope=budget_scope;
  update private.jornada_global_budgets set minute_start=minute_at,minute_count=global_minute+budget_units where scope=budget_scope;
  insert into private.jornada_budget_days as existing(scope,day_start,units) values(budget_scope,day_at,budget_units)
    on conflict(scope,day_start) do update set units=existing.units+excluded.units;
  delete from private.jornada_budget_days where scope=budget_scope and day_start<day_at-interval '30 days';
  return jsonb_build_object('allowed',true);
end $$;
revoke all on function private.reserve_jornada_budget(uuid,text,integer) from public,anon,authenticated;

-- Keep the legacy account-only RPC: a browser can spend only its own quota there.
-- Shared admission additionally requires proof of the application server, not just a public client JWT.
create function public.app_consume_jornada_budget(server_secret text,budget_scope text,budget_units integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.jornada_budget_check(server_secret);
  return private.reserve_jornada_budget(auth.uid(),budget_scope,budget_units);
end $$;
revoke all on function public.app_consume_jornada_budget(text,text,integer) from public,anon;
grant execute on function public.app_consume_jornada_budget(text,text,integer) to authenticated;

-- The bot cannot pick an arbitrary account: resolve the currently linked channel after checking its server secret.
create function public.bot_consume_jornada_budget(server_secret text,channel_id text,chat text,budget_scope text,budget_units integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  perform private.bot_check(server_secret);
  if budget_scope not in ('ai','upload') then raise exception 'Invalid scope' using errcode='22023'; end if;
  select user_id into actor from public.messenger_links where channel=channel_id and chat_id=chat;
  return private.reserve_jornada_budget(actor,budget_scope,budget_units);
end $$;
revoke all on function public.bot_consume_jornada_budget(text,text,text,text,integer) from public,authenticated;
grant execute on function public.bot_consume_jornada_budget(text,text,text,text,integer) to anon;

-- Aggregate counters only. No messages, attachment names, account identities, or credentials.
create function public.jornada_budget_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare day_at timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; result jsonb;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object('scope',scope,'day_used',day_used,'day_limit',day_limit,
      'window_used',window_used,'window_limit',window_limit,'observed_since',created_at,
      'level',case when day_used>=day_limit or window_used>=window_limit then 'blocked'
        when day_used*100>=day_limit*90 or window_used*100>=window_limit*90 then 'critical'
        when day_used*100>=day_limit*75 or window_used*100>=window_limit*75 then 'warning' else 'normal' end) order by scope)
    into result from (
      select p.scope,p.day_limit,p.window_limit,p.created_at,
        coalesce(sum(d.units) filter(where d.day_start=day_at),0) as day_used,coalesce(sum(d.units),0) as window_used
      from private.jornada_global_budgets p left join private.jornada_budget_days d
        on d.scope=p.scope and d.day_start>=day_at-interval '30 days'
      group by p.scope) counters;
  return jsonb_build_object('window_days',31,'day_resets_at',day_at+interval '1 day','items',result);
end $$;
revoke all on function public.jornada_budget_status() from public,anon;
grant execute on function public.jornada_budget_status() to authenticated;
