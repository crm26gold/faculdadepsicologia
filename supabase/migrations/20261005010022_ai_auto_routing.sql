-- Modo automático: a tarefa tenta a conexão escolhida e, se falhar, as demais chaves ligadas
-- de empresas compatíveis, numa ordem recomendada. Não altera chaves nem decifra segredos.
alter table public.ai_tasks drop constraint ai_tasks_routing_mode_check;
alter table public.ai_tasks add constraint ai_tasks_routing_mode_check check(routing_mode in('legacy','fixed','fallback','auto'));

-- Modelo usado por uma empresa no modo automático; null quando ela não serve à tarefa.
-- Texto só usa empresas que escolhem o modelo sozinhas (lista atual da chave).
create or replace function private.ai_auto_model(task_id text,provider_id text,task_model text) returns text
language sql immutable set search_path='' as $$
 select case
   when task_id='voz' then case provider_id when 'elevenlabs' then 'auto:rapido' when 'gemini' then 'auto:rapido' when 'openai' then 'gpt-live-1' end
   when provider_id in('gemini','openai','anthropic','deepseek','xai','mistral') then case when task_model like 'auto:%' then task_model else 'auto:rapido' end
 end;
$$;
create or replace function private.ai_auto_rank(task_id text,provider_id text) returns integer
language sql immutable set search_path='' as $$
 select coalesce(array_position(case when task_id='voz' then array['elevenlabs','gemini','openai'] else array['gemini','openai','anthropic','deepseek','xai','mistral'] end,provider_id),99);
$$;
revoke all on function private.ai_auto_model(text,text,text),private.ai_auto_rank(text,text) from public,anon,authenticated;

create or replace function private.ai_task_config(task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.ai_tasks; primary_config jsonb; candidates jsonb := '[]'; item jsonb; candidate jsonb; auto_model text;
begin
 select * into t from public.ai_tasks where id=task_id and enabled and model<>'';
 if not found then return null; end if;
 primary_config:=private.ai_effective_connection(t.connection_id,t.provider);
 if primary_config is not null then candidates:=jsonb_build_array(primary_config||jsonb_build_object('model',t.model)); end if;
 if t.routing_mode='legacy' and primary_config is not null then
   for item in select to_jsonb(c) from private.ai_connections c where c.provider=t.provider and c.enabled order by c.position limit 2 loop
     candidate:=private.ai_effective_connection((item->>'id')::uuid,t.provider);
     candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',t.model));
   end loop;
 elsif t.routing_mode='fallback' then
   for item in select value from jsonb_array_elements(t.fallbacks) loop
     candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,null);
     if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',item->>'model')); end if;
   end loop;
 elsif t.routing_mode='auto' then
   -- Chave principal antes das reservas; a conexão escolhida não se repete. No máximo seis tentativas.
   for item in
     select jsonb_build_object('provider',x.provider,'connection_id',x.connection_id) from (
       select p.id provider,null::uuid connection_id,0 pos from public.ai_providers p where p.enabled and p.key_ciphertext<>''
       union all select c.provider,c.id,c.position from private.ai_connections c where c.enabled
     ) x
     where private.ai_auto_model(task_id,x.provider,t.model) is not null
       and not (x.connection_id is not distinct from t.connection_id and x.provider=t.provider)
     order by private.ai_auto_rank(task_id,x.provider),x.pos
   loop
     exit when jsonb_array_length(candidates)>=6;
     candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,item->>'provider');
     auto_model:=private.ai_auto_model(task_id,item->>'provider',t.model);
     if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',auto_model)); end if;
   end loop;
 end if;
 if jsonb_array_length(candidates)=0 then return null; end if;
 return (candidates->0)||jsonb_build_object('alternatives',candidates-0,'routing',t.routing_mode);
end;
$$;

create or replace function private.ai_save_route(task_id text,next_provider text,next_connection uuid,next_model text,next_enabled boolean,next_mode text,next_fallbacks jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; company text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_mode not in('fixed','fallback','auto') or next_mode is null or next_fallbacks is null or jsonb_typeof(next_fallbacks)<>'array' or jsonb_array_length(next_fallbacks)>2 or char_length(next_model) not between 1 and 120 then raise exception 'Invalid route' using errcode='22023'; end if;
 if next_connection is not null and not exists(select 1 from private.ai_connections c where c.id=next_connection and c.provider=next_provider) then raise exception 'Connection does not belong to provider' using errcode='22023'; end if;
 if task_id='voz' and not private.ai_live_model_allowed(next_provider,next_model) then raise exception 'Unsupported live route' using errcode='22023'; end if;
 -- ElevenLabs conversa por voz; não gera texto para o assistente nem para a organização.
 if task_id<>'voz' and next_provider='elevenlabs' then raise exception 'Voice-only provider' using errcode='22023'; end if;
 if (select count(distinct value->>'connection_id') from jsonb_array_elements(next_fallbacks))<>jsonb_array_length(next_fallbacks) then raise exception 'Duplicate fallback' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(next_fallbacks) loop
   select c.provider into company from private.ai_connections c where c.id=(item->>'connection_id')::uuid;
   if not found or (item->>'connection_id')::uuid=next_connection or coalesce(char_length(item->>'model'),0) not between 1 and 120 then raise exception 'Invalid fallback' using errcode='22023'; end if;
   -- A live transport may only fail over inside its selected company. Text can switch companies.
   if task_id='voz' and (company<>next_provider or not private.ai_live_model_allowed(company,item->>'model')) then raise exception 'Unsupported live fallback' using errcode='22023'; end if;
   if task_id<>'voz' and company='elevenlabs' then raise exception 'Voice-only fallback' using errcode='22023'; end if;
 end loop;
 update public.ai_tasks set provider=next_provider,connection_id=next_connection,model=next_model,enabled=next_enabled,
 routing_mode=next_mode,fallbacks=case when next_mode='fallback' then next_fallbacks else '[]'::jsonb end,updated_at=now() where id=task_id;
 if not found then raise exception 'Task not found' using errcode='P0002'; end if;
 perform private.audit('ai_route',null,null,jsonb_build_object('task',task_id,'provider',next_provider,'mode',next_mode,'alternatives',jsonb_array_length(next_fallbacks)));
end;
$$;
