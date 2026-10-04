import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { aiAdminAction, type AiProviderId } from '@/lib/ai/catalog';
import { aiSecretReady, keyHint, openKey, sealKey } from '@/lib/ai/crypto';
import { AiError, generate, refreshModels, resolveModel, type AiConfig } from '@/lib/ai/providers';
import { autoCapable, autoModes, pickModel, sortModels, type AutoMode } from '@/lib/ai/models';
import type { userSession } from '@/lib/supabase/server';
import { requestBudget, retryBudget } from '@/lib/ai/budget';
import { runtimeConfig } from '@/lib/ai/runtime';
import { prepareGeminiSession, LiveSessionError } from '@/lib/voice/gemini-session';
import { checkGeminiSession } from '@/lib/voice/check-session';

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
  if (connectionId && data.provider !== provider) return reply({ error: 'A reserva não pertence ao provedor escolhido.' }, 400);
  try { return { provider, model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) }; }
  catch (cause) { return reply({ error: cause instanceof Error ? cause.message : 'Não foi possível abrir a chave guardada.' }, 503); }
}

export async function POST(request: Request) {
  const input = await writeRequest(request, aiAdminAction, 20_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
    case 'save_connection': {
      const key = body.key?.trim();
      if (!body.id && !key) return reply({ error: 'Informe a chave para criar uma reserva.' }, 400);
      if (key && !aiSecretReady()) return reply({ error: 'O cofre de chaves não está configurado.' }, 503);
      const result = await session.client.rpc('ai_save_connection', { connection_id: body.id, provider_id: body.provider,
        next_label: body.label, next_enabled: body.enabled, next_position: body.position,
        next_ciphertext: key ? sealKey(key) : null, next_hint: key ? keyHint(key) : null });
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'remove_connection': {
      const result = await session.client.rpc('ai_remove_connection', { connection_id: body.id });
      return result.error ? dbError(result.error) : reply({ ok: true, data: null });
    }
    case 'test_live': {
      // ai_runtime checks the owner in the database, including for a crafted HTTP request.
      const selected = await session.client.rpc('ai_runtime', { task_id: 'voz' });
      if (selected.error) return dbError(selected.error);
      if (!selected.data) return reply({ error: 'Configure e ligue a tarefa Chamada ao vivo antes de testar.' }, 409);
      if (selected.data.provider !== 'gemini') return reply({ error: 'Este diagnóstico testa Gemini. Para OpenAI, inicie uma chamada no Assistente.' }, 409);
      const limited = await requestBudget(session, 'live'); if (limited) return limited;
      const reference = crypto.randomUUID().slice(0, 8);
      const started = Date.now();
      try {
        const credentials = await prepareGeminiSession(runtimeConfig(selected.data), 'Teste de conexão da Jornada, sem dados pessoais.', [], {
          signal: AbortSignal.timeout(35_000), beforeRetry: retryBudget(session, 'live'),
        });
        const result = await checkGeminiSession(credentials, AbortSignal.timeout(16_000));
        console.info('[voice-check]', { reference, stage: result.stage, connected: result.connected, diagnostic: result.diagnostic });
        return reply({ ok: true, data: { ...result, reference, model: credentials.model, ms: Date.now() - started,
          message: result.connected ? 'O Gemini aceitou a autorização e a configuração. Agora teste o microfone no Assistente.' : 'A autorização foi criada, mas a conexão Live não foi aceita. O diagnóstico identifica a etapa.' } });
      } catch (cause) {
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
        if (key && !aiSecretReady()) return reply({ error: 'O servidor ainda não tem o segredo que protege as chaves (AI_KEYS_SECRET).' }, 503);
        ciphertext = key ? sealKey(key) : '';
        hint = key ? keyHint(key) : '';
      }
      const { error } = await session.client.rpc('ai_save_provider', { provider_id: body.provider, next_enabled: body.enabled, next_label: body.label,
        next_base_url: body.base_url, next_project: body.gcp_project, next_location: body.gcp_location, next_ciphertext: ciphertext, next_hint: hint });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'save_task': {
      if (body.task === 'voz' && body.provider && (body.provider === 'openai' ? body.model !== 'gpt-live-1' : body.provider !== 'gemini' || (body.model !== 'auto:rapido' && !/^gemini-[a-z0-9.-]*live[a-z0-9.-]*$/.test(body.model)))) {
        return reply({ error: 'Chamada ao vivo: escolha Gemini com modelo Live ou OpenAI com gpt-live-1.' }, 400);
      }
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
