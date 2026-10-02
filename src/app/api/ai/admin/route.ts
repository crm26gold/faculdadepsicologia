import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { aiAdminAction, type AiProviderId } from '@/lib/ai/catalog';
import { aiSecretReady, keyHint, openKey, sealKey } from '@/lib/ai/crypto';
import { AiError, generate, listModels, resolveModel, type AiConfig } from '@/lib/ai/providers';
import { autoCapable, autoModes, pickModel, sortModels, type AutoMode } from '@/lib/ai/models';
import type { userSession } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;

// Only the owner passes: every function used here checks private.is_owner() in the database.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('ai_admin_state');
  if (error) return dbError(error);
  return reply({ ok: true, data: { ...data, secretReady: aiSecretReady() } });
}

async function providerConfig(session: Session, provider: AiProviderId, model = ''): Promise<AiConfig | Response> {
  const { data, error } = await session.client.rpc('ai_provider_runtime', { provider_id: provider });
  if (error) return dbError(error);
  if (!data) return reply({ error: 'Cadastre e salve a chave deste provedor antes.' }, 409);
  try { return { provider, model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) }; }
  catch (cause) { return reply({ error: cause instanceof Error ? cause.message : 'Não foi possível abrir a chave guardada.' }, 503); }
}

export async function POST(request: Request) {
  const input = await writeRequest(request, aiAdminAction, 20_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
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
      const { error } = await session.client.rpc('ai_save_task', { task_id: body.task, next_provider: body.provider, next_model: body.model, next_enabled: body.enabled });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'test':
    case 'models': {
      const config = await providerConfig(session, body.provider, body.action === 'test' ? body.model : '');
      if (config instanceof Response) return config;
      const started = Date.now();
      try {
        if (body.action === 'models') {
          const ids = await listModels(config);
          const auto = autoCapable.includes(config.provider) ? Object.fromEntries((Object.keys(autoModes) as AutoMode[]).map(mode => [mode, pickModel(config.provider, ids, mode)])) : {};
          return reply({ ok: true, data: { ids: sortModels(config.provider, ids), auto } });
        }
        const resolved = await resolveModel(config);
        const text = await generate(resolved, { system: 'Você está testando a conexão do aplicativo Jornada Plena. Responda em português do Brasil, em no máximo oito palavras.', prompt: 'Confirme que a conexão funcionou.', maxTokens: 60 });
        return reply({ ok: true, data: { text: text.slice(0, 300), ms: Date.now() - started, model: resolved.model } });
      } catch (cause) {
        return reply({ error: cause instanceof AiError ? cause.message : 'Falha inesperada ao falar com o provedor.' }, 502);
      }
    }
  }
}
