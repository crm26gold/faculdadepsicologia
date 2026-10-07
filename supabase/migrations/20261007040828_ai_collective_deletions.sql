-- Exclusões coletivas com confirmação (lote B1b). A porta do assistente ganha "describe": lê, como a
-- própria pessoa e sob RLS, o título e o lugar do item que uma exclusão removeria. O pedido guardado
-- para confirmação mostra essas palavras do banco, e a exclusão roda pela rota da tela, com o login
-- da pessoa, quando ela confirma. A função continua do ator; é ele quem troca o próprio conteúdo.

grant create on schema public to jornada_actor;
set local role jornada_actor;
create or replace function public.mcp_act(server_secret text,token text,operation text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person private.mcp_tokens; result jsonb;
begin
 person:=private.mcp_person(server_secret,token);
 if operation not in('app_home','space_overview','assignment_detail','list_contacts','describe') and not person.can_write then
  raise exception 'Read-only token' using errcode='42501'; end if;
 -- A partir daqui o banco enxerga a pessoa dona da chave, como numa chamada feita pela tela.
 perform set_config('request.jwt.claim.sub',person.user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person.user_id,'role','authenticated')::text,true);
 args:=coalesce(args,'{}'::jsonb);
 case operation
  when 'app_home' then result:=public.app_home();
  when 'space_overview' then result:=public.space_overview((args->>'target')::uuid);
  when 'assignment_detail' then result:=public.assignment_detail((args->>'target')::uuid);
  when 'list_contacts' then result:=public.list_contacts();
  -- What a deletion would remove, read as the person: the confirmation shows the database's words, not the model's.
  when 'describe' then result:=case args->>'kind'
   when 'post' then (select jsonb_build_object('title',p.title,'where',s.name) from public.space_posts p join public.spaces s on s.id=p.space_id where p.id=(args->>'target')::uuid)
   when 'poll' then (select jsonb_build_object('title',p.question,'where',s.name) from public.polls p join public.spaces s on s.id=p.space_id where p.id=(args->>'target')::uuid)
   when 'assignment' then (select jsonb_build_object('title',a.title,'where',s.name) from public.assignments a join public.spaces s on s.id=a.space_id where a.id=(args->>'target')::uuid)
   when 'part' then (select jsonb_build_object('title',pt.title,'where',a.title) from public.assignment_parts pt join public.assignments a on a.id=pt.assignment_id where pt.id=(args->>'target')::uuid)
   when 'contact' then (select jsonb_build_object('title',c.name,'where','Contatos') from public.contacts c where c.id=(args->>'target')::uuid)
   else null end;
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
revoke create on schema public from jornada_actor;
