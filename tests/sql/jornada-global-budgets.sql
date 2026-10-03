-- Live-safe test: synthetic accounts, no persistent changes; all rolled back.
begin;
set local statement_timeout='10s';
select set_config('jornada.budget.first',gen_random_uuid()::text,true);
select set_config('jornada.budget.second',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
  (current_setting('jornada.budget.first')::uuid,'budget-'||current_setting('jornada.budget.first')||'@example.invalid'),
  (current_setting('jornada.budget.second')::uuid,'budget-'||current_setting('jornada.budget.second')||'@example.invalid');
insert into private.bot_server(id,secret_hash) values(true,encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex'))
  on conflict(id) do update set secret_hash=excluded.secret_hash;
insert into private.jornada_budget_server(id,secret_hash) values(true,encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex'))
  on conflict(id) do update set secret_hash=excluded.secret_hash;
-- Changes to shared counters are held in this short transaction and rolled back.
delete from private.jornada_budget_days;
update private.jornada_global_budgets set minute_start='-infinity',minute_count=0;
update private.jornada_global_budgets set minute_limit=100,day_limit=2,window_limit=3 where scope='ai';
select set_config('request.jwt.claim.sub',current_setting('jornada.budget.first'),true);
set local role authenticated;
do $$ begin
  begin perform public.app_consume_jornada_budget(null,'ai'); raise exception 'Browser spent shared budget without server proof'; exception when insufficient_privilege then null; end;
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'<>'true' then raise exception 'First reservation blocked'; end if;
  begin perform public.jornada_budget_status(); raise exception 'Non-owner saw global usage'; exception when insufficient_privilege then null; end;
  begin perform public.configure_jornada_budget_guard(repeat('a',64)); raise exception 'Non-owner replaced server verifier'; exception when insufficient_privilege then null; end;
  begin perform private.reserve_jornada_budget(current_setting('jornada.budget.second')::uuid,'ai',1); raise exception 'Client selected another account'; exception when insufficient_privilege then null; end;
  begin update private.jornada_global_budgets set window_limit=999999; raise exception 'Client changed global policy'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('jornada.budget.second'),true);
do $$ declare result jsonb; begin
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'<>'true' then raise exception 'Second account blocked early'; end if;
  result:=public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai');
  if result->>'allowed'<>'false' or result->>'limited_by'<>'application' or (result->>'retry_after')::integer<1 then raise exception 'Global day cap bypassed'; end if;
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','upload')->>'allowed'<>'true' then raise exception 'Unrelated scope blocked'; end if;
end $$;
reset role;
do $$ begin
  if (select day_count from private.jornada_request_limits where user_id=auth.uid() and scope='ai')<>1 then raise exception 'Denied request charged account'; end if;
  if (select sum(units) from private.jornada_budget_days where scope='ai')<>2 then raise exception 'Denied request charged application'; end if;
end $$;
-- Yesterday plus today must still count: neither midnight nor month boundaries clear the rolling window.
update private.jornada_budget_days set day_start=day_start-interval '1 day' where scope='ai';
set local role authenticated;
do $$ begin
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'<>'true' then raise exception 'New day rejected below window cap'; end if;
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'<>'false' then raise exception 'Rolling cap bypassed on new day'; end if;
end $$;
reset role;
-- Expired buckets release capacity and are removed after the next accepted reservation.
update private.jornada_budget_days set day_start=day_start-interval '31 days' where scope='ai';
set local role authenticated;
do $$ begin if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai')->>'allowed'<>'true' then raise exception 'Expired window did not release capacity'; end if; end $$;
reset role;
do $$ begin if (select count(*) from private.jornada_budget_days where scope='ai')<>1 then raise exception 'Old counters retained'; end if; end $$;
-- A 4 GB ceiling exceeds int32; bytes must use bigint across accounts.
update private.jornada_global_budgets set minute_limit=5000000000,day_limit=5000000000 where scope='media';
insert into private.jornada_budget_days(scope,day_start,units)
  values('media',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',3999999999);
set local role authenticated;
do $$ begin
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','media',1)->>'allowed'<>'true' then raise exception 'Last byte blocked'; end if;
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','media',1)->>'allowed'<>'false' then raise exception '4 GB ceiling bypassed'; end if;
end $$;
reset role;
-- Read only the aggregate as the existing owner; never edit app_owner or personal records.
-- The application can bootstrap independently, including with no Telegram verifier.
delete from private.jornada_budget_server;
delete from private.bot_server;
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_owner),true);
set local role authenticated;
do $$ declare state jsonb; begin
  begin perform public.configure_jornada_budget_guard('invalid'); raise exception 'Invalid verifier stored'; exception when invalid_parameter_value then null; end;
  if not public.configure_jornada_budget_guard(encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex')) then raise exception 'Owner bootstrap failed'; end if;
  state:=public.jornada_budget_status();
  if state->>'window_days'<>'31' or jsonb_array_length(state->'items')<>4 then raise exception 'Usage snapshot incomplete'; end if;
  if not exists(select 1 from jsonb_array_elements(state->'items') i where i->>'scope'='media' and i->>'level'='blocked') then raise exception 'No cap alert'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('jornada.budget.first'),true);
set local role authenticated;
do $$ begin
  if public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','upload')->>'allowed'<>'true' then raise exception 'Core admission depends on Telegram configuration'; end if;
end $$;
reset role;
insert into private.bot_server(id,secret_hash) values(true,encode(extensions.digest('synthetic-budget-secret-at-least-32-chars','sha256'),'hex'));
select set_config('request.jwt.claim.sub',(select user_id::text from public.app_owner),true);
update private.jornada_global_budgets set day_limit=10,window_limit=10 where scope='ai';
update private.jornada_budget_days set units=8 where scope='ai';
set local role authenticated;
do $$ begin
  if not exists(select 1 from jsonb_array_elements(public.jornada_budget_status()->'items') i where i->>'scope'='ai' and i->>'level'='warning') then raise exception '75 percent warning missing'; end if;
end $$;
reset role;
update private.jornada_budget_days set units=9 where scope='ai';
set local role authenticated;
do $$ begin
  if not exists(select 1 from jsonb_array_elements(public.jornada_budget_status()->'items') i where i->>'scope'='ai' and i->>'level'='critical') then raise exception '90 percent warning missing'; end if;
end $$;
reset role;
-- The valid bot resolves the linked account and shares that account's AI quota.
insert into public.messenger_links(channel,chat_id,user_id) values('telegram','budget-'||current_setting('jornada.budget.first'),current_setting('jornada.budget.first')::uuid);
update private.jornada_request_limits set minute_count=40,minute_start=date_trunc('minute',clock_timestamp()) where user_id=current_setting('jornada.budget.first')::uuid and scope='ai';
set local role anon;
do $$ declare result jsonb; begin
  begin perform public.consume_jornada_budget('ai'); raise exception 'Anon used user budget'; exception when insufficient_privilege then null; end;
  begin perform public.app_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','ai'); raise exception 'Anon used application budget'; exception when insufficient_privilege then null; end;
  begin perform public.jornada_budget_status(); raise exception 'Anon saw usage'; exception when insufficient_privilege then null; end;
  begin perform public.configure_jornada_budget_guard(repeat('a',64)); raise exception 'Anon replaced verifier'; exception when insufficient_privilege then null; end;
  begin perform public.bot_consume_jornada_budget('invalid-secret-with-more-than-32-chars','telegram','budget-'||current_setting('jornada.budget.first'),'ai'); raise exception 'Invalid bot secret allowed'; exception when insufficient_privilege then null; end;
  result:=public.bot_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','telegram','budget-'||current_setting('jornada.budget.first'),'ai');
  if result->>'allowed'<>'false' or result->>'limited_by'<>'account' then raise exception 'Bot bypassed linked account cap'; end if;
  begin perform public.bot_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','telegram','not-linked','ai'); raise exception 'Unlinked bot allowed'; exception when insufficient_privilege then null; end;
  begin perform public.bot_consume_jornada_budget('synthetic-budget-secret-at-least-32-chars','telegram','budget-'||current_setting('jornada.budget.first'),'media'); raise exception 'Bot selected disallowed scope'; exception when invalid_parameter_value then null; end;
end $$;
rollback;
select 'PASS: shared budgets, rolling window, bigint, owner-only usage and linked-bot limits' as result;
