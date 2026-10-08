-- Google Agenda (Jornada → Google): cada pessoa liga a própria conta Google a uma agenda criada pela Jornada.
-- A renovação do Google fica só cifrada (cofre do servidor); cada função alcança apenas a linha de quem chama.
create table private.google_agenda_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 refresh_ciphertext text not null check(char_length(refresh_ciphertext) between 1 and 4000),
 calendar_id text not null check(char_length(calendar_id) between 1 and 300),
 connected_at timestamptz not null default now(),
 synced_at timestamptz,
 synced_revision bigint,
 sync_started_at timestamptz,
 events integer not null default 0 check(events >= 0),
 problem text not null default '' check(problem in ('', 'revoked', 'partial', 'failed'))
);
alter table private.google_agenda_links enable row level security;
revoke all on private.google_agenda_links from public,anon,authenticated;

create function private.google_agenda_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select jsonb_build_object('connected_at',l.connected_at,'synced_at',l.synced_at,'events',l.events,'problem',l.problem,'syncing',l.sync_started_at > now() - interval '90 seconds')
  from private.google_agenda_links l where l.user_id=(select auth.uid()));
end;
$$;
-- Conectar (ou reconectar): guarda a nova renovação e a agenda, e pede uma atualização completa.
create function private.google_agenda_save(next_ciphertext text, next_calendar text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into private.google_agenda_links(user_id,refresh_ciphertext,calendar_id) values((select auth.uid()),next_ciphertext,next_calendar)
 on conflict (user_id) do update set refresh_ciphertext=excluded.refresh_ciphertext,calendar_id=excluded.calendar_id,connected_at=now(),
  synced_at=null,synced_revision=null,sync_started_at=null,events=0,problem='';
end;
$$;
create function private.google_agenda_link() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select jsonb_build_object('refresh_ciphertext',l.refresh_ciphertext,'calendar_id',l.calendar_id) from private.google_agenda_links l where l.user_id=(select auth.uid()));
end;
$$;
-- Uma atualização por vez: só reserva quando a revisão mudou (ou a pessoa pediu) e nenhuma outra está em andamento.
create function private.google_agenda_claim(next_revision bigint, force boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 update private.google_agenda_links l set sync_started_at=now()
 where l.user_id=(select auth.uid()) and l.problem<>'revoked' and (force or l.synced_revision is distinct from next_revision)
  and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
 returning jsonb_build_object('refresh_ciphertext',l.refresh_ciphertext,'calendar_id',l.calendar_id) into claimed;
 return claimed;
end;
$$;
-- Revisão nula quando a atualização não terminou: a próxima gravação tenta de novo.
create function private.google_agenda_finish(next_revision bigint, next_events integer, next_problem text, next_calendar text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 update private.google_agenda_links set sync_started_at=null,synced_at=now(),synced_revision=next_revision,events=next_events,problem=next_problem,
  calendar_id=coalesce(nullif(next_calendar,''),calendar_id)
 where user_id=(select auth.uid());
end;
$$;
create function private.google_agenda_remove() returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from private.google_agenda_links where user_id=(select auth.uid());
end;
$$;

create function public.google_agenda_state() returns jsonb language sql stable security invoker set search_path='' as $$ select private.google_agenda_state(); $$;
create function public.google_agenda_save(next_ciphertext text, next_calendar text) returns void language sql security invoker set search_path='' as $$ select private.google_agenda_save(next_ciphertext,next_calendar); $$;
create function public.google_agenda_link() returns jsonb language sql stable security invoker set search_path='' as $$ select private.google_agenda_link(); $$;
create function public.google_agenda_claim(next_revision bigint, force boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.google_agenda_claim(next_revision,force); $$;
create function public.google_agenda_finish(next_revision bigint, next_events integer, next_problem text, next_calendar text) returns void language sql security invoker set search_path='' as $$ select private.google_agenda_finish(next_revision,next_events,next_problem,next_calendar); $$;
create function public.google_agenda_remove() returns void language sql security invoker set search_path='' as $$ select private.google_agenda_remove(); $$;

revoke all on function private.google_agenda_state(),public.google_agenda_state(),private.google_agenda_save(text,text),public.google_agenda_save(text,text),
 private.google_agenda_link(),public.google_agenda_link(),private.google_agenda_claim(bigint,boolean),public.google_agenda_claim(bigint,boolean),
 private.google_agenda_finish(bigint,integer,text,text),public.google_agenda_finish(bigint,integer,text,text),private.google_agenda_remove(),public.google_agenda_remove() from public,anon;
grant execute on function private.google_agenda_state(),public.google_agenda_state(),private.google_agenda_save(text,text),public.google_agenda_save(text,text),
 private.google_agenda_link(),public.google_agenda_link(),private.google_agenda_claim(bigint,boolean),public.google_agenda_claim(bigint,boolean),
 private.google_agenda_finish(bigint,integer,text,text),public.google_agenda_finish(bigint,integer,text,text),private.google_agenda_remove(),public.google_agenda_remove() to authenticated;
