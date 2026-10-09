-- Avisos em todo lugar. (1) Um foco em andamento pergunta "ainda em foco?" 5 minutos antes de acabar o tempo dele
-- (o fim da aula, quando o assistente ligou o foco pela grade), ou depois de 1 hora num foco sem duração; pausar,
-- encerrar ou trocar de foco cancela a pergunta. (2) O relógio também atualiza o Google Agenda de quem gravou por
-- outro caminho (assistente pelo MCP, Telegram, WhatsApp): sem isso, o Google só via a mudança quando o app abria.

-- 1. Foco: um lembrete por foco (task_id "foco:<id>"), refeito a cada gravação do estado. Nunca impede a gravação.
create function private.reminders_follow_focus() returns trigger
language plpgsql security definer set search_path = '' as $$
declare focus jsonb; fid text; last jsonb; closed numeric; target numeric; started timestamptz; ends timestamptz; due timestamptz; activity text;
begin
  begin
    focus := new.settings->'activeFocus';
    fid := case when jsonb_typeof(focus) = 'object' then nullif(focus->>'id', '') end;
    last := case when fid is not null and jsonb_typeof(focus->'segments') = 'array' then focus->'segments'->-1 end;
    -- Pausado (último trecho fechado), encerrado ou outro foco: as perguntas anteriores param.
    update private.reminders set status = 'cancelado', next_at = null, updated_at = now()
    where owner_id = new.owner_id and task_id like 'foco:%' and status in ('agendado', 'avisando')
      and (last is null or jsonb_typeof(last->'end') is distinct from 'null' or task_id <> 'foco:' || fid);
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
    else
      ends := null;
      due := started + make_interval(secs => greatest(3600 - closed, 300));
    end if;
    insert into private.reminders as r (owner_id, task_id, title, event_at, due_at, level, next_at, status)
    values (new.owner_id, 'foco:' || fid, 'Foco: ' || activity, ends, due, 'normal',
      case when due > now() - interval '5 minutes' then due end, case when due > now() - interval '5 minutes' then 'agendado' else 'encerrado' end)
    on conflict (owner_id, task_id) where task_id is not null do update set
      title = excluded.title, event_at = excluded.event_at, updated_at = now(), due_at = excluded.due_at,
      step = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then 0 else r.step end,
      next_at = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then excluded.next_at else r.next_at end,
      status = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then excluded.status else r.status end,
      seen_at = case when r.due_at is distinct from excluded.due_at or r.status = 'cancelado' then null else r.seen_at end;
  exception when others then
    return null;
  end;
  return null;
end $$;
create trigger reminders_follow_focus after insert or update of settings on public.personal_state
  for each row execute function private.reminders_follow_focus();
revoke all on function private.reminders_follow_focus() from public, anon, authenticated;

-- O servidor e a página do lembrete sabem quando é a pergunta do foco (botões Continuar e Pausar).
create or replace function private.reminder_get(reminder uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'due_at', r.due_at, 'status', r.status, 'level', r.level, 'next_at', r.next_at,
    'focus', coalesce(r.task_id like 'foco:%', false))
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
    'focus', coalesce(c.task_id like 'foco:%', false),
    'telegram', (select l.chat_id from public.messenger_links l where l.channel = 'telegram' and l.user_id = c.owner_id),
    'whatsapp', (select l.chat_id from public.messenger_links l where l.channel = 'whatsapp' and l.user_id = c.owner_id),
    'bridge_online', exists (select 1 from private.whatsapp_bridge b where b.enabled and b.state = 'ready' and b.heartbeat > now() - interval '90 seconds'),
    'push', coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)) from private.push_subscriptions p where p.owner_id = c.owner_id), '[]'::jsonb))), '[]'::jsonb)
  into picked from claimed c;
  return picked;
end $$;

-- 2. Google Agenda pelo relógio: contas ligadas cuja agenda mudou depois da última cópia. Reserva por 90 segundos,
-- como a atualização feita pelo app; depois de uma falha, tenta de novo a cada 5 minutos.
create function private.google_agenda_due(server_secret text, batch integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare picked jsonb;
begin
  perform private.bot_check(server_secret);
  with chosen as (
    select l.user_id, s.revision from private.google_agenda_links l join public.personal_state s on s.owner_id = l.user_id
    where l.problem <> 'revoked' and l.synced_revision is distinct from s.revision
      and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
      and (l.problem = '' or l.synced_at is null or l.synced_at < now() - interval '5 minutes')
    order by l.synced_at nulls first limit least(greatest(batch, 1), 5) for update of l skip locked
  ), claimed as (
    update private.google_agenda_links l set sync_started_at = now() from chosen where l.user_id = chosen.user_id
    returning l.user_id, chosen.revision, l.refresh_ciphertext, l.calendar_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('person', c.user_id, 'revision', c.revision, 'refresh_ciphertext', c.refresh_ciphertext,
    'calendar_id', c.calendar_id, 'workspace', private.workspace_document(c.user_id))), '[]'::jsonb)
  into picked from claimed c;
  return picked;
end $$;

create function private.google_agenda_done(server_secret text, person uuid, next_revision bigint, next_events integer, next_problem text, next_calendar text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bot_check(server_secret);
  update private.google_agenda_links set sync_started_at = null, synced_at = now(), synced_revision = next_revision, events = greatest(next_events, 0),
    problem = case when next_problem in ('', 'revoked', 'partial', 'failed') then next_problem else 'failed' end,
    calendar_id = coalesce(nullif(next_calendar, ''), calendar_id)
  where user_id = person;
end $$;

-- Chamadas do servidor pela chave pública (papel anon): os invólucros rodam como dono, protegidos pelo segredo.
create function public.google_agenda_due(server_secret text, batch integer) returns jsonb language sql security definer set search_path = '' as $$ select private.google_agenda_due(server_secret, batch) $$;
create function public.google_agenda_done(server_secret text, person uuid, next_revision bigint, next_events integer, next_problem text, next_calendar text) returns void
  language sql security definer set search_path = '' as $$ select private.google_agenda_done(server_secret, person, next_revision, next_events, next_problem, next_calendar) $$;
revoke all on function private.google_agenda_due(text, integer), public.google_agenda_due(text, integer),
  private.google_agenda_done(text, uuid, bigint, integer, text, text), public.google_agenda_done(text, uuid, bigint, integer, text, text) from public, anon, authenticated;
grant execute on function public.google_agenda_due(text, integer), public.google_agenda_done(text, uuid, bigint, integer, text, text) to anon, authenticated;

-- 3. O relógio chama o servidor também quando há agenda do Google para atualizar.
do $clock$
begin
  -- Separados: sem pg_cron (Postgres dos testes), a tabela cron.job nem existe para ser consultada.
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'jornada-lembretes') then return; end if;
  perform cron.alter_job((select jobid from cron.job where jobname = 'jornada-lembretes'), command := $job$
    select net.http_post(
      url := 'https://faculdadepsicologia.vercel.app/api/reminders/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-jornada-clock', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jornada_reminders_clock')),
      body := '{}'::jsonb, timeout_milliseconds := 25000)
    where exists (select 1 from private.reminders r where r.next_at <= now() and r.status in ('agendado', 'avisando'))
      or exists (select 1 from private.google_agenda_links l join public.personal_state s on s.owner_id = l.user_id
        where l.problem <> 'revoked' and l.synced_revision is distinct from s.revision
          and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
          and (l.problem = '' or l.synced_at is null or l.synced_at < now() - interval '5 minutes'))
  $job$);
end $clock$;
