-- Conversations belong to the Jornada account, independently of an AI provider.
create table public.assistant_conversations (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  mode text not null default 'text' check (mode in ('text','voice','mixed')),
  pinned boolean not null default false,
  archived boolean not null default false,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 1000 and octet_length(messages::text) <= 4000000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index assistant_conversations_user_updated_idx on public.assistant_conversations(user_id, updated_at desc, id);
alter table public.assistant_conversations enable row level security;
revoke all on public.assistant_conversations from anon, public;
grant select, insert, update, delete on public.assistant_conversations to authenticated;
create policy conversations_read on public.assistant_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy conversations_create on public.assistant_conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy conversations_update on public.assistant_conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy conversations_delete on public.assistant_conversations for delete to authenticated using ((select auth.uid()) = user_id);

-- Voice can be configured independently from the reasoning/text task.
alter table public.ai_tasks drop constraint ai_tasks_id_check;
alter table public.ai_tasks add constraint ai_tasks_id_check check (id in ('assistente','organizar','voz'));
insert into public.ai_tasks(id, provider, model, enabled)
select 'voz', 'gemini', 'auto:rapido', true from public.ai_providers where id = 'gemini' and enabled and key_ciphertext <> '';
insert into public.ai_tasks(id) values ('voz') on conflict (id) do nothing;

-- Accepted requests and their results outlive a browser call and any model provider.
create table public.assistant_jobs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  request_key text not null check (char_length(request_key) between 1 and 180),
  input jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 224000),
  status text not null default 'queued' check (status in ('queued','working','done','needs_confirmation','failed')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 1500000)),
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, request_key)
);
create index assistant_jobs_conversation_idx on public.assistant_jobs(user_id, conversation_id, created_at desc);
alter table public.assistant_jobs enable row level security;
revoke all on public.assistant_jobs from public, anon;
grant select, insert, update, delete on public.assistant_jobs to authenticated;
create policy jobs_read on public.assistant_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy jobs_create on public.assistant_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy jobs_update on public.assistant_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jobs_delete on public.assistant_jobs for delete to authenticated using ((select auth.uid()) = user_id);

create function public.claim_assistant_job(job_id uuid, run_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare accepted public.assistant_jobs;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.assistant_jobs set status = 'working', lease = run_id, lease_until = now() + interval '90 seconds', updated_at = now()
    where user_id = auth.uid() and id = job_id
      and (status in ('queued','failed') or (status = 'working' and lease_until < now())) returning * into accepted;
  if not found then return null; end if;
  return jsonb_build_object('input', accepted.input, 'conversation_id', accepted.conversation_id);
end;
$$;

-- A committed workspace update and its completion receipt share ONE transaction.
-- If revision/lease verification fails, neither is written. Replaying a finished job is harmless.
create function public.finish_assistant_job(job_id uuid, run_id uuid, next_data jsonb, expected_revision integer, outcome jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare job public.assistant_jobs;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into job from public.assistant_jobs where user_id = auth.uid() and id = job_id for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if job.status in ('done','needs_confirmation') then return job.result; end if;
  if job.status <> 'working' or job.lease is distinct from run_id then raise exception 'Lease changed' using errcode = 'PT409'; end if;
  if jsonb_typeof(outcome) is distinct from 'object' or coalesce(outcome->>'saved','false') <> 'true' then raise exception 'Invalid outcome' using errcode = '22023'; end if;
  if next_data is not null then perform public.save_personal_workspace(next_data, expected_revision); end if;
  update public.assistant_jobs set result = outcome,
    status = case when jsonb_array_length(coalesce(outcome->'pending','[]'::jsonb)) > 0 then 'needs_confirmation' else 'done' end,
    lease = null, lease_until = null, updated_at = now() where user_id = auth.uid() and id = job_id;
  return outcome;
end;
$$;
revoke all on function public.claim_assistant_job(uuid, uuid), public.finish_assistant_job(uuid, uuid, jsonb, integer, jsonb) from public, anon;
grant execute on function public.claim_assistant_job(uuid, uuid), public.finish_assistant_job(uuid, uuid, jsonb, integer, jsonb) to authenticated;

create function public.delete_assistant_conversation(conversation_id uuid, expected_revision bigint) returns void
language plpgsql security invoker set search_path = '' as $$
declare saved_revision bigint;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  select revision into saved_revision from public.assistant_conversations where user_id = auth.uid() and id = conversation_id for update;
  if (saved_revision is null and expected_revision <> 0) or (saved_revision is not null and saved_revision <> expected_revision) then
    raise exception 'Conversation changed' using errcode = 'PT409';
  end if;
  delete from public.assistant_jobs where user_id = auth.uid() and assistant_jobs.conversation_id = delete_assistant_conversation.conversation_id;
  delete from public.assistant_conversations where user_id = auth.uid() and id = conversation_id;
end;
$$;
revoke all on function public.delete_assistant_conversation(uuid, bigint) from public, anon;
grant execute on function public.delete_assistant_conversation(uuid, bigint) to authenticated;

-- Narrow server-to-server attachment authorization: no user ID supplied by the caller.
-- A linked, enabled Telegram and a previously claimed update are both required.
create function public.bot_attachment_owner(server_secret text, chat text, update_ref text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare person uuid;
begin
  perform private.bot_check(server_secret);
  if not exists (select 1 from public.messenger_settings where channel = 'telegram' and enabled) then return null; end if;
  select user_id into person from public.messenger_links where channel = 'telegram' and chat_id = chat;
  if person is null or not exists (select 1 from public.messenger_messages where user_id = person and channel = 'telegram' and update_id = update_ref and role = 'user' and created_at > now() - interval '5 minutes') then return null; end if;
  return person;
end;
$$;
revoke all on function public.bot_attachment_owner(text, text, text) from public;
grant execute on function public.bot_attachment_owner(text, text, text) to anon;
