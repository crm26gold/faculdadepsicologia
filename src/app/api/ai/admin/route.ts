import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { aiAdminAction, liveModelAllowed, voiceOnlyProviders, type AiProviderId } from '@/lib/ai/catalog';
import { aiSecretReady, keyHint, openKey, sealKey } from '@/lib/ai/crypto';
import { AiError, generate, generateResilient, refreshModels, resolveModel, type AiConfig } from '@/lib/ai/providers';
import { autoCapable, autoModes, pickModel, sortModels, type AutoMode } from '@/lib/ai/models';
import type { userSession } from '@/lib/supabase/server';
import { requestBudget, beforeAttemptBudget, BudgetLimitError } from '@/lib/ai/budget';
import { runtimeConfig } from '@/lib/ai/runtime';
import { LiveSessionError } from '@/lib/voice/gemini-session';
import { checkGeminiSession } from '@/lib/voice/check-session';
import { checkElevenLabsSession, ElevenLabsError } from '@/lib/voice/elevenlabs';
import { prepareLiveSession } from '@/lib/voice/live-session';
import { checkXaiSession, XaiSessionError } from '@/lib/voice/xai-session';
import { credentialIssue } from '@/lib/ai/credentials';
import { discoverMcp } from '@/lib/integrations/mcp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;

// Only the owner passes: every function used here checks private.is_owner() in the database.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('ai_admin_state');
  if (error) return dbError(error);
  return reply({ ok: true, data: { ...data, secretReady: aiSecretReady() } });
}

async function providerConfig(session: Session, provider: AiProviderId, model = '', connectionId?: string): Promise<AiConfig | Response> {
  const { data, error } = connectionId ? await session.client.rpc('ai_connection_runtime', { connection_id: connectionId }) : await session.client.rpc('ai_provider_runtime', { provider_id: provider });
  if (error) return dbError(error);
  if (!data) return reply({ error: 'Cadastre e salve a chave deste provedor antes.' }, 409);
  if (connectionId && data.provider !== provider) return reply({ error: 'A conexão não pertence à empresa escolhida.' }, 400);
  try { return { provider, model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) }; }
  catch (cause) { return reply({ error: cause instanceof Error ? cause.message : 'Não foi possível abrir a chave guardada.' }, 503); }
}

export async function POST(request: Request) {
  const input = await writeRequest(request, aiAdminAction, 20_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
    case 'test_task': {
      const selected = await session.client.rpc('ai_runtime',{ task_id:body.task });
      if(selected.error) return dbError(selected.error);
      if(!selected.data) return reply({ error:'Salve uma tarefa ligada com pelo menos uma conexão disponível.' },409);
      const started=Date.now();
      try {
        const result=await generateResilient(runtimeConfig(selected.data),{ system:'Teste da rota da Jornada Plena. Responda em português, em no máximo oito palavras.',prompt:'Confirme que a conexão funcionou.',maxTokens:60,signal:AbortSignal.any([request.signal,AbortSignal.timeout(35_000)]),beforeAttempt:beforeAttemptBudget(session,'ai') });
        return reply({ok:true,data:{...result,text:result.text.slice(0,300),ms:Date.now()-started}});
      } catch(cause) {if(cause instanceof BudgetLimitError) return cause.response; return reply({error:cause instanceof AiError ? cause.message : 'Não consegui concluir o teste da rota. Confira as conexões e os limites.'},502);}
    }
    case 'save_connector': {
      const key = body.key?.trim();
      if (key && /\s/.test(key)) return reply({ error: 'Informe apenas o token Bearer, sem espaços.' },400);
      if (key && !aiSecretReady()) return reply({ error: 'Configure o cofre de chaves antes de salvar um token.' },503);
      const result = await session.client.rpc('ai_save_connector',{ connector_id: body.id,next_label:body.label,next_url:body.url,next_protocol:body.protocol,next_enabled:body.enabled,next_ciphertext:body.key === null ? null : key ? sealKey(key) : '',next_hint:body.key === null ? null : key ? keyHint(key) : '' });
      return result.error ? dbError(result.error) : reply({ ok:true,data:null });
    }
    case 'remove_connector': {
      const result = await session.client.rpc('ai_remove_connector',{ connector_id:body.id });
      return result.error ? dbError(result.error) : reply({ ok:true,data:null });
    }
    case 'test_connector': {
      const result = await session.client.rpc('ai_connector_runtime',{ connector_id:body.id });
      if (result.error) return dbError(result.error);
      if (!result.data?.enabled) return reply({ error:'Salve e ligue o conector antes de consultar.' },409);
      const limited = await requestBudget(session,'ai'); if (limited) return limited;
      try {
        const token = result.data.key_ciphertext ? openKey(result.data.key_ciphertext) : '';
        const inventory = await discoverMcp(result.data.url,token,result.data.protocol,AbortSignal.any([request.signal,AbortSignal.timeout(30_000)]));
        return reply({ ok:true,data:{ ...inventory,checkedAt:new Date().toISOString() } });
      } catch (cause) { return reply({ error:cause instanceof Error ? cause.message : 'Não consegui consultar o servidor MCP.' },502); }
    }
    case 'save_connection': {
      const key = body.key?.trim();
      if (!body.id && !key) return reply({ error: 'Informe a chave para criar uma conexão.' }, 400);
      if (key && credentialIssue(body.provider, key)) return reply({ error: credentialIssue(body.provider, key) }, 400);
      if (key && !aiSecretReady()) return reply({ error: 'O cofre de chaves não está configurado.' }, 503);
      const result = await session.client.rpc('ai_save_connection_details', { connection_id: body.id, provider_id: body.provider,
        next_label: body.label, next_enabled: body.enabled, next_position: body.position,
        next_ciphertext: key ? sealKey(key) : null, next_hint: key ? keyHint(key) : null,
        next_base_url: body.base_url ?? '', next_project: body.gcp_project ?? '', next_location: body.gcp_location ?? '' });
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'save_route': {
      const result = await session.client.rpc('ai_save_route', { task_id: body.task, next_provider: body.provider, next_connection: body.connection_id,
        next_model: body.model, next_enabled: body.enabled, next_mode: body.routing_mode, next_fallbacks: body.fallbacks });
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'remove_connection': {
      const result = await session.client.rpc('ai_remove_connection', { connection_id: body.id });
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'remove_provider': {
      const result = await session.client.rpc('ai_remove_provider', { provider_id: body.provider });
      if (['PGRST202', '42883'].includes(result.error?.code ?? '')) return reply({ error: 'A remoção segura de chaves aguarda a atualização do banco. Sua chave foi mantida.' }, 503);
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'test_live': {
      // ai_runtime checks the owner in the database, including for a crafted HTTP request.
      const selected = await session.client.rpc('ai_runtime', { task_id: 'voz' });
      if (selected.error) return dbError(selected.error);
      if (!selected.data) return reply({ error: 'Configure e ligue a tarefa Chamada ao vivo antes de testar.' }, 409);
      if (!['gemini', 'elevenlabs', 'xai'].includes(selected.data.provider)) return reply({ error: 'Este diagnóstico testa Gemini, ElevenLabs e xAI. Para OpenAI, inicie uma chamada no Assistente.' }, 409);
      const reference = crypto.randomUUID().slice(0, 8);
      const started = Date.now();
      if (selected.data.provider === 'xai') {
        try {
          const { credentials } = await prepareLiveSession(runtimeConfig(selected.data), 'Teste de conexão da Jornada, sem dados pessoais.', [], {
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]), beforeAttempt: beforeAttemptBudget(session,'live'),
          });
          if (credentials.provider !== 'xai') return reply({ error: 'A rota selecionou outro provedor. Teste a chamada no Assistente.' },409);
          const result = await checkXaiSession(credentials,AbortSignal.any([request.signal,AbortSignal.timeout(16_000)]));
          return reply({ok:true,data:{...result,reference,model:credentials.model,ms:Date.now()-started,message:result.connected ? 'A xAI aceitou a conexão e a configuração de voz. Agora teste seu microfone no Assistente.' : 'A autorização foi criada, mas a conexão de voz xAI não foi aceita. Confira acesso e créditos da API.'}});
        } catch(cause) {
          if(cause instanceof BudgetLimitError) return cause.response;
          return reply({ok:true,data:{connected:false,reference,stage:cause instanceof XaiSessionError ? cause.stage : 'preparation',diagnostic:cause instanceof XaiSessionError ? cause.diagnostic : undefined,ms:Date.now()-started,message:cause instanceof AiError ? cause.message : 'Não consegui preparar o diagnóstico xAI. Confira o cofre e a configuração de voz.'}});
        }
      }
      if (selected.data.provider === 'elevenlabs') {
        try {
          // Prepares (or updates) the agent, signs one conversation and closes it right after the metadata.
          const { credentials } = await prepareLiveSession(runtimeConfig(selected.data), 'Teste de conexão da Jornada, sem dados pessoais.', [], {
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(40_000)]), beforeAttempt: beforeAttemptBudget(session, 'live'),
          });
          if (credentials.provider !== 'elevenlabs') return reply({ error: 'A rota selecionou outro provedor. Teste a chamada no Assistente.' },409);
          const result = await checkElevenLabsSession({ ...credentials, variables: credentials.variables ?? {} }, AbortSignal.timeout(15_000));
          console.info('[voice-check]', { reference, provider: 'elevenlabs', stage: result.stage, connected: result.connected, code: result.code });
          return reply({ ok: true, data: { ...result, reference, model: credentials.model, ms: Date.now() - started,
            message: result.connected ? 'O ElevenLabs preparou o agente “Jornada Plena · voz” e aceitou a conversa. Agora teste o microfone no Assistente.' : 'O agente foi preparado, mas a conversa não foi aceita. Confira os créditos e o agente no ElevenLabs.' } });
        } catch (cause) {
          if (cause instanceof BudgetLimitError) return cause.response;
          const failure = cause instanceof ElevenLabsError ? cause : null;
          console.warn('[voice-check]', { reference, provider: 'elevenlabs', stage: failure?.stage ?? 'preparation', ...failure?.diagnostic });
          return reply({ ok: true, data: { connected: false, stage: failure?.stage ?? 'preparation', diagnostic: failure ? { upstreamStatus: failure.diagnostic.upstreamStatus, reason: failure.diagnostic.detail, invalidFields: failure.diagnostic.fields } : undefined,
            reference, ms: Date.now() - started, message: cause instanceof AiError ? cause.message : 'Não consegui preparar o teste. Confira o cofre e a tarefa de voz.' } });
        }
      }
      try {
        const { credentials } = await prepareLiveSession(runtimeConfig(selected.data), 'Teste de conexão da Jornada, sem dados pessoais.', [], {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]), beforeAttempt: beforeAttemptBudget(session, 'live'),
        });
        if (credentials.provider !== 'gemini') return reply({ error: 'A rota selecionou outro provedor. Teste a chamada no Assistente.' },409);
        const result = await checkGeminiSession(credentials, AbortSignal.timeout(16_000));
        console.info('[voice-check]', { reference, stage: result.stage, connected: result.connected, diagnostic: result.diagnostic });
        return reply({ ok: true, data: { ...result, reference, model: credentials.model, ms: Date.now() - started,
          message: result.connected ? 'O Gemini aceitou a autorização e a configuração. Agora teste o microfone no Assistente.' : 'A autorização foi criada, mas a conexão Live não foi aceita. O diagnóstico identifica a etapa.' } });
      } catch (cause) {
        if (cause instanceof BudgetLimitError) return cause.response;
        const stage = cause instanceof LiveSessionError ? cause.stage : 'preparation';
        const diagnostic = cause instanceof LiveSessionError ? cause.diagnostic : undefined;
        console.warn('[voice-check]', { reference, stage, diagnostic });
        return reply({ ok: true, data: { connected: false, stage, diagnostic, reference, ms: Date.now() - started,
          message: cause instanceof AiError ? cause.message : 'Não consegui preparar o teste. Confira o cofre e a tarefa de voz.' } });
      }
    }
    case 'save_provider': {
      let ciphertext: string | null = null, hint: string | null = null;
      if (body.key !== null) {
        const key = body.key.trim();
        if (key && credentialIssue(body.provider, key)) return reply({ error: credentialIssue(body.provider, key) }, 400);
        if (key && !aiSecretReady()) return reply({ error: 'O servidor ainda não tem o segredo que protege as chaves (AI_KEYS_SECRET).' }, 503);
        ciphertext = key ? sealKey(key) : '';
        hint = key ? keyHint(key) : '';
      }
      const { error } = await session.client.rpc('ai_save_provider', { provider_id: body.provider, next_enabled: body.enabled, next_label: body.label,
        next_base_url: body.base_url, next_project: body.gcp_project, next_location: body.gcp_location, next_ciphertext: ciphertext, next_hint: hint });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'save_task': {
      if (body.task === 'voz' && body.provider && !liveModelAllowed(body.provider, body.model)) {
        return reply({ error: 'Chamada ao vivo: escolha Gemini com modelo Live, OpenAI com gpt-live-1, xAI com grok-voice-latest ou ElevenLabs com um modelo do agente.' }, 400);
      }
      if (body.task !== 'voz' && body.provider && voiceOnlyProviders.includes(body.provider)) return reply({ error: 'ElevenLabs atende somente a Chamada ao vivo.' }, 400);
      const { error } = await session.client.rpc('ai_save_task', { task_id: body.task, next_provider: body.provider, next_model: body.model, next_enabled: body.enabled });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'test':
    case 'models': {
      const config = await providerConfig(session, body.provider, body.action === 'test' ? body.model : '', body.connection_id);
      if (config instanceof Response) return config;
      const limited = await requestBudget(session, 'ai');
      if (limited) return limited;
      const started = Date.now();
      try {
        if (body.action === 'models') {
          const { ids, liveIds } = await refreshModels(config, AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]));
          const auto = autoCapable.includes(config.provider) ? Object.fromEntries((Object.keys(autoModes) as AutoMode[]).map(mode => [mode, pickModel(config.provider, ids, mode)])) : {};
          return reply({ ok: true, data: { ids: sortModels(config.provider, ids), liveIds, auto, refreshedAt: new Date().toISOString() } });
        }
        if (/live|realtime/.test(config.model)) return reply({ error: 'Modelos de voz devem ser testados em Assistente › Conversar ao vivo, com a tarefa Chamada ao vivo salva.' }, 400);
        const resolved = await resolveModel(config);
        const text = await generate(resolved, { system: 'Você está testando a conexão do aplicativo Jornada Plena. Responda em português do Brasil, em no máximo oito palavras.', prompt: 'Confirme que a conexão funcionou.', maxTokens: 60 });
        return reply({ ok: true, data: { text: text.slice(0, 300), ms: Date.now() - started, model: resolved.model } });
      } catch (cause) {
        return reply({ error: cause instanceof AiError ? cause.message : 'Falha inesperada ao falar com o provedor.' }, 502);
      }
    }
  }
}
