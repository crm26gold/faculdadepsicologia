-- O que os assistentes conectados fizeram (MCP, etapa E5). A pessoa lê os próprios recibos com alterações, de
-- todas as suas conexões (inclusive revogadas), enquanto o recibo existe (90 dias). Só leitura: desfazer pela
-- tela grava o espaço pelo caminho normal, com o mesmo cuidado do "desfaz isso" (só o que ninguém mudou depois).
-- Sem alvo, devolve só os rótulos (lista leve); com alvo, devolve também o que é preciso para desfazer aquele pedido.
create function public.mcp_activity(target uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('request_id',x.request_id,'created_at',x.created_at,'connection',x.label,
   'labels',x.labels,'undone',x.undone)||case when target is null then '{}'::jsonb else jsonb_build_object('applied',x.applied) end
   order by x.created_at desc),'[]'::jsonb)
 from (select r.request_id,r.created_at,t.label,r.outcome->'applied' applied,
   (select jsonb_agg(a->'label') from jsonb_array_elements(r.outcome->'applied') a) labels,
   exists(select 1 from private.mcp_receipts u where u.token_id=r.token_id and u.outcome->>'undid'=r.request_id::text) undone
  from private.mcp_receipts r join private.mcp_tokens t on t.id=r.token_id
  where t.user_id=(select auth.uid()) and r.expires_at>now()
    and jsonb_typeof(r.outcome->'applied')='array' and jsonb_array_length(r.outcome->'applied')>0
    and (target is null or r.request_id=target)
  order by r.created_at desc limit 30) x
$$;
revoke all on function public.mcp_activity(uuid) from public,anon;
grant execute on function public.mcp_activity(uuid) to authenticated;
