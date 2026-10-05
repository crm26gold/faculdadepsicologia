-- ElevenLabs como transporte da Chamada ao vivo. Não altera chaves nem tarefas existentes.
-- A chave fica cifrada como as demais. O provedor atende apenas a tarefa voz: o modelo
-- salvo é o LLM do agente no ElevenLabs (ou auto:rapido), não um modelo de texto.
alter table public.ai_providers drop constraint ai_providers_id_check;
alter table public.ai_providers add constraint ai_providers_id_check check(id in
 ('gemini','vertex','google_cloud','openai','anthropic','deepseek','xai','mistral','groq','openrouter','compatible','elevenlabs'));
insert into public.ai_providers(id) values('elevenlabs') on conflict do nothing;

create or replace function private.ai_live_model_allowed(provider_id text,model text) returns boolean
language sql immutable set search_path='' as $$
 select case provider_id
   when 'openai' then model='gpt-live-1'
   when 'gemini' then model='auto:rapido' or model ~ '^gemini-[a-z0-9.-]*live[a-z0-9.-]*$'
   when 'elevenlabs' then model='auto:rapido' or (model ~ '^[a-z0-9][a-z0-9.@_-]{1,79}$' and model<>'custom-llm')
   else false end;
$$;
revoke all on function private.ai_live_model_allowed(text,text) from public,anon,authenticated;

create or replace function private.ai_save_route(task_id text,next_provider text,next_connection uuid,next_model text,next_enabled boolean,next_mode text,next_fallbacks jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; company text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_mode not in('fixed','fallback') or next_mode is null or next_fallbacks is null or jsonb_typeof(next_fallbacks)<>'array' or jsonb_array_length(next_fallbacks)>2 or char_length(next_model) not between 1 and 120 then raise exception 'Invalid route' using errcode='22023'; end if;
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
