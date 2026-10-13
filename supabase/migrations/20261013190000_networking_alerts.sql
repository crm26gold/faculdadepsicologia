-- Networking, entrega 3: a notificação do app (celular, tablet ou computador) é o aviso principal e passa a contar o
-- que chega no Networking. Telegram, WhatsApp e Google Agenda continuam como complementos dos lembretes.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (notificações, 13/10).

-- 1. Preferências no próprio perfil: avisar ou não, horário de silêncio (São Paulo) e grupos silenciados.
alter table public.profiles
  add column alerts_network boolean not null default true,
  add column quiet_from time default '22:00',
  add column quiet_to time default '07:00',
  add column muted_spaces uuid[] not null default '{}' check (cardinality(muted_spaces) <= 200),
  add constraint quiet_pair check ((quiet_from is null) = (quiet_to is null) and (quiet_from is null or quiet_from <> quiet_to));

-- 2. Cada novidade vira notificação uma vez só. As que já existiam não tocam agora.
alter table public.network_events add column pushed_at timestamptz;
update public.network_events set pushed_at = created_at;
create index network_events_push_idx on public.network_events(created_at) where pushed_at is null;

-- 3. Silêncio das quiet_from às quiet_to, no horário de São Paulo; pode virar a meia-noite.
create function private.in_quiet(quiet_from time, quiet_to time, moment timestamptz) returns boolean
language sql stable set search_path = ''
as $$
  select quiet_from is not null and quiet_to is not null and case when quiet_from < quiet_to
    then (moment at time zone 'America/Sao_Paulo')::time >= quiet_from and (moment at time zone 'America/Sao_Paulo')::time < quiet_to
    else (moment at time zone 'America/Sao_Paulo')::time >= quiet_from or (moment at time zone 'America/Sao_Paulo')::time < quiet_to end
$$;

-- 4. A pessoa guarda as preferências. Só grupos de que ela participa podem ser silenciados.
create function private.save_alerts(network boolean, from_time time, to_time time, muted uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  update public.profiles set alerts_network = coalesce(network, true), quiet_from = from_time, quiet_to = to_time,
    muted_spaces = coalesce((select array_agg(distinct m.space_id) from public.space_members m where m.user_id = me and m.space_id = any(coalesce(muted, '{}'))), '{}'),
    updated_at = now()
   where user_id = me;
  if not found then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
end;
$$;

-- 5. O servidor pega o que falta avisar, marca como avisado e recebe, por pessoa, os aparelhos e as novidades.
-- O que cai no silêncio, num grupo silenciado ou com o aviso desligado fica só nas Novidades do app.
create function private.network_push_claim(server_secret text, batch integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare picked jsonb;
begin
  perform private.bot_check(server_secret);
  with chosen as (
    select e.id from public.network_events e
     where e.pushed_at is null and e.created_at > now() - interval '1 hour'
     order by e.id limit least(greatest(batch, 1), 200) for update skip locked
  ), marked as (
    update public.network_events e set pushed_at = now() from chosen c where e.id = c.id returning e.*
  ), allowed as (
    select m.* from marked m
      left join public.profiles f on f.user_id = m.user_id
      left join public.network_posts p on p.id = m.post_id
     where coalesce(f.alerts_network, true)
       and not case when f.user_id is null then private.in_quiet('22:00', '07:00', now()) else private.in_quiet(f.quiet_from, f.quiet_to, now()) end
       and not coalesce(coalesce(m.space_id, p.space_id) = any(f.muted_spaces), false)
       and exists (select 1 from private.push_subscriptions s where s.owner_id = m.user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('user', a.user_id, 'events', a.events,
      'devices', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from private.push_subscriptions s where s.owner_id = a.user_id))), '[]')
    into picked
    from (select al.user_id, jsonb_agg(jsonb_build_object('kind', al.kind,
            'actor', (select c.display_name from public.accounts c where c.user_id = al.actor_id),
            'post', (select left(p.body, 80) from public.network_posts p where p.id = al.post_id),
            'space', (select s.name from public.spaces s where s.id = al.space_id)) order by al.id) as events
            from allowed al group by al.user_id) a;
  return picked;
end;
$$;

-- 6. Tela de Avisos: também as preferências do Networking e os grupos que dá para silenciar.
create or replace function private.reminders_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'devices', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'created_at', p.created_at) order by p.created_at)
      from private.push_subscriptions p where p.owner_id = me), '[]'::jsonb),
    'telegram', exists (select 1 from public.messenger_links l where l.channel = 'telegram' and l.user_id = me),
    'whatsapp', exists (select 1 from public.messenger_links l where l.channel = 'whatsapp' and l.user_id = me),
    'bridge_online', exists (select 1 from private.whatsapp_bridge b where b.enabled and b.state = 'ready' and b.heartbeat > now() - interval '90 seconds'),
    'network', (select jsonb_build_object('enabled', f.alerts_network, 'quiet_from', to_char(f.quiet_from, 'HH24:MI'), 'quiet_to', to_char(f.quiet_to, 'HH24:MI'),
      'muted', to_jsonb(f.muted_spaces)) from public.profiles f where f.user_id = me),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = me and s.archived_at is null), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(x.item order by x.next_at) from (
      select r.next_at, jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'next_at', r.next_at, 'level', r.level, 'status', r.status) item
      from private.reminders r where r.owner_id = me and r.next_at is not null order by r.next_at limit 10) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x.item order by x.due_at desc) from (
      select r.due_at, jsonb_build_object('id', r.id, 'title', r.title, 'due_at', r.due_at, 'status', r.status, 'log', r.log) item
      from private.reminders r where r.owner_id = me and r.next_at is null and r.status in ('visto', 'encerrado') order by r.due_at desc limit 5) x), '[]'::jsonb));
end $$;

-- 7. Invólucros. O pedido do servidor vem sem sessão e é protegido pelo segredo dele, como nos lembretes.
create function public.save_alerts(network boolean, from_time time, to_time time, muted uuid[]) returns void
language sql security invoker set search_path = '' as $$ select private.save_alerts(network, from_time, to_time, muted) $$;
create function public.network_push_claim(server_secret text, batch integer) returns jsonb
language sql security definer set search_path = '' as $$ select private.network_push_claim(server_secret, batch) $$;

revoke all on function private.in_quiet(time, time, timestamptz), private.save_alerts(boolean, time, time, uuid[]), private.network_push_claim(text, integer),
  public.save_alerts(boolean, time, time, uuid[]), public.network_push_claim(text, integer) from public, anon, authenticated;
grant execute on function private.save_alerts(boolean, time, time, uuid[]), public.save_alerts(boolean, time, time, uuid[]) to authenticated;
grant execute on function public.network_push_claim(text, integer) to anon, authenticated;

-- 8. O relógio de cada minuto também chama o servidor quando há novidade para alguém com notificação ligada.
do $clock$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'jornada-lembretes') then return; end if;
  perform cron.alter_job((select jobid from cron.job where jobname = 'jornada-lembretes'), command := $job$
    select net.http_post(
      url := 'https://faculdadepsicologia.vercel.app/api/reminders/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-jornada-clock', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jornada_reminders_clock')),
      body := '{}'::jsonb, timeout_milliseconds := 25000)
    where exists (select 1 from private.reminders r where r.next_at <= now() and r.status in ('agendado', 'avisando'))
      or exists (select 1 from public.network_events e where e.pushed_at is null and e.created_at > now() - interval '1 hour'
        and exists (select 1 from private.push_subscriptions s where s.owner_id = e.user_id))
      or exists (select 1 from private.google_agenda_links l join public.personal_state s on s.owner_id = l.user_id
        where l.problem <> 'revoked' and l.synced_revision is distinct from s.revision
          and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
          and (l.problem = '' or l.synced_at is null or l.synced_at < now() - interval '5 minutes'))
  $job$);
end $clock$;
