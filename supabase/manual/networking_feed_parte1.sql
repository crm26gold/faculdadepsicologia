-- Parte 1 de 3.
-- Networking, etapa 2: seguir pessoas, publicações com público escolhido, Gostei e Útil, atualizações.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (13/10/2026). Privado por padrão: perfil novo é fechado
-- (seguir pede aceite) e fica fora da busca de pessoas; cada publicação tem o público que a pessoa escolhe.

-- 1. Privacidade do perfil, decidida pela pessoa.
alter table public.profiles
  add column closed boolean not null default true,
  add column discoverable boolean not null default false,
  add column show_follows boolean not null default false;

-- 2. Seguir. Perfil fechado recebe pedido; aberto, seguidor direto.
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id, accepted);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;
create policy "Own follows" on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- 3. Publicações: texto ou card de texto (gerado na tela, sem arquivo). Fotos vêm na etapa 3.
create table public.network_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2200),
  style text not null default 'text' check (style in ('text', 'card_blue', 'card_sand', 'card_lavender', 'card_rose', 'card_green')),
  audience text not null default 'followers' check (audience in ('public', 'followers', 'group', 'private')),
  space_id uuid references public.spaces(id) on delete cascade,
  topics text[] not null default '{}' check (private.valid_topics(topics)),
  created_at timestamptz not null default now(),
  constraint post_group check ((audience = 'group') = (space_id is not null))
);
create index network_posts_author_idx on public.network_posts(author_id, created_at desc);
create index network_posts_space_idx on public.network_posts(space_id, created_at desc) where space_id is not null;
create index network_posts_topics_idx on public.network_posts using gin (topics);

create table public.post_reactions (
  post_id uuid not null references public.network_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gostei', 'util')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index post_reactions_user_idx on public.post_reactions(user_id);

-- 4. Atualizações: pedidos, novos seguidores, Gostei e Útil, pedidos de grupo. Ficam 90 dias.
create table public.network_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'follow_request', 'follow_accepted', 'gostei', 'util', 'join_request', 'join_approved')),
  post_id uuid references public.network_posts(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index network_events_user_idx on public.network_events(user_id, created_at desc);
create index network_events_actor_idx on public.network_events(actor_id);
create index network_events_post_idx on public.network_events(post_id);
create index network_events_space_idx on public.network_events(space_id);

-- Leitura sempre pelas funções abaixo; nas tabelas, cada um vê só o que é seu.
alter table public.network_posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.network_events enable row level security;
revoke all on public.network_posts, public.post_reactions, public.network_events from anon, authenticated;
grant select on public.network_posts, public.post_reactions, public.network_events to authenticated;
create policy "Own posts" on public.network_posts for select to authenticated using (author_id = (select auth.uid()));
create policy "Own reactions" on public.post_reactions for select to authenticated using (user_id = (select auth.uid()));
create policy "Own updates" on public.network_events for select to authenticated using (user_id = (select auth.uid()));

-- 5. Regras de quem vê o quê.
create function private.follows_accepted(viewer uuid, author uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.follows f where f.follower_id = viewer and f.followee_id = author and f.accepted) $$;

-- Pessoas que dividem um grupo ou sala (membros diretos do mesmo espaço).
create function private.share_space(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.space_members x join public.space_members y on y.space_id = x.space_id
  where x.user_id = a and y.user_id = b) $$;

-- Um perfil é alcançável por quem: é a própria pessoa, a pessoa deixou aparecer na busca,
-- dividem um grupo, ou já existe um vínculo de seguir entre as duas.
create function private.can_reach_profile(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select viewer = target or exists (select 1 from public.profiles p where p.user_id = target and (p.discoverable
    or private.share_space(viewer, target)
    or exists (select 1 from public.follows f where (f.follower_id = viewer and f.followee_id = target) or (f.follower_id = target and f.followee_id = viewer))))
$$;

-- Público da publicação: "Todos" num perfil fechado vale só para quem segue.
create function private.can_see_post(post public.network_posts, viewer uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select post.author_id = viewer or case post.audience
    when 'private' then false
    when 'group' then exists (select 1 from public.space_members m where m.space_id = post.space_id and m.user_id = viewer)
      or private.staff_of(post.space_id, viewer)
    when 'followers' then private.follows_accepted(viewer, post.author_id)
    when 'public' then not coalesce((select p.closed from public.profiles p where p.user_id = post.author_id), true)
      or private.follows_accepted(viewer, post.author_id)
    else false end
$$;

create function private.avatar_of(person uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('id', a.user_id, 'name', a.display_name,
  'avatar', (select jsonb_build_object('kind', f.avatar_kind, 'value', f.avatar_value, 'photo', f.avatar_photo) from public.profiles f where f.user_id = a.user_id))
  from public.accounts a where a.user_id = person $$;

create function private.post_card(post public.network_posts, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', post.id, 'author', private.avatar_of(post.author_id), 'body', post.body, 'style', post.style,
    'audience', post.audience, 'topics', post.topics, 'created_at', post.created_at,
    'space', case when post.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = post.space_id) end,
    'counts', jsonb_build_object(
      'gostei', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'gostei'),
      'util', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'util')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.post_reactions r where r.post_id = post.id and r.user_id = viewer), '[]'))
$$;

create function private.notify(recipient uuid, event_kind text, post uuid, space uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into public.network_events(user_id, actor_id, kind, post_id, space_id)
  select recipient, (select auth.uid()), event_kind, post, space
   where recipient is distinct from (select auth.uid())
     and not exists (select 1 from public.network_events e where e.user_id = recipient and e.actor_id = (select auth.uid())
       and e.kind = event_kind and e.post_id is not distinct from post and e.space_id is not distinct from space
       and e.created_at > now() - interval '1 day')
$$;

