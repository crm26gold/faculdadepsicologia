-- Networking, entrega 2 da reorganização de 13/10: Salvos, Destaques, descrição da foto, avatar nítido no perfil
-- e os limites num lugar só. Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (perfil, Meu espaço e navegação).

-- 1. Limites num lugar só. Sobem com um update quando o Supabase e a Vercel forem para o plano pago.
alter table public.platform_settings
  add column posts_per_day integer not null default 30 check (posts_per_day between 1 and 1000),
  add column photo_mb_per_person integer not null default 25 check (photo_mb_per_person between 1 and 10000),
  add column photo_mb_total integer not null default 300 check (photo_mb_total between 10 and 1000000);

-- 2. Avatar de 256 px só no perfil aberto, nítido no tamanho grande. Listas e cards continuam com a miniatura de 128 px, leve.
alter table public.profiles add column avatar_large text check (avatar_large is null
    or (char_length(avatar_large) <= 48000 and avatar_large ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$')),
  add constraint profile_large_photo check (avatar_large is null or avatar_photo is not null);
grant update (avatar_large) on public.profiles to authenticated;

-- Sem a versão grande, ela continua se a foto não mudou e sai se a foto mudou.
drop function public.save_my_profile(text, text, text, text);
create function public.save_my_profile(next_kind text, next_value text, next_photo text, next_bio text, next_large text default null) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.profiles as p(user_id, avatar_kind, avatar_value, avatar_photo, avatar_large, bio)
  values ((select auth.uid()), next_kind, coalesce(next_value, ''), nullif(next_photo, ''), nullif(next_large, ''), btrim(coalesce(next_bio, '')))
  on conflict (user_id) do update set avatar_kind = excluded.avatar_kind, avatar_value = excluded.avatar_value,
    avatar_photo = excluded.avatar_photo, bio = excluded.bio, updated_at = now(),
    avatar_large = case when excluded.avatar_photo is null then null when excluded.avatar_large is not null then excluded.avatar_large
      when excluded.avatar_photo = p.avatar_photo then p.avatar_large end
$$;
revoke all on function public.save_my_profile(text, text, text, text, text) from public, anon;
grant execute on function public.save_my_profile(text, text, text, text, text) to authenticated;

-- 3. Descrição da foto, para quem usa leitor de tela.
alter table public.network_media add column alt text not null default '' check (char_length(alt) <= 300);

-- 4. Destaques: o story guardado no perfil, com um título, não some depois das 24 horas.
alter table public.network_posts add column highlight text check (highlight is null or char_length(btrim(highlight)) between 1 and 30),
  add constraint highlight_story check (highlight is null or expires_at is not null);

-- 5. Salvos: publicações guardadas pela pessoa, que só ela vê.
create table public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.network_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index saved_posts_post_idx on public.saved_posts(post_id);
alter table public.saved_posts enable row level security;
revoke all on public.saved_posts from anon, authenticated;
grant select on public.saved_posts to authenticated;
create policy "Own saved" on public.saved_posts for select to authenticated using (user_id = (select auth.uid()));

-- 6. Quem vê: o destaque continua visível para o público dele depois das 24 horas.
create or replace function private.can_see_post(post public.network_posts, viewer uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (post.expires_at is null or post.expires_at > now() or post.highlight is not null) and (post.author_id = viewer or case post.audience
    when 'private' then false
    when 'group' then exists (select 1 from public.space_members m where m.space_id = post.space_id and m.user_id = viewer)
      or private.staff_of(post.space_id, viewer)
    when 'followers' then private.follows_accepted(viewer, post.author_id)
    when 'public' then not coalesce((select p.closed from public.profiles p where p.user_id = post.author_id), true)
      or private.follows_accepted(viewer, post.author_id)
    else false end)
$$;

create or replace function private.post_card(post public.network_posts, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', post.id, 'author', private.avatar_of(post.author_id), 'body', post.body, 'style', post.style,
    'audience', post.audience, 'topics', post.topics, 'created_at', post.created_at, 'expires_at', post.expires_at, 'highlight', post.highlight,
    'space', case when post.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = post.space_id) end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'w', m.width, 'h', m.height, 'alt', m.alt) order by m.position)
      from public.network_media m where m.post_id = post.id), '[]'),
    'counts', jsonb_build_object(
      'gostei', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'gostei'),
      'util', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'util')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.post_reactions r where r.post_id = post.id and r.user_id = viewer), '[]'),
    'saved', exists (select 1 from public.saved_posts s where s.post_id = post.id and s.user_id = viewer))
$$;

-- 7. Publicar: limites lidos da configuração e descrição de cada foto.
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
    if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m join public.network_posts p on p.id = m.post_id
        where p.author_id = me) > limits.photo_mb_per_person::bigint * 1024 * 1024 then
      raise exception 'Photo quota' using errcode = 'PT413';
    end if;
    if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m) > limits.photo_mb_total::bigint * 1024 * 1024 then
      raise exception 'Photo space full' using errcode = 'PT507';
    end if;
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

-- 8. Guardar um story no perfil (ou tirar). Só quem publicou.
create function private.keep_story(target uuid, title text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.network_posts set highlight = nullif(btrim(coalesce(title, '')), '')
   where id = target and author_id = auth.uid() and expires_at is not null;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- 9. Salvar e a lista de salvos (até 500; aparecem só as publicações que a pessoa ainda pode ver).
create function private.toggle_save(target uuid) returns boolean
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
  delete from public.saved_posts where user_id = me and post_id = target;
  if found then
    return false;
  end if;
  if (select count(*) from public.saved_posts where user_id = me) >= 500 then
    raise exception 'Too many saved' using errcode = 'PT430';
  end if;
  insert into public.saved_posts(user_id, post_id) values (me, target);
  return true;
end;
$$;

create function private.saved_feed(before timestamptz) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_agg(private.post_card(s.post, (select auth.uid())) || jsonb_build_object('saved_at', s.created_at) order by s.created_at desc)
    from (select p as post, v.created_at from public.saved_posts v join public.network_posts p on p.id = v.post_id
           where v.user_id = (select auth.uid()) and v.created_at < coalesce(before, 'infinity') and private.can_see_post(p, (select auth.uid()))
           order by v.created_at desc limit 30) s), '[]')
$$;

-- 10. Perfil com os destaques que quem olha pode ver.
create or replace function private.person_profile(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  person public.profiles;
  status text;
begin
  select * into person from public.profiles where user_id = target;
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

-- 11. "Baixar meus dados" também traz o que a pessoa salvou.
create function private.my_saved_posts() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('post', s.post_id, 'saved_at', s.created_at) order by s.created_at), '[]')
  from public.saved_posts s where s.user_id = (select auth.uid()) $$;

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

-- 12. Invólucros chamados pela API.
create function public.keep_story(target uuid, title text) returns void
language sql security invoker set search_path = '' as $$ select private.keep_story(target, title) $$;
create function public.toggle_save(target uuid) returns boolean
language sql security invoker set search_path = '' as $$ select private.toggle_save(target) $$;
create function public.saved_feed(before timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.saved_feed(before) $$;

revoke all on function private.keep_story(uuid, text), private.toggle_save(uuid), private.saved_feed(timestamptz), private.my_saved_posts(),
  public.keep_story(uuid, text), public.toggle_save(uuid), public.saved_feed(timestamptz) from public, anon;
grant execute on function private.keep_story(uuid, text), private.toggle_save(uuid), private.saved_feed(timestamptz), private.my_saved_posts(),
  public.keep_story(uuid, text), public.toggle_save(uuid), public.saved_feed(timestamptz) to authenticated;

-- 13. A faxina de cada hora poupa os stories guardados no perfil.
do $stories$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  perform cron.schedule('jornada-stories', '7 * * * *', $job$ delete from public.network_posts where expires_at < now() and highlight is null $job$);
end $stories$;
