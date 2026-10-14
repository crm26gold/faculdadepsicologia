-- Caixa de ferramentas, entrega 2: "Achar horário em comum". Alguém do grupo propõe até 7 dias e uma faixa de horas;
-- cada um marca as horas em que pode; o grupo vê quantos podem em cada hora e quem cuida do grupo (ou quem propôs)
-- marca o horário escolhido. Só quem está no próprio grupo, com a ferramenta "encontros" ligada, vê e marca.
-- Depende de private.tool_role, private.sp_today e private.space_archived (desafios).

create table public.time_finders (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  days date[] not null check (cardinality(days) between 1 and 7),
  from_hour smallint not null check (from_hour between 0 and 23),
  to_hour smallint not null check (to_hour between 1 and 24),
  chosen_day date,
  chosen_hour smallint,
  created_at timestamptz not null default now(),
  constraint time_finder_hours check (to_hour > from_hour),
  constraint time_finder_choice check ((chosen_day is null) = (chosen_hour is null))
);
create index time_finders_space_idx on public.time_finders(space_id, created_at desc);
create index time_finders_creator_idx on public.time_finders(created_by);

-- Uma linha por pessoa: as horas em que pode, como índice (posição do dia × 24 + hora).
create table public.time_finder_marks (
  finder_id uuid not null references public.time_finders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slots smallint[] not null default '{}' check (cardinality(slots) <= 168),
  updated_at timestamptz not null default now(),
  primary key (finder_id, user_id)
);
create index time_finder_marks_user_idx on public.time_finder_marks(user_id);

alter table public.time_finders enable row level security;
alter table public.time_finder_marks enable row level security;
revoke all on public.time_finders, public.time_finder_marks from anon, authenticated;

-- Quem sai do grupo leva as próprias marcações junto.
create or replace function private.challenge_left() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.challenge_members m using public.challenges c
   where c.id = m.challenge_id and c.space_id = old.space_id and m.user_id = old.user_id;
  delete from public.time_finder_marks k using public.time_finders f
   where f.id = k.finder_id and f.space_id = old.space_id and k.user_id = old.user_id;
  return old;
end;
$$;

-- O cartão: as horas de cada um (quem bloqueou ou foi bloqueado conta, sem nome) e as suas.
create function private.finder_card(f public.time_finders, viewer uuid, role text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'days', to_jsonb(f.days), 'from_hour', f.from_hour, 'to_hour', f.to_hour,
    'chosen', case when f.chosen_day is not null then jsonb_build_object('day', f.chosen_day, 'hour', f.chosen_hour) end,
    'creator', case when not private.blocked_between(viewer, f.created_by) then private.avatar_of(f.created_by) end,
    'can_manage', f.created_by = viewer or role = 'moderator', 'created_at', f.created_at,
    'mine', coalesce((select to_jsonb(k.slots) from public.time_finder_marks k where k.finder_id = f.id and k.user_id = viewer), '[]'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('person', case when not private.blocked_between(viewer, k.user_id)
        then private.avatar_of(k.user_id) end, 'slots', to_jsonb(k.slots)) order by k.updated_at)
      from public.time_finder_marks k where k.finder_id = f.id and cardinality(k.slots) > 0), '[]'))
$$;

-- Os do grupo: os em aberto (com algum dia ainda por vir) primeiro, depois os marcados há menos de 30 dias.
create function private.space_finders(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  role text := private.tool_role(target, me, 'encontros');
begin
  if me is null or role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.finder_card(o.f, me, role) order by o.chosen, o.created_at desc) from (
    select f, f.chosen_day is not null as chosen, f.created_at from public.time_finders f
     where f.space_id = target and (f.chosen_day >= private.sp_today() - 30 or (f.chosen_day is null and f.days[cardinality(f.days)] >= private.sp_today()))
     order by f.chosen_day is not null, f.created_at desc limit 20) o), '[]');
end;
$$;

-- Propor: até 7 dias, de hoje a 60 dias, e uma faixa de horas. Até 10 por dia.
create function private.finder_create(target uuid, finder_title text, finder_days date[], first_hour smallint, last_hour smallint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  role text := private.tool_role(target, me, 'encontros');
  clean date[];
  created public.time_finders;
begin
  if me is null or role is null or private.space_archived(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  clean := array(select distinct d from unnest(coalesce(finder_days, '{}')) d where d is not null order by d);
  if cardinality(clean) not between 1 and 7 or clean[1] < private.sp_today() or clean[cardinality(clean)] > private.sp_today() + 60
     or first_hour is null or last_hour is null or first_hour < 0 or last_hour > 24 or last_hour <= first_hour then
    raise exception 'Invalid time finder' using errcode = '22023';
  end if;
  if (select count(*) from public.time_finders f where f.created_by = me and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many time finders today' using errcode = 'PT429';
  end if;
  insert into public.time_finders(space_id, created_by, title, days, from_hour, to_hour)
  values (target, me, btrim(coalesce(finder_title, '')), clean, first_hour, last_hour) returning * into created;
  return private.finder_card(created, me, role);
end;
$$;

-- Marcar as próprias horas (troca tudo de uma vez; vazio apaga). Depois do horário escolhido, não muda mais. A trava
-- "for share" faz a marcação esperar quem está escolhendo ou apagando a busca.
create function private.finder_mark(target uuid, marked smallint[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f public.time_finders;
  role text;
  clean smallint[];
begin
  select * into f from public.time_finders where id = target for share;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.tool_role(f.space_id, me, 'encontros');
  if role is null or private.space_archived(f.space_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  clean := array(select distinct s from unnest(coalesce(marked, '{}')) s where s is not null order by s);
  if f.chosen_day is not null or exists (select 1 from unnest(clean) s
       where s < 0 or s / 24 >= cardinality(f.days) or s % 24 < f.from_hour or s % 24 >= f.to_hour) then
    raise exception 'Invalid marks' using errcode = '22023';
  end if;
  -- Dia que já passou não conta mais.
  clean := array(select s from unnest(clean) s where f.days[s / 24 + 1] >= private.sp_today() order by s);
  if cardinality(clean) = 0 then
    delete from public.time_finder_marks where finder_id = target and user_id = me;
  else
    insert into public.time_finder_marks(finder_id, user_id, slots) values (target, me, clean)
    on conflict (finder_id, user_id) do update set slots = excluded.slots, updated_at = now();
  end if;
  return private.finder_card(f, me, role);
end;
$$;

-- Escolher o horário (ou apagar a busca): quem propôs ou quem modera o grupo.
create function private.finder_manage(target uuid, pick_day date, pick_hour smallint, remove boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f public.time_finders;
  role text;
begin
  select * into f from public.time_finders where id = target for update;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.tool_role(f.space_id, me, 'encontros');
  if role is null or not coalesce(f.created_by = me or role = 'moderator', false) or private.space_archived(f.space_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(remove, false) then
    delete from public.time_finders where id = target;
    return null;
  end if;
  if pick_day is null or pick_hour is null or not (pick_day = any(f.days)) or pick_day < private.sp_today() or pick_hour < f.from_hour or pick_hour >= f.to_hour then
    raise exception 'Invalid choice' using errcode = '22023';
  end if;
  update public.time_finders set chosen_day = pick_day, chosen_hour = pick_hour where id = target returning * into f;
  return private.finder_card(f, me, role);
end;
$$;

-- "Baixar meus dados": as buscas que a pessoa propôs e as horas que marcou.
create function private.my_time_finders_export() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'created', coalesce((select jsonb_agg(jsonb_build_object('title', f.title, 'days', f.days, 'from_hour', f.from_hour, 'to_hour', f.to_hour,
        'chosen_day', f.chosen_day, 'chosen_hour', f.chosen_hour, 'created_at', f.created_at) order by f.created_at)
      from public.time_finders f where f.created_by = (select auth.uid())), '[]'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('title', f.title, 'days', f.days, 'slots', k.slots, 'updated_at', k.updated_at)
        order by k.updated_at)
      from public.time_finder_marks k join public.time_finders f on f.id = k.finder_id where k.user_id = (select auth.uid())), '[]'))
$$;

-- O mesmo "Baixar meus dados", agora com as buscas de horário.
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
    'group_messages', private.my_messages(),
    'group_message_photos', private.my_message_photos(),
    'challenges', private.my_challenges_export(),
    'time_finders', private.my_time_finders_export(),
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

create function public.space_finders(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.space_finders(target) $$;
create function public.finder_create(target uuid, finder_title text, finder_days date[], first_hour smallint, last_hour smallint) returns jsonb
language sql security invoker set search_path = '' as $$ select private.finder_create(target, finder_title, finder_days, first_hour, last_hour) $$;
create function public.finder_mark(target uuid, marked smallint[]) returns jsonb
language sql security invoker set search_path = '' as $$ select private.finder_mark(target, marked) $$;
create function public.finder_manage(target uuid, pick_day date, pick_hour smallint, remove boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.finder_manage(target, pick_day, pick_hour, remove) $$;

revoke all on function private.finder_card(public.time_finders, uuid, text), private.space_finders(uuid),
  private.finder_create(uuid, text, date[], smallint, smallint), private.finder_mark(uuid, smallint[]),
  private.finder_manage(uuid, date, smallint, boolean), private.my_time_finders_export(),
  public.space_finders(uuid), public.finder_create(uuid, text, date[], smallint, smallint), public.finder_mark(uuid, smallint[]),
  public.finder_manage(uuid, date, smallint, boolean) from public, anon, authenticated;
grant execute on function private.space_finders(uuid), private.finder_create(uuid, text, date[], smallint, smallint),
  private.finder_mark(uuid, smallint[]), private.finder_manage(uuid, date, smallint, boolean), private.my_time_finders_export(),
  public.space_finders(uuid), public.finder_create(uuid, text, date[], smallint, smallint), public.finder_mark(uuid, smallint[]),
  public.finder_manage(uuid, date, smallint, boolean) to authenticated;
