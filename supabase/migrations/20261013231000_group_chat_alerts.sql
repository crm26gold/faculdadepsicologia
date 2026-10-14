-- Networking: conversa do grupo, parte 2 de 3. Depende da parte 1 (20261013230000_group_chat.sql).
-- Notificação por conversa, denúncia de mensagem, espaço de fotos no feed e relógio.

-- 1. Notificação: uma por conversa, resumindo o que chegou; não toca para quem está lendo agora, no silêncio,
-- no grupo silenciado, com o aviso da conversa desligado ou para mensagem de quem foi bloqueado.
create function private.chat_push_claim(server_secret text, batch integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare picked jsonb;
begin
  perform private.bot_check(server_secret);
  -- Um envio por vez: dois disparos juntos não repetem a notificação.
  if not pg_try_advisory_xact_lock(hashtext('jornada-chat-push')) then
    return '[]';
  end if;
  with pending as (
    select m.user_id, m.space_id, count(*) as total, (array_agg(g.id order by g.created_at desc))[1] as last_id
      from public.space_members m
      join public.spaces s on s.id = m.space_id and s.kind = 'group' and s.archived_at is null and 'conversa' = any(s.tools)
      join public.space_messages g on g.space_id = m.space_id and g.kind = 'text' and g.created_at > now() - interval '1 hour' and g.deleted_at is null
        and g.author_id is distinct from m.user_id and g.created_at > m.joined_at
      left join public.space_reads r on r.user_id = m.user_id and r.space_id = m.space_id
      left join public.profiles f on f.user_id = m.user_id
     where g.created_at > coalesce(greatest(r.read_at, r.pushed_at), '-infinity')
       and (r.read_at is null or r.read_at < now() - interval '25 seconds')
       and (r.pushed_at is null or r.pushed_at < now() - interval '30 seconds')
       and coalesce(f.alerts_chat, true)
       and not private.in_quiet(f.quiet_from, f.quiet_to, now())
       and not coalesce(m.space_id = any(f.muted_spaces), false)
       and not private.blocked_between(g.author_id, m.user_id)
       and exists (select 1 from private.push_subscriptions p where p.owner_id = m.user_id)
     group by m.user_id, m.space_id
     order by min(g.created_at)
     limit least(greatest(batch, 1), 200)
  ), marked as (
    insert into public.space_reads(user_id, space_id, pushed_at) select p.user_id, p.space_id, now() from pending p
      on conflict (user_id, space_id) do update set pushed_at = now()
  )
  select coalesce(jsonb_agg(jsonb_build_object('user', p.user_id, 'space', p.space_id, 'group', s.name, 'count', p.total,
      'author', (select a.display_name from public.accounts a where a.user_id = g.author_id),
      'excerpt', left(g.body, 80), 'photo', g.photo_width is not null,
      'devices', (select jsonb_agg(jsonb_build_object('endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth))
        from private.push_subscriptions d where d.owner_id = p.user_id))), '[]')
    into picked
    from pending p join public.spaces s on s.id = p.space_id join public.space_messages g on g.id = p.last_id;
  return picked;
end;
$$;

-- 2. Denunciar uma mensagem: o trecho vai para a administração, como nas publicações.
create function private.report_message(target uuid, why text, details text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  msg public.space_messages;
begin
  select * into msg from public.space_messages where id = target and kind = 'text';
  if me is null or not found or msg.author_id is null or msg.author_id = me or private.chat_role(msg.space_id, me) is null
     or not exists (select 1 from public.space_members m where m.space_id = msg.space_id and m.user_id = me and m.joined_at <= msg.created_at) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (select count(*) from public.network_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports' using errcode = 'PT429';
  end if;
  if exists (select 1 from public.network_reports where reporter_id = me and target_message = target and status = 'aberta') then
    return;
  end if;
  insert into public.network_reports(reporter_id, target_user, target_message, post_excerpt, reason, note)
  values (me, msg.author_id, target, left(msg.body, 300), why, btrim(coalesce(details, '')));
end;
$$;

-- A administração apaga a publicação ou a mensagem denunciada; tudo vai para o histórico.
create or replace function private.admin_resolve_report(target uuid, outcome text) returns void
language plpgsql security definer set search_path = ''
as $$
declare report public.network_reports;
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into report from public.network_reports where id = target and status = 'aberta' for update;
  if not found or outcome is null or outcome not in ('apagar', 'resolvida', 'descartada') then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  if outcome = 'apagar' then
    if report.target_post is not null then
      delete from public.network_posts where id = report.target_post;
    elsif report.target_message is not null then
      delete from public.space_message_photos where message_id = report.target_message;
      update public.space_messages set body = '', photo_width = null, photo_height = null, photo_alt = '',
        deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid(), changed_at = now() where id = report.target_message;
    else
      raise exception 'Invalid report' using errcode = '22023';
    end if;
  end if;
  update public.network_reports set status = case when outcome = 'descartada' then 'descartada' else 'resolvida' end,
    resolved_by = auth.uid(), resolved_at = now() where id = target;
  perform private.audit('resolve_report', report.target_user, null,
    jsonb_build_object('report', target, 'outcome', outcome, 'reason', report.reason, 'post', report.target_post, 'message', report.target_message));
end;
$$;

create or replace function private.open_reports() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
    'reporter', (select a.display_name from public.accounts a where a.user_id = r.reporter_id),
    'target', private.avatar_of(r.target_user), 'post', r.target_post, 'excerpt', r.post_excerpt,
    'post_exists', exists (select 1 from public.network_posts p where p.id = r.target_post),
    'message', r.target_message,
    'message_exists', exists (select 1 from public.space_messages g where g.id = r.target_message and g.deleted_at is null),
    'space', (select s.name from public.space_messages g join public.spaces s on s.id = g.space_id where g.id = r.target_message))
    order by r.created_at desc), '[]')
  from public.network_reports r where r.status = 'aberta' and private.is_master() $$;

-- 3. Publicar foto no feed também conta o espaço das fotos da conversa.
create or replace function private.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[],
  post_photos jsonb, is_story boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  photos jsonb := coalesce(post_photos, '[]');
  limits public.platform_settings;
  created uuid;
  added bigint;
begin
  if me is null or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
  if post_audience = 'group' and not exists (select 1 from public.space_members m join public.spaces s on s.id = m.space_id
      where m.space_id = post_space and m.user_id = me and s.archived_at is null) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) > (case when is_story then 1 else 4 end)
     or (btrim(coalesce(post_body, '')) = '' and jsonb_array_length(photos) = 0) or (is_story and post_audience = 'private') then
    raise exception 'Invalid post' using errcode = '22023';
  end if;
  select * into limits from public.platform_settings;
  if (select count(*) from public.network_posts where author_id = me and created_at > now() - interval '1 day') >= limits.posts_per_day then
    raise exception 'Too many posts today' using errcode = 'PT429';
  end if;
  if jsonb_array_length(photos) > 0 then
    select sum(octet_length(decode(x->>'data', 'base64'))) into added from jsonb_array_elements(photos) x;
    perform private.photo_room(me, added);
  end if;
  insert into public.network_posts(author_id, body, style, audience, space_id, topics, expires_at)
  values (me, btrim(coalesce(post_body, '')), coalesce(post_style, 'text'), post_audience, case when post_audience = 'group' then post_space end,
    coalesce(post_topics, '{}'), case when is_story then now() + interval '24 hours' end)
  returning id into created;
  insert into public.network_media(post_id, position, mime, bytes, width, height, alt)
  select created, (x.n - 1)::smallint, x.photo->>'mime', decode(x.photo->>'data', 'base64'), (x.photo->>'width')::smallint, (x.photo->>'height')::smallint,
    btrim(coalesce(x.photo->>'alt', ''))
    from jsonb_array_elements(photos) with ordinality as x(photo, n);
  return created;
end;
$$;

-- 4. Invólucros e permissões. O pedido do servidor vem sem sessão e é protegido pelo segredo dele.
create function public.report_message(target uuid, why text, details text) returns void
language sql security invoker set search_path = '' as $$ select private.report_message(target, why, details) $$;
create function public.chat_push_claim(server_secret text, batch integer) returns jsonb
language sql security definer set search_path = '' as $$ select private.chat_push_claim(server_secret, batch) $$;

revoke all on function private.chat_push_claim(text, integer), private.report_message(uuid, text, text),
  public.report_message(uuid, text, text), public.chat_push_claim(text, integer) from public, anon, authenticated;
grant execute on function private.report_message(uuid, text, text), public.report_message(uuid, text, text) to authenticated;
grant execute on function public.chat_push_claim(text, integer) to anon, authenticated;

-- 5. Relógio: o disparo de cada minuto também roda por 3 minutos depois de cada mensagem num grupo com alguém de
-- notificação ligada (quem estava lendo e saiu ainda recebe; o aviso não repete), e a faxina diária
-- apaga as fotos da conversa que passaram do prazo.
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
      or exists (select 1 from public.space_messages g join public.space_members m on m.space_id = g.space_id and m.user_id is distinct from g.author_id
        where g.created_at > now() - interval '3 minutes' and g.kind = 'text' and g.deleted_at is null
          and exists (select 1 from private.push_subscriptions s where s.owner_id = m.user_id))
      or exists (select 1 from private.google_agenda_links l join public.personal_state s on s.owner_id = l.user_id
        where l.problem <> 'revoked' and l.synced_revision is distinct from s.revision
          and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
          and (l.problem = '' or l.synced_at is null or l.synced_at < now() - interval '5 minutes'))
  $job$);
end $clock$;

do $fotos$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  perform cron.schedule('jornada-fotos-conversa', '29 6 * * *', $job$
    delete from public.space_message_photos f using public.platform_settings s
     where s.chat_photo_days is not null and f.created_at < now() - make_interval(days => s.chat_photo_days)
  $job$);
end $fotos$;
