-- Networking: desafios, parte 2 de 3. Depende da parte 1 (20261014120000_challenges.sql).
-- Criar, mudar e encerrar; participar e sair; marcar o dia (com os marcos de 7, 15 e 30 dias no feed do grupo);
-- "Dar força" nos marcos; e o fim do desafio, que dá a medalha a quem cumpriu pelo menos 80% dos dias.

-- 1. Criar: qualquer pessoa do grupo, até 10 por dia. Quem cria já participa.
create function private.challenge_create(target uuid, challenge_title text, challenge_details text, challenge_kind text,
  unit_name text, goal numeric, start_day date, duration integer, rest smallint[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  role text := private.tool_role(target, me, 'checkin');
  created public.challenges;
begin
  if me is null or role is null or exists (select 1 from public.spaces s where s.id = target and s.archived_at is not null) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if challenge_kind is null or challenge_kind not in ('feito', 'quantidade') or start_day is null or duration is null
     or start_day < private.sp_today() or start_day > private.sp_today() + 30 or duration < 3 or duration > 365
     or (challenge_kind = 'quantidade' and (goal is null or goal <= 0 or goal > 100000 or btrim(coalesce(unit_name, '')) = ''))
     or cardinality(coalesce(rest, '{}')) >= 7 then
    raise exception 'Invalid challenge' using errcode = '22023';
  end if;
  if (select count(*) from public.challenges c where c.created_by = me and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many challenges today' using errcode = 'PT429';
  end if;
  insert into public.challenges(space_id, created_by, title, description, kind, unit, daily_goal, starts_on, ends_on, rest_days)
  values (target, me, btrim(challenge_title), btrim(coalesce(challenge_details, '')), challenge_kind,
    case when challenge_kind = 'quantidade' then btrim(unit_name) else '' end, case when challenge_kind = 'quantidade' then goal end,
    start_day, start_day + duration - 1, array(select distinct x from unnest(coalesce(rest, '{}')) x order by x))
  returning * into created;
  insert into public.challenge_members(challenge_id, user_id) values (created.id, me);
  return private.challenge_card(created, me, role);
end;
$$;

-- Mudar o nome e a descrição, ou encerrar antes do fim (sem medalha): quem criou ou quem modera o grupo.
create function private.challenge_manage(target uuid, challenge_title text, challenge_details text, cancel boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.challenges;
  role text;
begin
  select * into c from public.challenges where id = target for update;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.tool_role(c.space_id, me, 'checkin');
  if role is null or not coalesce(c.created_by = me or role = 'moderator', false) or c.closed_at is not null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(cancel, false) then
    update public.challenges set cancelled = true, closed_at = now() where id = target returning * into c;
  else
    update public.challenges set title = btrim(challenge_title), description = btrim(coalesce(challenge_details, '')) where id = target returning * into c;
  end if;
  return private.challenge_card(c, me, role);
end;
$$;

-- 2. Participar ou sair. Sair apaga os dias marcados neste desafio.
create function private.challenge_join(target uuid, joining boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.challenges;
  role text;
begin
  select * into c from public.challenges where id = target;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.tool_role(c.space_id, me, 'checkin');
  if role is null or c.closed_at is not null or c.cancelled or c.ends_on < private.sp_today() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(joining, false) then
    insert into public.challenge_members(challenge_id, user_id) values (target, me) on conflict do nothing;
  else
    delete from public.challenge_members where challenge_id = target and user_id = me;
  end if;
  return private.challenge_card(c, me, role);
end;
$$;

-- 3. Marcar o dia (hoje ou ontem, para quem esqueceu). Os marcos de 7, 15 e 30 dias seguidos viram uma publicação no
-- feed do grupo, uma vez só.
create function private.challenge_checkin(target uuid, which_day date, done boolean, how_much numeric) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.challenges;
  role text;
  today date := private.sp_today();
  streak integer;
  post uuid;
begin
  select * into c from public.challenges where id = target;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.tool_role(c.space_id, me, 'checkin');
  if role is null or not exists (select 1 from public.challenge_members m where m.challenge_id = target and m.user_id = me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if c.closed_at is not null or c.cancelled or which_day is null or which_day not in (today, today - 1)
     or which_day < c.starts_on or which_day > c.ends_on
     or (coalesce(done, false) and c.kind = 'quantidade' and (how_much is null or how_much <= 0 or how_much > 100000)) then
    raise exception 'Invalid check-in' using errcode = '22023';
  end if;
  if not coalesce(done, false) then
    delete from public.challenge_checkins where challenge_id = target and user_id = me and day = which_day;
    return private.challenge_card(c, me, role);
  end if;
  insert into public.challenge_checkins(challenge_id, user_id, day, amount)
  values (target, me, which_day, case when c.kind = 'quantidade' then how_much end)
  on conflict (challenge_id, user_id, day) do update set amount = excluded.amount;
  streak := private.challenge_streak(c, private.challenge_done_days(c, me));
  if streak in (7, 15, 30) and not exists (select 1 from public.challenge_milestones m where m.challenge_id = target and m.user_id = me and m.days = streak) then
    insert into public.network_posts(author_id, body, style, audience, space_id, milestone)
    values (me, format('%s dias seguidos em “%s” 🔥', streak, c.title), 'milestone', 'group', c.space_id,
      jsonb_build_object('challenge', c.id, 'title', c.title, 'days', streak))
    returning id into post;
    insert into public.challenge_milestones(challenge_id, user_id, days, post_id) values (target, me, streak, post);
  end if;
  return private.challenge_card(c, me, role);
end;
$$;

-- 4. Reações: "Dar força" só nos marcos; "Útil" só nas publicações comuns; "Gostei" em tudo.
create or replace function private.toggle_reaction(target uuid, reaction text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  post public.network_posts;
begin
  select * into post from public.network_posts where id = target;
  if not found or me is null or not private.can_see_post(post, me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (reaction = 'forca' and post.style <> 'milestone') or (reaction = 'util' and post.style = 'milestone') then
    raise exception 'Invalid reaction' using errcode = '22023';
  end if;
  delete from public.post_reactions where post_id = target and user_id = me and kind = reaction;
  if found then
    return false;
  end if;
  insert into public.post_reactions(post_id, user_id, kind) values (target, me, reaction);
  perform private.notify(post.author_id, reaction, target, null);
  return true;
end;
$$;

create or replace function private.post_card(post public.network_posts, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', post.id, 'author', private.avatar_of(post.author_id), 'body', post.body, 'style', post.style,
    'audience', post.audience, 'topics', post.topics, 'created_at', post.created_at, 'expires_at', post.expires_at, 'highlight', post.highlight,
    'milestone', post.milestone,
    'space', case when post.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = post.space_id) end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'w', m.width, 'h', m.height, 'alt', m.alt) order by m.position)
      from public.network_media m where m.post_id = post.id), '[]'),
    'counts', jsonb_build_object(
      'gostei', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'gostei'),
      'util', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'util'),
      'forca', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'forca')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.post_reactions r where r.post_id = post.id and r.user_id = viewer), '[]'),
    'saved', exists (select 1 from public.saved_posts s where s.post_id = post.id and s.user_id = viewer))
$$;

-- 5. Fim do desafio, às 9h17 de São Paulo, depois do dia de tolerância (quem esqueceu ainda marca o último dia "ontem"):
-- quem cumpriu pelo menos 80% dos dias que contam ganha a medalha (começa "Só eu"), o marco "Concluí" no grupo e um aviso
-- nas Novidades. A hora evita que o aviso no celular chegue de madrugada.
create function private.close_challenges() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c public.challenges;
  person record;
  required integer;
  achieved integer;
  post uuid;
  medals integer := 0;
begin
  for c in select * from public.challenges where closed_at is null and not cancelled and ends_on < private.sp_today() - 1 for update skip locked loop
    required := private.challenge_required(c, c.ends_on);
    for person in select m.user_id from public.challenge_members m where m.challenge_id = c.id loop
      select count(*) into achieved from unnest(private.challenge_done_days(c, person.user_id)) d
       where d between c.starts_on and c.ends_on and not private.is_rest(c, d);
      continue when required = 0 or achieved < ceil(required * 0.8);
      insert into public.achievements(user_id, challenge_id, title, detail)
      values (person.user_id, c.id, c.title, jsonb_build_object('kind', c.kind, 'unit', c.unit, 'goal', c.daily_goal, 'days', required,
        'done', achieved, 'space', (select s.name from public.spaces s where s.id = c.space_id), 'starts_on', c.starts_on, 'ends_on', c.ends_on))
      on conflict (user_id, challenge_id) do nothing;
      continue when not found;
      medals := medals + 1;
      post := null;
      if private.tool_role(c.space_id, person.user_id, 'checkin') is not null then
        insert into public.network_posts(author_id, body, style, audience, space_id, milestone)
        values (person.user_id, format('Concluí o desafio “%s” 🏅', c.title), 'milestone', 'group', c.space_id,
          jsonb_build_object('challenge', c.id, 'title', c.title, 'days', 0, 'done', achieved, 'of', required))
        returning id into post;
        insert into public.challenge_milestones(challenge_id, user_id, days, post_id) values (c.id, person.user_id, 0, post) on conflict do nothing;
      end if;
      insert into public.network_events(user_id, actor_id, kind, post_id, space_id) values (person.user_id, person.user_id, 'medal', post, c.space_id);
    end loop;
    update public.challenges set closed_at = now() where id = c.id;
  end loop;
  return medals;
end;
$$;

-- 6. Invólucros e permissões. O fim do desafio roda só pelo relógio do banco.
create function public.challenge_create(target uuid, challenge_title text, challenge_details text, challenge_kind text,
  unit_name text, goal numeric, start_day date, duration integer, rest smallint[]) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.challenge_create(target, challenge_title, challenge_details, challenge_kind, unit_name, goal, start_day, duration, rest) $$;
create function public.challenge_manage(target uuid, challenge_title text, challenge_details text, cancel boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.challenge_manage(target, challenge_title, challenge_details, cancel) $$;
create function public.challenge_join(target uuid, joining boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.challenge_join(target, joining) $$;
create function public.challenge_checkin(target uuid, which_day date, done boolean, how_much numeric) returns jsonb
language sql security invoker set search_path = '' as $$ select private.challenge_checkin(target, which_day, done, how_much) $$;

revoke all on function private.challenge_create(uuid, text, text, text, text, numeric, date, integer, smallint[]),
  private.challenge_manage(uuid, text, text, boolean), private.challenge_join(uuid, boolean),
  private.challenge_checkin(uuid, date, boolean, numeric), private.close_challenges(),
  public.challenge_create(uuid, text, text, text, text, numeric, date, integer, smallint[]),
  public.challenge_manage(uuid, text, text, boolean), public.challenge_join(uuid, boolean),
  public.challenge_checkin(uuid, date, boolean, numeric) from public, anon, authenticated;
grant execute on function private.challenge_create(uuid, text, text, text, text, numeric, date, integer, smallint[]),
  private.challenge_manage(uuid, text, text, boolean), private.challenge_join(uuid, boolean),
  private.challenge_checkin(uuid, date, boolean, numeric),
  public.challenge_create(uuid, text, text, text, text, numeric, date, integer, smallint[]),
  public.challenge_manage(uuid, text, text, boolean), public.challenge_join(uuid, boolean),
  public.challenge_checkin(uuid, date, boolean, numeric) to authenticated;

do $desafios$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  perform cron.schedule('jornada-desafios', '17 12 * * *', $job$ select private.close_challenges() $job$);
end $desafios$;
