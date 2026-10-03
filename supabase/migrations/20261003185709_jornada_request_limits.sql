-- Small fixed rows per account, instead of process-local limits that reset on every cold start.
create table private.jornada_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('ai','live','upload','media')),
  minute_start timestamptz not null,
  minute_count integer not null check (minute_count >= 0),
  day_start timestamptz not null,
  day_count integer not null check (day_count >= 0),
  primary key (user_id,scope)
);
alter table private.jornada_request_limits enable row level security;
create policy own_request_limits on private.jornada_request_limits for select to authenticated using ((select auth.uid())=user_id);
revoke all on private.jornada_request_limits from public,anon,authenticated;

create function public.consume_jornada_budget(budget_scope text, budget_units integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_time_utc timestamptz := clock_timestamp();
  minute_at timestamptz := date_trunc('minute',current_time_utc);
  day_at timestamptz := date_trunc('day',current_time_utc at time zone 'UTC') at time zone 'UTC';
  minute_limit integer; day_limit integer; accepted boolean; row_state private.jornada_request_limits%rowtype;
begin
  if actor is null or not exists(select 1 from public.accounts where user_id=actor) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  case budget_scope
    when 'ai' then minute_limit:=40; day_limit:=400;
    when 'live' then minute_limit:=4; day_limit:=40;
    when 'upload' then minute_limit:=20; day_limit:=100;
    when 'media' then minute_limit:=104857600; day_limit:=1073741824;
    else raise exception 'Invalid scope' using errcode='22023';
  end case;
  if budget_units<1 or budget_units is null or (budget_scope<>'media' and budget_units<>1) or budget_units>26214400 then
    raise exception 'Invalid units' using errcode='22023';
  end if;
  insert into private.jornada_request_limits as existing(user_id,scope,minute_start,minute_count,day_start,day_count)
    values(actor,budget_scope,minute_at,budget_units,day_at,budget_units)
  on conflict(user_id,scope) do update set
    minute_start=minute_at,
    minute_count=case when existing.minute_start=minute_at then existing.minute_count+budget_units else budget_units end,
    day_start=day_at,
    day_count=case when existing.day_start=day_at then existing.day_count+budget_units else budget_units end
  where (existing.minute_start<>minute_at or existing.minute_count<=minute_limit-budget_units)
    and (existing.day_start<>day_at or existing.day_count<=day_limit-budget_units)
  returning true into accepted;
  if accepted then return jsonb_build_object('allowed',true); end if;
  select * into row_state from private.jornada_request_limits where user_id=actor and scope=budget_scope;
  return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from
    (case when row_state.day_start=day_at and row_state.day_count>day_limit-budget_units then day_at+interval '1 day' else minute_at+interval '1 minute' end)-current_time_utc))));
end $$;
revoke all on function public.consume_jornada_budget(text,integer) from public,anon;
grant execute on function public.consume_jornada_budget(text,integer) to authenticated;
