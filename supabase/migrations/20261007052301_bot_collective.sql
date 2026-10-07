-- Telegram e WhatsApp na parte coletiva (lote B3b). A lista fechada de ações sai de mcp_act e vira
-- private.assistant_act, do ator da pessoa. O MCP (pela chave) e os robôs (pela conversa vinculada) chamam
-- a mesma lista, com as mesmas regras de acesso da tela. Os pedidos que exigem confirmação feitos pelos
-- robôs ficam guardados em uma conversa da pessoa, confirmada no aplicativo.

-- A pessoa de uma conversa vinculada; só o id, e só para o ator.
create function private.bot_person(server_secret text,channel_id text,chat text) returns uuid
language plpgsql security definer set search_path='' as $$
declare person uuid;
begin
 perform private.bot_check(server_secret);
 if channel_id is null or channel_id not in('telegram','whatsapp') then raise exception 'Unknown channel' using errcode='22023'; end if;
 select l.user_id into person from public.messenger_links l where l.channel=channel_id and l.chat_id=chat;
 if person is null then raise exception 'Chat not linked' using errcode='42501'; end if;
 return person;
end $$;
revoke all on function private.bot_person(text,text,text) from public,anon,authenticated;
grant execute on function private.bot_person(text,text,text) to jornada_actor;

-- Pedido de confirmação vindo de um robô: aparece em Meu dia e na conversa da pessoa, como os do MCP.
create function public.bot_store_confirmation(server_secret text,channel_id text,chat text,request_id uuid,outcome jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare person uuid; existing uuid; conversation uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); job_key text;
begin
 person:=private.bot_person(server_secret,channel_id,chat);
 if request_id is null or jsonb_typeof(outcome) is distinct from 'object' or outcome->>'saved' is distinct from 'true'
    or jsonb_typeof(outcome->'pending') is distinct from 'array' or jsonb_array_length(outcome->'pending') not between 1 and 8
    or jsonb_typeof(outcome->'applied') is distinct from 'array' or jsonb_typeof(outcome->'failed') is distinct from 'array'
    or char_length(coalesce(outcome->>'reply',''))>3000 or octet_length(outcome::text)>200000 then
  raise exception 'Invalid confirmation' using errcode='22023'; end if;
 job_key:='bot:'||channel_id||':'||request_id;
 select j.id into existing from public.assistant_jobs j where j.user_id=person and j.request_key=job_key;
 if existing is not null then return existing; end if;
 insert into public.assistant_conversations(user_id,id,title,messages)
 values(person,conversation,case channel_id when 'telegram' then 'Confirmação pelo Telegram' else 'Confirmação pelo WhatsApp' end,
  jsonb_build_array(jsonb_build_object('id','job:'||job,'from','assistant','text',outcome->>'reply','saved',true)));
 insert into public.assistant_jobs(user_id,id,conversation_id,request_key,input,status,result)
 values(person,job,conversation,job_key,jsonb_build_object('message','Pedido pelo '||case channel_id when 'telegram' then 'Telegram' else 'WhatsApp' end,
  'today',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'history','[]'::jsonb),'needs_confirmation',outcome);
 return job;
end $$;
revoke all on function public.bot_store_confirmation(text,text,text,uuid,jsonb) from public,authenticated;
grant execute on function public.bot_store_confirmation(text,text,text,uuid,jsonb) to anon;

-- As funções do ator são criadas pelo próprio ator, para rodarem com as permissões dele. "set role" (e não
-- "set local") vale também quando cada comando roda em transação própria, como nos testes locais.
grant create on schema private to jornada_actor;
grant create on schema public to jornada_actor;
set role jornada_actor;
create function private.assistant_act(person uuid,can_write boolean,operation text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if person is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if operation not in('app_home','space_overview','assignment_detail','list_contacts','describe','admin_overview','jornada_budget_status','ai_resource_map') and not can_write then
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
revoke all on function private.assistant_act(uuid,boolean,text,jsonb) from public;

create or replace function public.mcp_act(server_secret text,token text,operation text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens;
begin
 person:=private.mcp_person(server_secret,token);
 return private.assistant_act(person.user_id,person.can_write,operation,args);
end $$;

create function public.bot_act(server_secret text,channel_id text,chat text,operation text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return private.assistant_act(private.bot_person(server_secret,channel_id,chat),true,operation,args);
end $$;
revoke all on function public.bot_act(text,text,text,text,jsonb) from public,authenticated;
grant execute on function public.bot_act(text,text,text,text,jsonb) to anon;
comment on function public.bot_act(text,text,text,text,jsonb) is
 'Bot entry point for the collective layer: resolves the linked chat, then runs one screen function as that person, under RLS.';
reset role;
revoke create on schema public from jornada_actor;
revoke create on schema private from jornada_actor;
