-- Atende aos avisos do Supabase de 04/10/2026. Não altera dados.
--
-- RLS nas tabelas internas do schema private. anon e authenticated já não têm
-- permissão sobre elas; o RLS é uma segunda barreira caso alguma permissão seja
-- concedida por engano. As funções que as usam (private.trusted_change e
-- private.delete_my_account) pertencem ao dono das tabelas, que o RLS não afeta.
-- As cópias de segurança são condicionais: a de 01/10 foi criada fora das migrações.
alter table private.trusted_transactions enable row level security;
do $$
declare backup text;
begin
  foreach backup in array array['personal_workspaces_backup_20260930', 'personal_workspaces_backup_20261001'] loop
    if to_regclass('private.' || backup) is not null then
      execute format('alter table private.%I enable row level security', backup);
    end if;
  end loop;
end $$;

-- Índices das chaves estrangeiras apontadas pelo Supabase: buscas por autor,
-- histórico administrativo e exclusão de contas sem varrer as tabelas inteiras.
create index if not exists admin_audit_log_actor_id_idx on public.admin_audit_log (actor_id);
create index if not exists admin_audit_log_target_user_id_idx on public.admin_audit_log (target_user_id);
create index if not exists spaces_created_by_idx on public.spaces (created_by);
create index if not exists space_members_added_by_idx on public.space_members (added_by);
create index if not exists space_invitations_created_by_idx on public.space_invitations (created_by);
create index if not exists assignments_created_by_idx on public.assignments (created_by);
create index if not exists assignment_parts_assignee_id_idx on public.assignment_parts (assignee_id);
create index if not exists assignment_parts_submitted_by_idx on public.assignment_parts (submitted_by);
create index if not exists assignment_parts_updated_by_idx on public.assignment_parts (updated_by);
create index if not exists part_comments_author_id_idx on public.part_comments (author_id);
create index if not exists space_posts_author_id_idx on public.space_posts (author_id);
create index if not exists polls_author_id_idx on public.polls (author_id);
create index if not exists poll_votes_user_id_idx on public.poll_votes (user_id);
create index if not exists ai_tasks_connection_id_idx on public.ai_tasks (connection_id);
create index if not exists ai_tasks_provider_idx on public.ai_tasks (provider);
