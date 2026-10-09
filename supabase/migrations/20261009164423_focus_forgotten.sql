-- Foco esquecido. Além da pergunta "ainda em foco?" (task_id "foco:<id>"), cada foco em andamento ganha uma segunda
-- verificação (task_id "foco-fim:<id>"): 30 minutos depois do fim do tempo dele (o fim da aula), ou 3 horas depois do
-- início num foco sem duração, chega uma vez "parece que o foco ficou ligado", com Encerrar no horário certo. Nunca
-- altera nada sozinha: só pergunta. Pausar, encerrar ou trocar de foco cancela as duas.

create or replace function private.reminders_follow_focus() returns trigger
language plpgsql security definer set search_path = '' as $$
declare focus jsonb; fid text; last jsonb; closed numeric; target numeric; started timestamptz; ends timestamptz; due timestamptz; late timestamptz;
  activity text; check_row record;
begin
  begin
    focus := new.settings->'activeFocus';
    fid := case when jsonb_typeof(focus) = 'object' then nullif(focus->>'id', '') end;
    last := case when fid is not null and jsonb_typeof(focus->'segments') = 'array' then focus->'segments'->-1 end;
    -- Pausado (último trecho fechado), encerrado ou outro foco: as perguntas anteriores param.
    update private.reminders set status = 'cancelado', next_at = null, updated_at = now()
    where owner_id = new.owner_id and (task_id like 'foco:%' or task_id like 'foco-fim:%') and status in ('agendado', 'avisando')
      and (last is null or jsonb_typeof(last->'end') is distinct from 'null' or task_id not in ('foco:' || fid, 'foco-fim:' || fid));
    if last is null or jsonb_typeof(last->'end') is distinct from 'null' or jsonb_typeof(last->'start') is distinct from 'number' then
      return null;
    end if;
    closed := coalesce((select sum((s->>'end')::numeric - (s->>'start')::numeric) from jsonb_array_elements(focus->'segments') s
      where jsonb_typeof(s->'end') = 'number'), 0) / 1000;
    started := to_timestamp((last->>'start')::numeric / 1000);
    target := case when jsonb_typeof(focus->'targetSeconds') = 'number' then (focus->>'targetSeconds')::numeric else 0 end;
    activity := left(coalesce(nullif(btrim(focus->>'activity'), ''), 'Foco'), 190);
    if target > 0 then
      ends := started + make_interval(secs => greatest(target - closed, 0));
      due := case when ends - interval '10 minutes' >= started then ends - interval '5 minutes' else ends end;
      late := ends + interval '30 minutes';
    else
      ends := null;
      due := started + make_interval(secs => greatest(3600 - closed, 300));
      late := started + make_interval(secs => greatest(3 * 3600 - closed, 1800));
    end if;
    -- As duas verificações, cada uma com sua hora e sua escada: a pergunta (normal) e o esquecido (um aviso só).
    for check_row in select * from (values ('foco:' || fid, due, 'normal'), ('foco-fim:' || fid, late, 'suave')) v(task, at, lvl) loop
      insert into private.reminders as r (owner_id, task_id, title, event_at, due_at, level, next_at, status)
      values (new.owner_id, check_row.task, 'Foco: ' || activity, ends, check_row.at, check_row.lvl,
        case when check_row.at > now() - interval '5 minutes' then check_row.at end,
        case when check_row.at > now() - interval '5 minutes' then 'agendado' else 'encerrado' end)
      on conflict (owner_id, task_id) where task_id is not null do update set
        title = excluded.title, event_at = excluded.event_at, updated_at = now(), due_at = excluded.due_at,
        step = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then 0 else r.step end,
        next_at = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then excluded.next_at else r.next_at end,
        status = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then excluded.status else r.status end,
        seen_at = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then null else r.seen_at end;
    end loop;
  exception when others then
    return null;
  end;
  return null;
end $$;
revoke all on function private.reminders_follow_focus() from public, anon, authenticated;

-- A página e o servidor sabem qual das duas é, e qual foco encerrar.
create or replace function private.reminder_get(reminder uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'due_at', r.due_at, 'status', r.status, 'level', r.level, 'next_at', r.next_at,
    'focus', coalesce(r.task_id like 'foco:%', false), 'forgotten', coalesce(r.task_id like 'foco-fim:%', false),
    'focus_id', case when r.task_id like 'foco:%' or r.task_id like 'foco-fim:%' then split_part(r.task_id, ':', 2) end)
  from private.reminders r where r.id = reminder and r.owner_id = (select auth.uid()) $$;

create or replace function private.reminders_claim(server_secret text, only_owner uuid, batch integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare picked jsonb;
begin
  perform private.bot_check(server_secret);
  update private.reminders set status = 'encerrado', next_at = null, updated_at = now(),
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'channel', 'relogio', 'ok', false, 'detail', 'atrasado demais'))
  where next_at < now() - interval '1 hour' and status in ('agendado', 'avisando') and (only_owner is null or owner_id = only_owner);
  with chosen as (
    select r.id from private.reminders r
    where r.next_at <= now() and r.status in ('agendado', 'avisando') and (r.claimed_at is null or r.claimed_at < now() - interval '2 minutes')
      and (only_owner is null or r.owner_id = only_owner)
    order by r.next_at limit least(greatest(batch, 1), 50) for update skip locked
  ), claimed as (
    update private.reminders r set claimed_at = now() from chosen where r.id = chosen.id
    returning r.id, r.owner_id, r.task_id, r.title, r.event_at, r.due_at, r.level, r.step
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'event_at', c.event_at, 'due_at', c.due_at, 'level', c.level, 'step', c.step,
    'focus', coalesce(c.task_id like 'foco:%', false), 'forgotten', coalesce(c.task_id like 'foco-fim:%', false),
    'focus_id', case when c.task_id like 'foco:%' or c.task_id like 'foco-fim:%' then split_part(c.task_id, ':', 2) end,
    'telegram', (select l.chat_id from public.messenger_links l where l.channel = 'telegram' and l.user_id = c.owner_id),
    'whatsapp', (select l.chat_id from public.messenger_links l where l.channel = 'whatsapp' and l.user_id = c.owner_id),
    'bridge_online', exists (select 1 from private.whatsapp_bridge b where b.enabled and b.state = 'ready' and b.heartbeat > now() - interval '90 seconds'),
    'push', coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)) from private.push_subscriptions p where p.owner_id = c.owner_id), '[]'::jsonb))), '[]'::jsonb)
  into picked from claimed c;
  return picked;
end $$;
