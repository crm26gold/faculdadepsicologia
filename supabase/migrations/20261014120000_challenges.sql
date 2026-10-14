-- Networking: desafios do grupo com check-in do dia, sequência, marcos no feed e medalha. Parte 1 de 3 (tabelas e
-- leituras). A parte 2 (20261014121000_challenges_actions.sql) traz criar, participar, marcar o dia, "Dar força" e o
-- fim do desafio; a parte 3 (20261014122000_achievements.sql), a aba Conquistas e a exportação.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (desafios, 14/10). Só quem está no próprio grupo vê e participa.

-- 1. Marco no feed (publicação feita pelo app, presa ao desafio) e a reação "Dar força".
alter table public.network_posts drop constraint network_posts_style_check;
alter table public.network_posts
  add constraint network_posts_style_check check (style in ('text', 'card_blue', 'card_sand', 'card_lavender', 'card_rose', 'card_green', 'milestone')),
  add column milestone jsonb check (milestone is null or jsonb_typeof(milestone) = 'object'),
  add constraint milestone_style check ((style = 'milestone') = (milestone is not null));
alter table public.post_reactions drop constraint post_reactions_kind_check;
alter table public.post_reactions add constraint post_reactions_kind_check check (kind in ('gostei', 'util', 'forca'));
alter table public.network_events drop constraint network_events_kind_check;
alter table public.network_events add constraint network_events_kind_check
  check (kind in ('follow', 'follow_request', 'follow_accepted', 'gostei', 'util', 'join_request', 'join_approved', 'forca', 'medal'));
alter table public.profiles add column show_achievements boolean not null default true;

-- 2. Desafios. "feito": marcou, cumpriu; "quantidade": cumpre quando chega à meta do dia. Dias de descanso não quebram
-- a sequência. Encerrar antes do fim cancela, sem medalha.
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  kind text not null check (kind in ('feito', 'quantidade')),
  unit text not null default '' check (char_length(unit) <= 20),
  daily_goal numeric(10, 2) check (daily_goal > 0 and daily_goal <= 100000),
  starts_on date not null,
  ends_on date not null,
  rest_days smallint[] not null default '{}' check (rest_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(rest_days) <= 3),
  cancelled boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_dates check (ends_on >= starts_on + 2 and ends_on <= starts_on + 364),
  constraint challenge_goal check ((kind = 'quantidade') = (daily_goal is not null))
);
create index challenges_space_idx on public.challenges(space_id, ends_on desc);
create index challenges_open_idx on public.challenges(ends_on) where closed_at is null;
create index challenges_creator_idx on public.challenges(created_by);

create table public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index challenge_members_user_idx on public.challenge_members(user_id);

-- Sair do desafio apaga os dias marcados junto.
create table public.challenge_checkins (
  challenge_id uuid not null,
  user_id uuid not null,
  day date not null,
  amount numeric(10, 2) check (amount > 0 and amount <= 100000),
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, day),
  foreign key (challenge_id, user_id) references public.challenge_members(challenge_id, user_id) on delete cascade
);

-- Marcos já publicados (7, 15 e 30 dias seguidos; 0 = concluiu), para não repetir.
create table public.challenge_milestones (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  days smallint not null check (days in (0, 7, 15, 30)),
  post_id uuid references public.network_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, days)
);
create index challenge_milestones_user_idx on public.challenge_milestones(user_id);
create index challenge_milestones_post_idx on public.challenge_milestones(post_id);

-- Conquistas: a medalha de desafio concluído. Começa "Só eu"; a pessoa escolhe quem vê.
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'medal' check (kind in ('medal')),
  challenge_id uuid references public.challenges(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  audience text not null default 'private' check (audience in ('public', 'followers', 'private')),
  created_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);
create index achievements_challenge_idx on public.achievements(challenge_id);

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.challenge_checkins enable row level security;
alter table public.challenge_milestones enable row level security;
alter table public.achievements enable row level security;
revoke all on public.challenges, public.challenge_members, public.challenge_checkins, public.challenge_milestones, public.achievements
  from anon, authenticated;

-- 3. Regras de apoio. O dia é o de São Paulo; domingo = 0.
create function private.sp_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Quem usa uma ferramenta do grupo: só quem está no próprio grupo, com a ferramenta ligada. Dono e líderes moderam.
create function private.tool_role(target uuid, who uuid, tool text) returns text
language sql stable security definer set search_path = ''
as $$
  select case when m.role in ('owner', 'teacher', 'assistant', 'leader') then 'moderator' else 'member' end
    from public.spaces s join public.space_members m on m.space_id = s.id and m.user_id = who
   where s.id = target and s.kind = 'group' and tool = any(s.tools)
$$;

create function private.is_rest(c public.challenges, day date) returns boolean
language sql immutable set search_path = ''
as $$ select extract(dow from day)::smallint = any(c.rest_days) $$;

-- Dias cumpridos: "feito" marcado, ou a quantidade do dia chegou à meta.
create function private.challenge_done_days(c public.challenges, who uuid) returns date[]
language sql stable security definer set search_path = ''
as $$ select coalesce(array_agg(k.day order by k.day), '{}') from public.challenge_checkins k
  where k.challenge_id = c.id and k.user_id = who and (c.kind = 'feito' or k.amount >= c.daily_goal) $$;

-- Dias seguidos até hoje. Hoje ainda em aberto e dias de descanso não quebram a sequência.
create function private.challenge_streak(c public.challenges, done date[]) returns integer
language plpgsql stable set search_path = ''
as $$
declare
  day date := least(private.sp_today(), c.ends_on);
  streak integer := 0;
begin
  if not (day = any(done)) then
    day := day - 1;
  end if;
  while day >= c.starts_on loop
    if day = any(done) then
      streak := streak + 1;
    elsif not private.is_rest(c, day) then
      exit;
    end if;
    day := day - 1;
  end loop;
  return streak;
end;
$$;

-- Dias que contam (sem os de descanso) do começo até "until".
create function private.challenge_required(c public.challenges, until date) returns integer
language sql stable set search_path = ''
as $$ select count(*)::integer from generate_series(c.starts_on, least(c.ends_on, until), interval '1 day') d
  where not private.is_rest(c, d::date) $$;

-- O desafio como a tela mostra: o grupo de hoje (quem fez), o progresso do grupo e o de quem olha. Quem bloqueou ou foi
-- bloqueado conta no número, mas não aparece no rosto.
create function private.challenge_card(c public.challenges, viewer uuid, role text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := private.sp_today();
  joined boolean := exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = viewer);
  done date[] := case when joined then private.challenge_done_days(c, viewer) else '{}'::date[] end;
  people integer := (select count(*) from public.challenge_members m where m.challenge_id = c.id);
  required integer := case when today < c.starts_on then 0 else private.challenge_required(c, today) end;
  group_done integer;
  done_today jsonb;
begin
  select count(*) into group_done from public.challenge_checkins k
   where k.challenge_id = c.id and k.day <= today and (c.kind = 'feito' or k.amount >= c.daily_goal) and not private.is_rest(c, k.day);
  select jsonb_build_object('count', count(*), 'people', coalesce(jsonb_agg(private.avatar_of(x.user_id)) filter (where x.n <= 12 and not x.hidden), '[]'))
    into done_today
    from (select k.user_id, private.blocked_between(viewer, k.user_id) as hidden, row_number() over (order by k.created_at) as n
            from public.challenge_checkins k
           where k.challenge_id = c.id and k.day = today and (c.kind = 'feito' or k.amount >= c.daily_goal)) x;
  return jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'kind', c.kind, 'unit', c.unit, 'goal', c.daily_goal,
    'starts_on', c.starts_on, 'ends_on', c.ends_on, 'rest_days', to_jsonb(c.rest_days), 'today', today,
    'state', case when c.cancelled then 'cancelled' when c.closed_at is not null or c.ends_on < today then 'ended'
      when c.starts_on > today then 'soon' else 'active' end,
    'creator', case when not private.blocked_between(viewer, c.created_by) then private.avatar_of(c.created_by) end,
    'can_manage', c.created_by = viewer or role = 'moderator', 'people', people, 'done_today', done_today,
    'progress', case when required * people > 0 then round(least(1, group_done::numeric / (required * people)), 3) else 0 end,
    'me', case when joined then jsonb_build_object(
      'streak', private.challenge_streak(c, done),
      'done_days', (select count(*) from unnest(done) d where d <= today and not private.is_rest(c, d)),
      'required', required,
      'today', (select jsonb_build_object('amount', k.amount, 'done', today = any(done)) from public.challenge_checkins k
        where k.challenge_id = c.id and k.user_id = viewer and k.day = today),
      'yesterday', (select jsonb_build_object('amount', k.amount, 'done', (today - 1) = any(done)) from public.challenge_checkins k
        where k.challenge_id = c.id and k.user_id = viewer and k.day = today - 1),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'done', d::date = any(done), 'rest', private.is_rest(c, d::date)) order by d), '[]')
        from generate_series(greatest(c.starts_on, today - 6), least(c.ends_on, today), interval '1 day') d),
      'medal', exists (select 1 from public.achievements a where a.user_id = viewer and a.challenge_id = c.id)) end);
end;
$$;

-- 4. Leituras: os desafios do grupo (em andamento primeiro) e, no Meu dia, os de hoje de quem participa.
create function private.space_challenges(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  role text := private.tool_role(target, me, 'checkin');
begin
  if me is null or role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.challenge_card(o.ch, me, role) order by o.finished, o.sort_key) from (
    select c as ch, f.finished, case when f.finished then date '2000-01-01' - c.ends_on else c.ends_on - date '2000-01-01' end as sort_key
      from public.challenges c cross join lateral (select c.cancelled or c.closed_at is not null or c.ends_on < private.sp_today() as finished) f
     where c.space_id = target
     order by f.finished, sort_key limit 30) o), '[]');
end;
$$;

create function private.my_challenges_today() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'unit', x.unit, 'goal', x.daily_goal,
      'space', jsonb_build_object('id', x.space_id, 'name', x.space_name), 'rest', private.is_rest(x.c, private.sp_today()),
      'amount', x.amount, 'done', private.sp_today() = any(x.done), 'streak', private.challenge_streak(x.c, x.done)) order by x.ends_on), '[]')
    from (select c.id, c.title, c.kind, c.unit, c.daily_goal, c.space_id, c.ends_on, s.name as space_name, c,
            private.challenge_done_days(c, m.user_id) as done,
            (select k.amount from public.challenge_checkins k where k.challenge_id = c.id and k.user_id = m.user_id and k.day = private.sp_today()) as amount
            from public.challenge_members m join public.challenges c on c.id = m.challenge_id join public.spaces s on s.id = c.space_id
           where m.user_id = (select auth.uid()) and c.closed_at is null and not c.cancelled
             and private.sp_today() between c.starts_on and c.ends_on
             and private.tool_role(c.space_id, m.user_id, 'checkin') is not null) x
$$;

-- 5. Invólucros e permissões.
create function public.space_challenges(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.space_challenges(target) $$;
create function public.my_challenges_today() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.my_challenges_today() $$;

revoke all on function private.sp_today(), private.tool_role(uuid, uuid, text), private.is_rest(public.challenges, date),
  private.challenge_done_days(public.challenges, uuid), private.challenge_streak(public.challenges, date[]),
  private.challenge_required(public.challenges, date), private.challenge_card(public.challenges, uuid, text),
  private.space_challenges(uuid), private.my_challenges_today(),
  public.space_challenges(uuid), public.my_challenges_today() from public, anon, authenticated;
grant execute on function private.space_challenges(uuid), private.my_challenges_today(),
  public.space_challenges(uuid), public.my_challenges_today() to authenticated;
