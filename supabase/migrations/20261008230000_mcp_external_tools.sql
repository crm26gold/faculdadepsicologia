-- MCP externo: o proprietário libera ferramentas por conector e as executa pela Administração.
-- O banco confere dono, conector ligado e lista liberada, e registra cada chamada antes do envio.
alter table private.ai_connectors add column allowed_tools text[] not null default '{}'
  check (cardinality(allowed_tools) <= 50 and array_position(allowed_tools, null) is null
    and array_to_string(allowed_tools, ',') ~ '^([a-zA-Z0-9_.:/-]{1,100}(,|$))*$');

create function private.ai_allow_connector_tools(connector_id uuid, tools text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if (select count(distinct t) from unnest(tools) t) <> cardinality(tools) then raise exception 'Repeated tool' using errcode='22023'; end if;
 update private.ai_connectors set allowed_tools=tools,updated_at=now() where id=connector_id;
 if not found then raise exception 'Connector not found' using errcode='P0002'; end if;
 perform private.audit('ai_connector_tools',null,null,jsonb_build_object('connector',connector_id,'tools',to_jsonb(tools)));
end;
$$;
create function public.ai_allow_connector_tools(connector_id uuid, tools text[]) returns void
language sql security invoker set search_path='' as $$ select private.ai_allow_connector_tools(connector_id,tools); $$;

-- Devolve o necessário para a chamada só quando a ferramenta está liberada num conector ligado; nulo nos demais casos.
-- Os argumentos não ficam no histórico: podem conter dados pessoais.
create function private.ai_connector_call(connector_id uuid, tool text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare found_connector private.ai_connectors;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into found_connector from private.ai_connectors c where c.id=connector_id;
 if not found then raise exception 'Connector not found' using errcode='P0002'; end if;
 if not found_connector.enabled or not tool = any(found_connector.allowed_tools) then return null; end if;
 perform private.audit('ai_connector_call',null,null,jsonb_build_object('connector',connector_id,'tool',tool));
 return jsonb_build_object('url',found_connector.url,'protocol',found_connector.protocol,'key_ciphertext',found_connector.key_ciphertext);
end;
$$;
create function public.ai_connector_call(connector_id uuid, tool text) returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_connector_call(connector_id,tool); $$;

revoke all on function private.ai_allow_connector_tools(uuid,text[]),public.ai_allow_connector_tools(uuid,text[]),
 private.ai_connector_call(uuid,text),public.ai_connector_call(uuid,text) from public,anon;
grant execute on function private.ai_allow_connector_tools(uuid,text[]),public.ai_allow_connector_tools(uuid,text[]),
 private.ai_connector_call(uuid,text),public.ai_connector_call(uuid,text) to authenticated;

-- Trocar o endereço troca o servidor: as ferramentas liberadas no anterior deixam de valer.
create or replace function private.ai_save_connector(connector_id uuid,next_label text,next_url text,next_protocol text,next_enabled boolean,next_ciphertext text,next_hint text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if connector_id is null then
   if (select count(*) from private.ai_connectors)>=20 then raise exception 'Connector limit reached' using errcode='22023'; end if;
   insert into private.ai_connectors(label,url,protocol,enabled,key_ciphertext,key_hint) values(next_label,next_url,next_protocol,next_enabled,coalesce(next_ciphertext,''),coalesce(next_hint,'')) returning id into saved;
 else
   update private.ai_connectors set label=next_label,url=next_url,protocol=next_protocol,enabled=next_enabled,key_ciphertext=coalesce(next_ciphertext,key_ciphertext),key_hint=coalesce(next_hint,key_hint),
     allowed_tools=case when url=next_url then allowed_tools else '{}' end,updated_at=now() where id=connector_id returning id into saved;
   if not found then raise exception 'Connector not found' using errcode='P0002'; end if;
 end if;
 perform private.audit('ai_connector',null,null,jsonb_build_object('enabled',next_enabled,'protocol',next_protocol));
 return saved;
end;
$$;

create or replace function private.ai_admin_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 return jsonb_build_object(
 'connectors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'url',c.url,'protocol',c.protocol,'enabled',c.enabled,'has_key',c.key_ciphertext<>'','key_hint',c.key_hint,'updated_at',c.updated_at,'allowed_tools',to_jsonb(c.allowed_tools)) order by c.label) from private.ai_connectors c),'[]'::jsonb),
 'providers',(select jsonb_agg(jsonb_build_object('id',p.id,'enabled',p.enabled,'label',p.label,'base_url',p.base_url,'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,'has_key',p.key_ciphertext<>'','key_hint',p.key_hint,'updated_at',p.updated_at) order by p.id) from public.ai_providers p),
 'tasks',(select jsonb_agg(jsonb_build_object('id',t.id,'provider',t.provider,'model',t.model,'enabled',t.enabled,'updated_at',t.updated_at,'connection_id',t.connection_id,'routing_mode',t.routing_mode,'fallbacks',t.fallbacks) order by t.id) from public.ai_tasks t),
 'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'label',c.label,'enabled',c.enabled,'position',c.position,'key_hint',c.key_hint,'updated_at',c.updated_at,'base_url',c.base_url,'gcp_project',c.gcp_project,'gcp_location',c.gcp_location) order by c.provider,c.position) from private.ai_connections c),'[]'::jsonb));
end;
$$;
