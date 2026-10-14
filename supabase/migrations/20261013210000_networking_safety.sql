-- Networking: bloquear e denunciar, e o horário de silêncio desligado por padrão (quem estuda à noite liga se quiser).
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (13/10). Ações da administração ficam no histórico.

-- 1. Silêncio: a opção continua, mas começa desligada.
alter table public.profiles alter column quiet_from drop default, alter column quiet_to drop default;
update public.profiles set quiet_from = null, quiet_to = null where quiet_from = '22:00' and quiet_to = '07:00';

-- 2. Bloqueios: só quem bloqueou lê a própria lista.
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
create policy "Own blocks" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));

create function private.blocked_between(one uuid, other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.blocks b where (b.blocker_id = one and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = one)) $$;

-- 3. Denúncias: só a administração lê. Quem foi denunciado não fica sabendo.
create table public.network_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_user uuid references auth.users(id) on delete set null,
  target_post uuid references public.network_posts(id) on delete set null,
  post_excerpt text not null default '' check (char_length(post_excerpt) <= 300),
  reason text not null check (reason in ('spam', 'ofensa', 'assedio', 'improprio', 'outro')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create index network_reports_open_idx on public.network_reports(created_at desc) where status = 'aberta';
create index network_reports_reporter_idx on public.network_reports(reporter_id);
create index network_reports_target_idx on public.network_reports(target_user);
create index network_reports_post_idx on public.network_reports(target_post);
create index network_reports_resolved_idx on public.network_reports(resolved_by);
alter table public.network_reports enable row level security;
revoke all on public.network_reports from anon, authenticated;

-- 4. Quem está bloqueado (nos dois sentidos) não chega ao perfil, não aparece na busca, não segue e não avisa.
create or replace function private.can_reach_profile(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select viewer = target or (not private.blocked_between(viewer, target) and exists (select 1 from public.profiles p where p.user_id = target and (p.discoverable
    or private.share_space(viewer, target)
    or exists (select 1 from public.follows f where (f.follower_id = viewer and f.followee_id = target) or (f.follower_id = target and f.followee_id = viewer)))))
$$;

create or replace function private.notify(recipient uuid, event_kind text, post uuid, space uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into public.network_events(user_id, actor_id, kind, post_id, space_id)
  select recipient, (select auth.uid()), event_kind, post, space
   where recipient is distinct from (select auth.uid())
     and not private.blocked_between(recipient, (select auth.uid()))
     and not exists (select 1 from public.network_events e where e.user_id = recipient and e.actor_id = (select auth.uid())
       and e.kind = event_kind and e.post_id is not distinct from post and e.space_id is not distinct from space
       and e.created_at > now() - interval '1 day')
$$;

create or replace function private.search_people(term text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(term, '')));
begin
  if me is null or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if char_length(wanted) < 2 or char_length(wanted) > 60 then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(private.avatar_of(p.user_id) || jsonb_build_object('bio', left(p.bio, 120)) order by a.display_name) from (
    select p.* from public.profiles p join public.accounts a on a.user_id = p.user_id
     where p.user_id <> me and strpos(lower(a.display_name), wanted) > 0
       and (p.discoverable or private.share_space(me, p.user_id)) and not private.blocked_between(me, p.user_id)
     limit 30) p join public.accounts a on a.user_id = p.user_id), '[]');
end;
$$;

create or replace function private.follow_list(target uuid, which text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not (target = me or (private.can_reach_profile(me, target)
      and coalesce((select p.show_follows from public.profiles p where p.user_id = target), false))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.avatar_of(f.other) order by f.created_at desc) from (
    select case when which = 'followers' then x.follower_id else x.followee_id end as other, x.created_at
      from public.follows x where x.accepted and case when which = 'followers' then x.followee_id = target else x.follower_id = target end) f
   where not private.blocked_between(me, f.other)), '[]');
end;
$$;

-- Quem vê: nada de quem bloqueou ou foi bloqueado.
create or replace function private.can_see_post(post public.network_posts, viewer uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (post.expires_at is null or post.expires_at > now() or post.highlight is not null) and not private.blocked_between(post.author_id, viewer)
    and (post.author_id = viewer or case post.audience
    when 'private' then false
    when 'group' then exists (select 1 from public.space_members m where m.space_id = post.space_id and m.user_id = viewer)
      or private.staff_of(post.space_id, viewer)
    when 'followers' then private.follows_accepted(viewer, post.author_id)
    when 'public' then not coalesce((select p.closed from public.profiles p where p.user_id = post.author_id), true)
      or private.follows_accepted(viewer, post.author_id)
    else false end)
$$;


-- Perfil: cartão para quem bloqueou desbloquear.
create or replace function private.person_profile(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  person public.profiles;
  status text;
begin
  select * into person from public.profiles where user_id = target;
  if found and me is not null and exists (select 1 from public.blocks b where b.blocker_id = me and b.blocked_id = target) then
    return private.avatar_of(target) || jsonb_build_object('blocked', true, 'is_me', false, 'posts', '[]'::jsonb, 'highlights', '[]'::jsonb);
  end if;
  if me is null or not found or not private.can_reach_profile(me, target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select case when f.accepted then 'following' else 'requested' end into status from public.follows f where f.follower_id = me and f.followee_id = target;
  return private.avatar_of(target) || jsonb_build_object(
    'bio', person.bio, 'closed', person.closed, 'is_me', target = me,
    'discoverable', case when target = me then person.discoverable end,
    'show_follows', person.show_follows, 'photo_large', person.avatar_large,
    'status', coalesce(status, 'none'),
    'follows_me', private.follows_accepted(target, me),
    'requested_me', exists (select 1 from public.follows f where f.follower_id = target and f.followee_id = me and not f.accepted),
    'followers', (select count(*) from public.follows f where f.followee_id = target and f.accepted),
    'following', (select count(*) from public.follows f where f.follower_id = target and f.accepted),
    'posts', private.network_feed('person', target, null),
    'highlights', coalesce((select jsonb_agg(jsonb_build_object('title', h.title, 'stories', h.cards) order by h.latest desc) from (
      select p.highlight as title, max(p.created_at) as latest, jsonb_agg(private.post_card(p, me) order by p.created_at) as cards
        from public.network_posts p where p.author_id = target and p.highlight is not null and private.can_see_post(p, me)
       group by p.highlight) h), '[]'));
end;
$$;


-- Notificações: sem perfil, sem silêncio.
create or replace function private.network_push_claim(server_secret text, batch integer) returns jsonb
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
       and not private.in_quiet(f.quiet_from, f.quiet_to, now())
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


-- 5. Bloquear desfaz o seguir nos dois sentidos. Desbloquear não refaz nada.
create function private.block_person(target uuid, blocking boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or target is null or target = me or not exists (select 1 from auth.users where id = target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if blocking then
    insert into public.blocks(blocker_id, blocked_id) values (me, target) on conflict do nothing;
    delete from public.follows where (follower_id = me and followee_id = target) or (follower_id = target and followee_id = me);
  else
    delete from public.blocks where blocker_id = me and blocked_id = target;
  end if;
end;
$$;

create function private.my_blocks() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(private.avatar_of(b.blocked_id) order by b.created_at desc), '[]')
  from public.blocks b where b.blocker_id = (select auth.uid()) $$;

-- 6. Denunciar uma pessoa ou uma publicação dela. Até 20 por dia; a mesma publicação não é denunciada duas vezes.
create function private.report_content(target uuid, post uuid, why text, details text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_post public.network_posts;
begin
  if me is null or target is null or target = me or not exists (select 1 from auth.users where id = target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if post is not null then
    select * into found_post from public.network_posts p where p.id = post and p.author_id = target;
    if not found or not private.can_see_post(found_post, me) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  end if;
  if (select count(*) from public.network_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports' using errcode = 'PT429';
  end if;
  if post is not null and exists (select 1 from public.network_reports where reporter_id = me and target_post = post and status = 'aberta') then
    return;
  end if;
  insert into public.network_reports(reporter_id, target_user, target_post, post_excerpt, reason, note)
  values (me, target, post, left(coalesce(found_post.body, ''), 300), why, btrim(coalesce(details, '')));
end;
$$;

-- 7. A administração resolve: apagar a publicação, marcar como resolvida ou descartar. Tudo vai para o histórico.
create function private.admin_resolve_report(target uuid, outcome text) returns void
language plpgsql security definer set search_path = ''
as $$
declare report public.network_reports;
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into report from public.network_reports where id = target and status = 'aberta' for update;
  if not found or outcome not in ('apagar', 'resolvida', 'descartada') then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  if outcome = 'apagar' then
    if report.target_post is null then
      raise exception 'Invalid report' using errcode = '22023';
    end if;
    delete from public.network_posts where id = report.target_post;
  end if;
  update public.network_reports set status = case when outcome = 'descartada' then 'descartada' else 'resolvida' end,
    resolved_by = auth.uid(), resolved_at = now() where id = target;
  perform private.audit('resolve_report', report.target_user, null,
    jsonb_build_object('report', target, 'outcome', outcome, 'reason', report.reason, 'post', report.target_post));
end;
$$;

-- 8. Painel da administração com as denúncias abertas.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', (select jsonb_build_object('open_access', s.open_access, 'updated_at', s.updated_at) from public.platform_settings s),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'spaces', (select count(*) from public.space_members m where m.user_id = a.user_id)) order by a.created_at desc)
      from public.accounts a), '[]'),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'parent_id', s.parent_id,
        'color', s.color, 'archived_at', s.archived_at,
        'members', (select count(*) from public.space_members m where m.space_id = s.id)) order by s.kind, s.name)
      from public.spaces s), '[]'),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc)
      from (select * from public.admin_audit_log order by created_at desc limit 100) l), '[]'),
    'reports', private.open_reports()
  );
end;
$$;
create function private.open_reports() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
    'reporter', (select a.display_name from public.accounts a where a.user_id = r.reporter_id),
    'target', private.avatar_of(r.target_user), 'post', r.target_post, 'excerpt', r.post_excerpt,
    'post_exists', exists (select 1 from public.network_posts p where p.id = r.target_post)) order by r.created_at desc), '[]')
  from public.network_reports r where r.status = 'aberta' and private.is_master() $$;

-- "Baixar meus dados" traz os bloqueios e as denúncias feitas (a tabela de denúncias não tem leitura direta).
create function private.my_reports() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'status', r.status, 'created_at', r.created_at) order by r.created_at), '[]')
  from public.network_reports r where r.reporter_id = (select auth.uid()) $$;
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(a) from public.accounts a where a.user_id = me),
    'profile', (select to_jsonb(f) from public.profiles f where f.user_id = me),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consents c where c.user_id = me), '[]'),
    'personal_workspace', (select w.data from public.personal_workspaces w where w.owner_id = me),
    'assistant_conversations', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at, c.id) from public.assistant_conversations c where c.user_id = me), '[]'),
    'assistant_jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'conversation_id', j.conversation_id,
      'input', j.input, 'status', j.status, 'result', j.result, 'created_at', j.created_at, 'updated_at', j.updated_at) order by j.created_at, j.id)
      from public.assistant_jobs j where j.user_id = me), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c)) from public.contacts c where c.owner_id = me), '[]'),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('space', s.name, 'kind', s.kind, 'role', m.role, 'joined_at', m.joined_at,
        'email_shared', m.email_shared))
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = me), '[]'),
    'join_requests', coalesce((select jsonb_agg(jsonb_build_object('space', s.name, 'share_email', r.share_email, 'created_at', r.created_at))
      from public.space_join_requests r join public.spaces s on s.id = r.space_id where r.user_id = me), '[]'),
    'follows', coalesce((select jsonb_agg(jsonb_build_object('follower', f.follower_id, 'followee', f.followee_id, 'accepted', f.accepted, 'created_at', f.created_at))
      from public.follows f where f.follower_id = me or f.followee_id = me), '[]'),
    'network_posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.network_posts p where p.author_id = me), '[]'),
    'network_photos', private.my_network_photos(),
    'saved_posts', private.my_saved_posts(),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked', b.blocked_id, 'created_at', b.created_at)) from public.blocks b where b.blocker_id = me), '[]'),
    'reports', private.my_reports(),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('post', r.post_id, 'kind', r.kind, 'created_at', r.created_at)) from public.post_reactions r where r.user_id = me), '[]'),
    'parts', coalesce((select jsonb_agg(jsonb_build_object('assignment', a.title, 'title', p.title, 'status', p.status, 'content', p.content))
      from public.assignment_parts p join public.assignments a on a.id = p.assignment_id where p.assignee_id = me or p.submitted_by = me), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('body', c.body, 'kind', c.kind, 'created_at', c.created_at)) from public.part_comments c where c.author_id = me), '[]'),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('title', p.title, 'body', p.body, 'created_at', p.created_at)) from public.space_posts p where p.author_id = me), '[]'),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('question', q.question, 'choice', q.options[v.option_index + 1]))
      from public.poll_votes v join public.polls q on q.id = v.poll_id where v.user_id = me), '[]')
  );
end;
$$;


-- 9. Invólucros e permissões.
create function public.block_person(target uuid, blocking boolean) returns void
language sql security invoker set search_path = '' as $$ select private.block_person(target, blocking) $$;
create function public.my_blocks() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.my_blocks() $$;
create function public.report_content(target uuid, post uuid, why text, details text) returns void
language sql security invoker set search_path = '' as $$ select private.report_content(target, post, why, details) $$;
create function public.admin_resolve_report(target uuid, outcome text) returns void
language sql security invoker set search_path = '' as $$ select private.admin_resolve_report(target, outcome) $$;

revoke all on function private.blocked_between(uuid, uuid), private.block_person(uuid, boolean), private.my_blocks(), private.report_content(uuid, uuid, text, text),
  private.admin_resolve_report(uuid, text), private.open_reports(), private.my_reports(),
  public.block_person(uuid, boolean), public.my_blocks(), public.report_content(uuid, uuid, text, text), public.admin_resolve_report(uuid, text) from public, anon;
grant execute on function private.block_person(uuid, boolean), private.my_blocks(), private.report_content(uuid, uuid, text, text),
  private.admin_resolve_report(uuid, text), private.open_reports(), private.my_reports(),
  public.block_person(uuid, boolean), public.my_blocks(), public.report_content(uuid, uuid, text, text), public.admin_resolve_report(uuid, text) to authenticated;
