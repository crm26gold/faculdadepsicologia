-- Quedas de IA (lote A3). Quando uma conexão falha e outra assume, ou nenhuma assume, o servidor anota
-- o fato, sem conteúdo, chave ou pessoa: a empresa que falhou, o tipo de falha, a tarefa e quem respondeu.
-- O proprietário vê o resumo das últimas 24 horas no mapa de recursos e é levado a corrigir (trocar a chave,
-- pôr outra IA, ativar o plano pago). Os registros ficam 7 dias.
create table private.ai_route_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  task text not null check (task in ('assistente','organizar','voz','transcricao','teste')),
  failed_provider text not null check (failed_provider ~ '^[a-z_]{2,30}$'),
  failed_kind text not null check (failed_kind in ('network','server','rate_limit','billing','auth','model','invalid')),
  served_provider text check (served_provider ~ '^[a-z_]{2,30}$')
);
create index ai_route_events_created_idx on private.ai_route_events(created_at);
alter table private.ai_route_events enable row level security;
revoke all on private.ai_route_events from public, anon, authenticated;

-- The server reports with its secret (the same proof the bots use); at most 8 failures per call.
create function public.ai_report_fallbacks(server_secret text, task_id text, failures jsonb, served text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.bot_check(server_secret);
 if jsonb_typeof(failures) <> 'array' or jsonb_array_length(failures) = 0 then return; end if;
 insert into private.ai_route_events(task, failed_provider, failed_kind, served_provider)
 select task_id, f->>'provider', f->>'kind', served from jsonb_array_elements(failures) with ordinality x(f, n) where n <= 8;
 delete from private.ai_route_events where created_at < now() - interval '7 days';
end $$;
revoke all on function public.ai_report_fallbacks(text, text, jsonb, text) from public;
grant execute on function public.ai_report_fallbacks(text, text, jsonb, text) to anon, authenticated;

-- Only the general administrator reads the summary: per company and failure type, last 24 hours.
create function public.ai_recent_failures() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('provider', g.failed_provider, 'kind', g.failed_kind, 'count', g.n, 'last_at', g.last_at,
   'served', g.served, 'tasks', g.tasks) order by g.last_at desc)
  from (select e.failed_provider, e.failed_kind, count(*) n, max(e.created_at) last_at,
     (array_agg(e.served_provider order by e.created_at desc))[1] served, jsonb_agg(distinct e.task) tasks
   from private.ai_route_events e where e.created_at > now() - interval '24 hours' group by e.failed_provider, e.failed_kind) g), '[]'::jsonb);
end $$;
revoke all on function public.ai_recent_failures() from public, anon;
grant execute on function public.ai_recent_failures() to authenticated;
