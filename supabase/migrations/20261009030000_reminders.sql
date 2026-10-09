-- Lembretes: avisos que saem sozinhos na hora marcada, para a própria pessoa, só quando ela pede.
-- Um compromisso com "Avisar" (data->'remind' em personal_tasks) vira um lembrete aqui, por gatilho: vale para tudo o
-- que grava a agenda (app, assistente, Telegram, WhatsApp, MCP). O relógio do banco (pg_cron, a cada minuto) chama o
-- servidor só quando há algo vencido; o servidor envia pelos canais da pessoa e devolve o resultado.
-- Escada: suave avisa uma vez; normal repete 5 minutos depois; insistente, também 15 minutos depois. "Feito" para tudo.

create table private.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id text check (task_id is null or char_length(task_id) between 1 and 100),
  title text not null check (char_length(title) between 1 and 200),
  event_at timestamptz,
  due_at timestamptz not null,
  level text not null check (level in ('suave', 'normal', 'insistente')),
  step smallint not null default 0 check (step between 0 and 3),
  next_at timestamptz,
  status text not null default 'agendado' check (status in ('agendado', 'avisando', 'visto', 'encerrado', 'cancelado')),
  claimed_at timestamptz,
  seen_at timestamptz,
  log jsonb not null default '[]'::jsonb check (jsonb_typeof(log) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reminders_task_idx on private.reminders(owner_id, task_id) where task_id is not null;
create index reminders_next_idx on private.reminders(next_at) where next_at is not null;
create index reminders_owner_idx on private.reminders(owner_id, due_at desc);

-- Notificações do app instalado (Web Push): um registro por aparelho.
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  label text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on private.push_subscriptions(owner_id);

-- Fila do WhatsApp: a ponte do proprietário busca no batimento e confirma o envio.
create table private.reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references private.reminders(id) on delete cascade,
  peer text not null check (peer ~ '^[0-9]{10,15}$'),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  taken_at timestamptz,
  sent_at timestamptz
);
create index reminder_outbox_pending_idx on private.reminder_outbox(created_at) where sent_at is null;

-- O relógio prova que é ele com um código guardado no cofre do banco; aqui fica só o hash.
create table private.reminders_clock (
  singleton boolean primary key default true check (singleton),
  token_hash text not null check (char_length(token_hash) = 64)
);

alter table private.reminders enable row level security;
alter table private.push_subscriptions enable row level security;
alter table private.reminder_outbox enable row level security;
alter table private.reminders_clock enable row level security;
revoke all on private.reminders, private.push_subscriptions, private.reminder_outbox, private.reminders_clock from public, anon, authenticated;

create function private.reminder_steps(level text) returns integer language sql immutable set search_path = '' as $$
  select case level when 'suave' then 1 when 'normal' then 2 else 3 end $$;
create function private.reminder_offset(step integer) returns interval language sql immutable set search_path = '' as $$
  select make_interval(mins => (array[0, 5, 15])[least(step, 2) + 1]) $$;

-- 1. O compromisso manda: criar, mudar a hora, concluir ou apagar ajusta o lembrete. Nunca impede a gravação.
create function private.reminders_follow_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare remind jsonb; minutes integer; lvl text; event timestamptz; due timestamptz; day text; at text;
begin
  if tg_op = 'DELETE' then
    update private.reminders set status = 'cancelado', next_at = null, updated_at = now()
    where owner_id = old.owner_id and task_id = old.id and status in ('agendado', 'avisando');
    return null;
  end if;
  begin
    remind := new.data->'remind';
    day := new.data->>'date';
    at := coalesce(nullif(new.data->>'time', ''), '08:00');
    minutes := case when jsonb_typeof(remind->'minutes') = 'number' then (remind->>'minutes')::integer end;
    lvl := remind->>'level';
    if jsonb_typeof(remind) is distinct from 'object' or minutes is null or minutes not between 0 and 10080
       or lvl is null or lvl not in ('suave', 'normal', 'insistente') or coalesce(new.data->>'done', 'false') = 'true'
       or day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or at !~ '^[0-2][0-9]:[0-5][0-9]$' then
      update private.reminders set status = 'cancelado', next_at = null, updated_at = now()
      where owner_id = new.owner_id and task_id = new.id and status in ('agendado', 'avisando');
      return null;
    end if;
    event := (day || ' ' || at)::timestamp at time zone 'America/Sao_Paulo';
    due := event - make_interval(mins => minutes);
    -- Um aviso que já passou há mais de 5 minutos não dispara (por exemplo, ao importar compromissos antigos).
    insert into private.reminders as r (owner_id, task_id, title, event_at, due_at, level, next_at, status)
    values (new.owner_id, new.id, left(coalesce(nullif(btrim(new.data->>'title'), ''), 'Lembrete'), 200), event, due, lvl,
      case when due > now() - interval '5 minutes' then due end, case when due > now() - interval '5 minutes' then 'agendado' else 'encerrado' end)
    on conflict (owner_id, task_id) where task_id is not null do update set
      title = excluded.title, event_at = excluded.event_at, updated_at = now(),
      due_at = excluded.due_at, level = excluded.level,
      step = case when r.due_at is distinct from excluded.due_at or r.level <> excluded.level or r.status = 'cancelado' then 0 else r.step end,
      next_at = case when r.due_at is distinct from excluded.due_at or r.level <> excluded.level or r.status = 'cancelado' then excluded.next_at else r.next_at end,
      status = case when r.due_at is distinct from excluded.due_at or r.level <> excluded.level or r.status = 'cancelado' then excluded.status else r.status end,
      seen_at = case when r.due_at is distinct from excluded.due_at or r.level <> excluded.level or r.status = 'cancelado' then null else r.seen_at end;
  exception when others then
    return null;
  end;
  return null;
end $$;
create trigger reminders_follow after insert or update of data or delete on public.personal_tasks
  for each row execute function private.reminders_follow_task();
revoke all on function private.reminders_follow_task() from public, anon, authenticated;

-- 2. A própria pessoa: ver, testar, marcar como feito, adiar e registrar aparelhos.
create function private.reminders_state() returns jsonb
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
    'upcoming', coalesce((select jsonb_agg(x.item order by x.next_at) from (
      select r.next_at, jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'next_at', r.next_at, 'level', r.level, 'status', r.status) item
      from private.reminders r where r.owner_id = me and r.next_at is not null order by r.next_at limit 10) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x.item order by x.due_at desc) from (
      select r.due_at, jsonb_build_object('id', r.id, 'title', r.title, 'due_at', r.due_at, 'status', r.status, 'log', r.log) item
      from private.reminders r where r.owner_id = me and r.next_at is null and r.status in ('visto', 'encerrado') order by r.due_at desc limit 5) x), '[]'::jsonb));
end $$;

create function private.reminder_get(reminder uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'due_at', r.due_at, 'status', r.status, 'level', r.level, 'next_at', r.next_at)
  from private.reminders r where r.id = reminder and r.owner_id = (select auth.uid()) $$;

-- Teste: um lembrete agora, com a escada escolhida. No máximo um por minuto.
create function private.reminder_test(next_level text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); created uuid;
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if next_level not in ('suave', 'normal', 'insistente') then raise exception 'Escada inválida.' using errcode = '22023'; end if;
  if exists (select 1 from private.reminders r where r.owner_id = me and r.task_id is null and r.created_at > now() - interval '1 minute') then
    raise exception 'Aguarde um minuto entre um teste e outro.' using errcode = 'PT429';
  end if;
  insert into private.reminders(owner_id, title, event_at, due_at, level, next_at)
  values (me, 'Teste de avisos da Jornada', now(), now(), next_level, now()) returning id into created;
  return created;
end $$;

-- Feito: para a escada. Adiar: volta a avisar em 10 minutos, do começo da escada.
create function private.reminder_ack(reminder uuid, choice text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); changed private.reminders;
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if choice not in ('feito', 'adiar') then raise exception 'Escolha inválida.' using errcode = '22023'; end if;
  update private.reminders r set updated_at = now(),
    status = case when choice = 'feito' then 'visto' else 'agendado' end,
    seen_at = case when choice = 'feito' then now() else null end,
    next_at = case when choice = 'feito' then null else now() + interval '10 minutes' end,
    due_at = case when choice = 'feito' then r.due_at else now() + interval '10 minutes' end,
    step = case when choice = 'feito' then r.step else 0 end
  where r.id = reminder and r.owner_id = me and r.status <> 'cancelado'
  returning * into changed;
  if not found then raise exception 'Lembrete não encontrado.' using errcode = 'P0002'; end if;
  delete from private.reminder_outbox o where o.reminder_id = reminder and o.sent_at is null and choice = 'feito';
  return jsonb_build_object('id', changed.id, 'status', changed.status, 'next_at', changed.next_at);
end $$;

create function private.push_subscribe(next_endpoint text, next_p256dh text, next_auth text, next_label text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  -- O mesmo aparelho pode ter pertencido a outra conta neste navegador: passa a ser só desta.
  delete from private.push_subscriptions where endpoint = next_endpoint;
  if (select count(*) from private.push_subscriptions where owner_id = me) >= 10 then
    delete from private.push_subscriptions where id = (select id from private.push_subscriptions where owner_id = me order by created_at limit 1);
  end if;
  insert into private.push_subscriptions(owner_id, endpoint, p256dh, auth, label) values (me, next_endpoint, next_p256dh, next_auth, left(coalesce(next_label, ''), 80));
end $$;
create function private.push_unsubscribe(old_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from private.push_subscriptions where endpoint = old_endpoint and owner_id = (select auth.uid()) $$;

-- 3. O servidor (mesmo segredo do robô): o relógio, a reserva do que venceu, o resultado e a fila do WhatsApp.
create function private.reminders_clock_ok(server_secret text, token text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.bot_check(server_secret);
  return token is not null and exists (select 1 from private.reminders_clock c where c.token_hash = encode(extensions.digest(token, 'sha256'), 'hex'));
end $$;

-- Reserva por 2 minutos o que venceu (no máximo batch) e devolve os destinos de cada pessoa. Um aviso atrasado mais de
-- uma hora (servidor fora do ar) é encerrado sem disparar.
create function private.reminders_claim(server_secret text, only_owner uuid, batch integer) returns jsonb
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
    returning r.id, r.owner_id, r.title, r.event_at, r.due_at, r.level, r.step
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'event_at', c.event_at, 'due_at', c.due_at, 'level', c.level, 'step', c.step,
    'telegram', (select l.chat_id from public.messenger_links l where l.channel = 'telegram' and l.user_id = c.owner_id),
    'whatsapp', (select l.chat_id from public.messenger_links l where l.channel = 'whatsapp' and l.user_id = c.owner_id),
    'bridge_online', exists (select 1 from private.whatsapp_bridge b where b.enabled and b.state = 'ready' and b.heartbeat > now() - interval '90 seconds'),
    'push', coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)) from private.push_subscriptions p where p.owner_id = c.owner_id), '[]'::jsonb))), '[]'::jsonb)
  into picked from claimed c;
  return picked;
end $$;

-- O que foi enviado no degrau sent_step: registra (até 40 entradas) e marca o próximo degrau, se houver.
create function private.reminders_finish(server_secret text, reminder uuid, sent_step integer, entries jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bot_check(server_secret);
  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Registro inválido.' using errcode = '22023'; end if;
  update private.reminders r set claimed_at = null, updated_at = now(),
    log = (select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) from (
      select value, ordinality from jsonb_array_elements(r.log || entries) with ordinality order by ordinality desc limit 40) e),
    step = least(sent_step + 1, 3),
    next_at = case when r.status in ('visto', 'cancelado') or sent_step + 1 >= private.reminder_steps(r.level) then null
      else greatest(r.due_at + private.reminder_offset(sent_step + 1), now() + interval '1 minute') end,
    status = case when r.status in ('visto', 'cancelado') then r.status when sent_step + 1 >= private.reminder_steps(r.level) then 'encerrado' else 'avisando' end
  where r.id = reminder and r.step = sent_step;
end $$;

create function private.push_drop(server_secret text, old_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bot_check(server_secret);
  delete from private.push_subscriptions where endpoint = old_endpoint;
end $$;

create function private.reminder_outbox_add(server_secret text, reminder uuid, next_peer text, next_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created uuid;
begin
  perform private.bot_check(server_secret);
  insert into private.reminder_outbox(reminder_id, peer, body) values (reminder, next_peer, left(next_body, 1000)) returning id into created;
  return created;
end $$;
-- A ponte leva até 5 mensagens por batimento; uma retirada sem confirmação volta à fila em 2 minutos; após 30 minutos, desiste.
create function private.reminder_outbox_take(server_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare taken jsonb;
begin
  perform private.bot_check(server_secret);
  with chosen as (
    select o.id from private.reminder_outbox o
    where o.sent_at is null and o.created_at > now() - interval '30 minutes' and (o.taken_at is null or o.taken_at < now() - interval '2 minutes')
    order by o.created_at limit 5 for update skip locked
  ), marked as (
    update private.reminder_outbox o set taken_at = now() from chosen where o.id = chosen.id returning o.id, o.peer, o.body
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'peer', m.peer, 'text', m.body)), '[]'::jsonb) into taken from marked m;
  return taken;
end $$;
create function private.reminder_outbox_sent(server_secret text, item uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bot_check(server_secret);
  update private.reminder_outbox set sent_at = now() where id = item and sent_at is null;
end $$;

create function public.reminders_state() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.reminders_state() $$;
create function public.reminder_get(reminder uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.reminder_get(reminder) $$;
create function public.reminder_test(next_level text) returns uuid language sql security invoker set search_path = '' as $$ select private.reminder_test(next_level) $$;
create function public.reminder_ack(reminder uuid, choice text) returns jsonb language sql security invoker set search_path = '' as $$ select private.reminder_ack(reminder, choice) $$;
create function public.push_subscribe(next_endpoint text, next_p256dh text, next_auth text, next_label text) returns void language sql security invoker set search_path = '' as $$ select private.push_subscribe(next_endpoint, next_p256dh, next_auth, next_label) $$;
create function public.push_unsubscribe(old_endpoint text) returns void language sql security invoker set search_path = '' as $$ select private.push_unsubscribe(old_endpoint) $$;
create function public.reminders_clock_ok(server_secret text, token text) returns boolean language sql stable security invoker set search_path = '' as $$ select private.reminders_clock_ok(server_secret, token) $$;
create function public.reminders_claim(server_secret text, only_owner uuid, batch integer) returns jsonb language sql security invoker set search_path = '' as $$ select private.reminders_claim(server_secret, only_owner, batch) $$;
create function public.reminders_finish(server_secret text, reminder uuid, sent_step integer, entries jsonb) returns void language sql security invoker set search_path = '' as $$ select private.reminders_finish(server_secret, reminder, sent_step, entries) $$;
create function public.push_drop(server_secret text, old_endpoint text) returns void language sql security invoker set search_path = '' as $$ select private.push_drop(server_secret, old_endpoint) $$;
create function public.reminder_outbox_add(server_secret text, reminder uuid, next_peer text, next_body text) returns uuid language sql security invoker set search_path = '' as $$ select private.reminder_outbox_add(server_secret, reminder, next_peer, next_body) $$;
create function public.reminder_outbox_take(server_secret text) returns jsonb language sql security invoker set search_path = '' as $$ select private.reminder_outbox_take(server_secret) $$;
create function public.reminder_outbox_sent(server_secret text, item uuid) returns void language sql security invoker set search_path = '' as $$ select private.reminder_outbox_sent(server_secret, item) $$;

revoke all on function private.reminder_steps(text), private.reminder_offset(integer),
  private.reminders_state(), public.reminders_state(), private.reminder_get(uuid), public.reminder_get(uuid),
  private.reminder_test(text), public.reminder_test(text), private.reminder_ack(uuid, text), public.reminder_ack(uuid, text),
  private.push_subscribe(text, text, text, text), public.push_subscribe(text, text, text, text), private.push_unsubscribe(text), public.push_unsubscribe(text),
  private.reminders_clock_ok(text, text), public.reminders_clock_ok(text, text), private.reminders_claim(text, uuid, integer), public.reminders_claim(text, uuid, integer),
  private.reminders_finish(text, uuid, integer, jsonb), public.reminders_finish(text, uuid, integer, jsonb), private.push_drop(text, text), public.push_drop(text, text),
  private.reminder_outbox_add(text, uuid, text, text), public.reminder_outbox_add(text, uuid, text, text),
  private.reminder_outbox_take(text), public.reminder_outbox_take(text), private.reminder_outbox_sent(text, uuid), public.reminder_outbox_sent(text, uuid)
  from public, anon, authenticated;
grant execute on function private.reminder_steps(text), private.reminder_offset(integer) to anon, authenticated;
grant execute on function private.reminders_state(), public.reminders_state(), private.reminder_get(uuid), public.reminder_get(uuid),
  private.reminder_test(text), public.reminder_test(text), private.reminder_ack(uuid, text), public.reminder_ack(uuid, text),
  private.push_subscribe(text, text, text, text), public.push_subscribe(text, text, text, text), private.push_unsubscribe(text), public.push_unsubscribe(text) to authenticated;
-- Chamadas do servidor sem sessão (cliente do robô): protegidas pelo segredo do servidor.
grant execute on function private.reminders_clock_ok(text, text), public.reminders_clock_ok(text, text), private.reminders_claim(text, uuid, integer), public.reminders_claim(text, uuid, integer),
  private.reminders_finish(text, uuid, integer, jsonb), public.reminders_finish(text, uuid, integer, jsonb), private.push_drop(text, text), public.push_drop(text, text),
  private.reminder_outbox_add(text, uuid, text, text), public.reminder_outbox_add(text, uuid, text, text),
  private.reminder_outbox_take(text), public.reminder_outbox_take(text), private.reminder_outbox_sent(text, uuid), public.reminder_outbox_sent(text, uuid) to anon, authenticated;

-- 4. O relógio: só onde o banco oferece pg_cron e pg_net (o Supabase). O código fica no cofre; a chamada só sai quando
-- há lembrete vencido, então um dia sem lembretes não chama o servidor. A fila do WhatsApp vai no batimento da ponte.
do $clock$
declare token text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.reminders_clock(singleton, token_hash) values (true, encode(extensions.digest(token, 'sha256'), 'hex'))
  on conflict (singleton) do update set token_hash = excluded.token_hash;
  perform vault.create_secret(token, 'jornada_reminders_clock', 'Relógio dos lembretes da Jornada');
  perform cron.schedule('jornada-lembretes', '* * * * *', $job$
    select net.http_post(
      url := 'https://faculdadepsicologia.vercel.app/api/reminders/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-jornada-clock', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jornada_reminders_clock')),
      body := '{}'::jsonb, timeout_milliseconds := 25000)
    where exists (select 1 from private.reminders r where r.next_at <= now() and r.status in ('agendado', 'avisando'))
  $job$);
end $clock$;
