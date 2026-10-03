-- No persistent user changes: all counters and quota tests are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.accounts limit 1),true);
delete from private.jornada_request_limits where user_id=auth.uid();
set local role authenticated;
do $$ declare result jsonb; begin
  for i in 1..4 loop
    result:=public.consume_jornada_budget('live');
    if result->>'allowed'<>'true' then raise exception 'Early throttle'; end if;
  end loop;
  result:=public.consume_jornada_budget('live');
  if result->>'allowed'<>'false' or (result->>'retry_after')::integer<1 then raise exception 'Throttle failed'; end if;
  if public.consume_jornada_budget('ai')->>'allowed'<>'true' then raise exception 'Other scope blocked'; end if;
  for i in 1..4 loop
    if public.consume_jornada_budget('media',26214400)->>'allowed'<>'true' then raise exception 'Early transfer throttle'; end if;
  end loop;
  if public.consume_jornada_budget('media',1)->>'allowed'<>'false' then raise exception 'Transfer throttle failed'; end if;
  begin perform public.consume_jornada_budget('ai',0); raise exception 'Zero bypass'; exception when invalid_parameter_value then null; end;
  begin perform public.consume_jornada_budget('media',-1); raise exception 'Negative bypass'; exception when invalid_parameter_value then null; end;
  begin perform public.consume_jornada_budget('unknown'); raise exception 'Unknown scope'; exception when invalid_parameter_value then null; end;
  begin update private.jornada_request_limits set day_count=0; raise exception 'Client reset quota'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.jornada_request_limits set minute_start=clock_timestamp()-interval '2 minutes' where user_id=auth.uid() and scope='live';
set local role authenticated;
do $$ begin if public.consume_jornada_budget('live')->>'allowed'<>'true' then raise exception 'Minute reset failed'; end if; end $$;
reset role;
update private.jornada_request_limits set minute_start=clock_timestamp()-interval '2 minutes',day_count=40 where user_id=auth.uid() and scope='live';
set local role authenticated;
do $$ begin
  if public.consume_jornada_budget('live')->>'allowed'<>'false' then raise exception 'Daily cap failed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.consume_jornada_budget('live'); raise exception 'Unknown account allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.consume_jornada_budget('ai'); raise exception 'Anon allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
