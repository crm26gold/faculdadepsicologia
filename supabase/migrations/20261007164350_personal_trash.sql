-- Lixeira da vida pessoal (MCP, etapa E2). Todo item que sai do espaço pessoal, pela tela ou por qualquer
-- assistente, fica guardado aqui na mesma transação, por 30 dias e até 2 MB por conta (os mais antigos saem
-- primeiro). Um item que volta ao espaço (restaurar ou desfazer) sai da lixeira sozinho. Só a própria pessoa
-- lê e apaga a sua lixeira. A lixeira fica fora do documento pessoal para não ocupar o limite de 2 MB dele.

create table public.personal_trash (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('tasks','notes','transactions','habits','goals','projects','courses','subjects','classes','notebooks','flashcards','areas')),
  item_id text not null check (char_length(item_id) between 1 and 200),
  item jsonb not null,
  size integer not null check (size > 0),
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index personal_trash_owner_deleted on public.personal_trash(owner_id, deleted_at desc);
create index personal_trash_owner_item on public.personal_trash(owner_id, collection, item_id);
alter table public.personal_trash enable row level security;
create policy "Own trash is readable" on public.personal_trash for select to authenticated using (owner_id = (select auth.uid()));
create policy "Own trash can be emptied" on public.personal_trash for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.personal_trash from anon, authenticated;
grant select, delete on public.personal_trash to authenticated;

create function private.capture_trash() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 foreach kind in array array['tasks','notes','transactions','habits','goals','projects','courses','subjects','classes','notebooks','flashcards','areas'] loop
  -- What left the space goes to the trash; what came back leaves it.
  insert into public.personal_trash(owner_id,collection,item_id,item,size)
  select new.owner_id,kind,o.value->>'id',o.value,octet_length(o.value::text)
  from jsonb_array_elements(case when jsonb_typeof(old.data->kind)='array' then old.data->kind else '[]'::jsonb end) o
  where o.value->>'id' is not null and char_length(o.value->>'id') between 1 and 200
    and o.value->>'id' not in (select n.value->>'id' from jsonb_array_elements(case when jsonb_typeof(new.data->kind)='array' then new.data->kind else '[]'::jsonb end) n where n.value->>'id' is not null);
  delete from public.personal_trash t where t.owner_id=new.owner_id and t.collection=kind and t.item_id in (
   select n.value->>'id' from jsonb_array_elements(case when jsonb_typeof(new.data->kind)='array' then new.data->kind else '[]'::jsonb end) n where n.value->>'id' is not null
   except select o.value->>'id' from jsonb_array_elements(case when jsonb_typeof(old.data->kind)='array' then old.data->kind else '[]'::jsonb end) o where o.value->>'id' is not null);
 end loop;
 delete from public.personal_trash t where t.owner_id=new.owner_id and t.expires_at<=now();
 -- Space: the newest 2 MB stay; older items beyond that leave first.
 delete from public.personal_trash t where t.id in (select s.id from (select x.id,sum(x.size) over (order by x.deleted_at desc,x.id) running
   from public.personal_trash x where x.owner_id=new.owner_id) s where s.running>2000000);
 return new;
end $$;
revoke all on function private.capture_trash() from public,anon,authenticated;
create trigger personal_workspaces_trash after update of data on public.personal_workspaces
 for each row when (old.data is distinct from new.data) execute function private.capture_trash();

-- "Desfaz isso" pelo MCP: o último recibo desta conexão com alterações, das últimas 24 horas. O recibo já traz
-- o estado anterior de cada item; o servidor desfaz só o que ninguém mudou depois.
create function public.mcp_last_outcome(server_secret text,token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens;
begin
 person:=private.mcp_person(server_secret,token);
 return (select jsonb_build_object('request_id',r.request_id,'created_at',r.created_at,'outcome',r.outcome) from private.mcp_receipts r
  where r.token_id=person.id and r.expires_at>now() and r.created_at>now()-interval '24 hours'
    and jsonb_typeof(r.outcome->'applied')='array' and jsonb_array_length(r.outcome->'applied')>0
  order by r.created_at desc limit 1);
end $$;
revoke all on function public.mcp_last_outcome(text,text) from public,authenticated;
grant execute on function public.mcp_last_outcome(text,text) to anon;

-- The assistant's door learns to read the person's trash. The actor replaces its own function.
grant create on schema private to jornada_actor;
set role jornada_actor;
create or replace function private.assistant_act(person uuid,can_write boolean,operation text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if person is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if operation not in('app_home','space_overview','assignment_detail','list_contacts','describe','admin_overview','jornada_budget_status','ai_resource_map','trash_list') and not can_write then
  raise exception 'Read-only token' using errcode='42501'; end if;
 -- A partir daqui o banco enxerga a pessoa, como numa chamada feita pela tela.
 perform set_config('request.jwt.claim.sub',person::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);
 args:=coalesce(args,'{}'::jsonb);
 case operation
  when 'app_home' then result:=public.app_home();
  when 'space_overview' then result:=public.space_overview((args->>'target')::uuid);
  when 'assignment_detail' then result:=public.assignment_detail((args->>'target')::uuid);
  when 'list_contacts' then result:=public.list_contacts();
  -- The person's own trash (RLS), newest first, for "restaura aquilo".
  when 'trash_list' then result:=coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'collection',t.collection,'item_id',t.item_id,'item',t.item,'deleted_at',t.deleted_at,'expires_at',t.expires_at) order by t.deleted_at desc)
   from (select * from public.personal_trash order by deleted_at desc limit 50) t),'[]'::jsonb);
  -- Administration reads; each function itself refuses anyone but the general administrator.
  when 'admin_overview' then result:=public.admin_overview();
  when 'jornada_budget_status' then result:=public.jornada_budget_status();
  when 'ai_resource_map' then result:=public.ai_resource_map();
  -- What a deletion would remove, read as the person: the confirmation shows the database's words, not the model's.
  when 'describe' then result:=public.assistant_describe(args->>'kind',(args->>'target')::uuid);
  when 'create_space' then result:=to_jsonb(public.create_space(args->>'space_kind',args->>'space_name',(args->>'parent')::uuid,
   coalesce(args->>'space_description',''),coalesce(args->>'space_color','sage')));
  when 'update_space' then perform public.update_space((args->>'target')::uuid,args->>'space_name',args->>'space_description',args->>'space_color');
  when 'archive_space' then perform public.archive_space((args->>'target')::uuid,(args->>'archived')::boolean);
  when 'add_member_by_email' then
   if args->>'member_role' is null or args->>'member_role' not in('student','leader') then
    raise exception 'Role changes are screen only' using errcode='PT403'; end if;
   result:=to_jsonb(public.add_member_by_email((args->>'target')::uuid,args->>'member_email',args->>'member_role'));
  when 'create_invitation' then
   if args->>'invite_role' is null or args->>'invite_role' not in('student','leader') then
    raise exception 'Role changes are screen only' using errcode='PT403'; end if;
   result:=to_jsonb(public.create_invitation((args->>'target')::uuid,args->>'invite_role',args->>'hashed_token',
    (args->>'valid_days')::integer,(args->>'uses_limit')::integer));
  when 'revoke_invitation' then perform public.revoke_invitation((args->>'target')::uuid);
  when 'accept_invitation' then result:=to_jsonb(public.accept_invitation(args->>'token'));
  when 'create_post' then result:=to_jsonb(public.create_post((args->>'target')::uuid,args->>'post_kind',args->>'post_title',
   coalesce(args->>'post_body',''),args->>'post_link',(args->>'post_date')::date,coalesce((args->>'post_pinned')::boolean,false)));
  when 'create_poll' then result:=to_jsonb(public.create_poll((args->>'target')::uuid,args->>'poll_question',
   array(select jsonb_array_elements_text(args->'poll_options')),null));
  when 'vote' then perform public.vote((args->>'target')::uuid,(args->>'choice')::integer);
  when 'create_assignments' then result:=to_jsonb(public.create_assignments(array(select jsonb_array_elements_text(args->'targets'))::uuid[],
   args->>'work_title',coalesce(args->>'work_subject',''),coalesce(args->>'work_instructions',''),coalesce(args->>'work_rules',''),
   coalesce(args->'work_style','{}'::jsonb),(args->>'work_due')::date,array(select jsonb_array_elements_text(coalesce(args->'part_titles','[]'::jsonb)))));
  when 'update_assignment' then perform public.update_assignment((args->>'target')::uuid,args->>'work_title',coalesce(args->>'work_subject',''),
   coalesce(args->>'work_instructions',''),coalesce(args->>'work_rules',''),coalesce(args->'work_style','{}'::jsonb),(args->>'work_due')::date,args->>'work_status');
  when 'add_part' then result:=to_jsonb(public.add_part((args->>'target')::uuid,args->>'part_title',(args->>'part_assignee')::uuid,coalesce(args->>'part_label','')));
  when 'update_part_meta' then perform public.update_part_meta((args->>'target')::uuid,args->>'part_title',(args->>'part_assignee')::uuid,
   coalesce(args->>'part_label',''),(args->>'part_position')::integer);
  when 'save_part' then perform public.save_part((args->>'target')::uuid,args->'part_content',args->>'next_status');
  when 'add_comment' then result:=to_jsonb(public.add_comment((args->>'target')::uuid,args->>'comment_kind',args->>'comment_body'));
  when 'resolve_comment' then perform public.resolve_comment((args->>'target')::uuid);
  when 'save_contact' then result:=to_jsonb(public.save_contact((args->>'target')::uuid,args->>'contact_name',coalesce(args->>'contact_email',''),
   coalesce(args->>'contact_phone',''),(args->>'contact_birthdate')::date,coalesce(args->>'contact_notes','')));
  when 'update_my_name' then perform public.update_my_name(args->>'new_name');
  else raise exception 'Operation not available to assistants' using errcode='PT403';
 end case;
 return result;
end $$;
reset role;
revoke create on schema private from jornada_actor;
