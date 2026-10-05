import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { aiMyKeyAction } from '@/lib/ai/catalog';
import { aiSecretReady, keyHint, openKey, sealKey } from '@/lib/ai/crypto';
import { credentialIssue } from '@/lib/ai/credentials';
import { AiError, refreshModels, type AiConfig } from '@/lib/ai/providers';
import { configureBudgetGuard, requestBudget } from '@/lib/ai/budget';
import { botServerSecret } from '@/lib/bot/secrets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const missing = (error: { code?: string } | null) => ['PGRST202', '42883'].includes(error?.code ?? '');
const notReady = () => reply({ error: 'As chaves pessoais ainda não estão disponíveis. A atualização do banco está pendente.' }, 503);

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const result = await session.client.rpc('ai_my_keys');
  if (missing(result.error)) return reply({ ok: true, data: { available: false, keys: [], isOwner: false, baseEnabled: false, secretReady: aiSecretReady() } });
  if (result.error) return dbError(result.error);
  return reply({ ok: true, data: { ...result.data, secretReady: aiSecretReady() } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, aiMyKeyAction, 16_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  // Check migration availability before spending a provider request or accepting a key.
  const state = await session.client.rpc('ai_my_keys');
  if (missing(state.error)) return notReady();
  if (state.error) return dbError(state.error);
  try {
    if (body.action === 'save' || body.action === 'test') {
      if (!aiSecretReady()) return reply({ error: 'O cofre de chaves não está disponível no servidor.' }, 503);
      let config: AiConfig;
      if (body.action === 'save') {
        const issue = credentialIssue(body.provider, body.key);
        if (issue) return reply({ error: issue }, 400);
        config = { provider: body.provider, key: body.key, model: 'auto:rapido', base_url: '', gcp_project: '', gcp_location: '', source: 'personal' };
      } else {
        const params = { server_secret: botServerSecret(), provider_id: body.provider };
        let stored = await session.client.rpc('ai_my_key_runtime', params);
        if (stored.error?.code === '42501') {
          const guard = await configureBudgetGuard(session);
          if (!guard.error) stored = await session.client.rpc('ai_my_key_runtime', params);
        }
        if (stored.error) return dbError(stored.error);
        if (!stored.data) return reply({ error: 'Cadastre sua chave antes de testar.' }, 409);
        const { key_ciphertext, ...metadata } = stored.data;
        config = { ...metadata, key: openKey(key_ciphertext) };
      }
      const limited = await requestBudget(session, 'ai', 1, 'personal');
      if (limited) return limited;
      const models = await refreshModels(config, AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]));
      if (body.action === 'save') {
        const result = await session.client.rpc('ai_my_key_save', { server_secret: botServerSecret(), provider_id: body.provider,
          next_ciphertext: sealKey(body.key), next_hint: keyHint(body.key), next_enabled: body.enabled, next_privacy_basis: body.privacy_basis });
        if (result.error) return dbError(result.error);
      }
      return reply({ ok: true, data: { textModels: models.ids.length, voiceModels: models.liveIds.length,
        message: body.action === 'save' ? 'Chave validada e guardada só para sua conta. A consulta de modelos não garante cota para respostas.' : 'A API aceitou sua chave para consultar modelos. Isso não garante cota para respostas.' } });
    }
    const result = body.action === 'set'
      ? await session.client.rpc('ai_my_key_set', { provider_id: body.provider, next_enabled: body.enabled })
      : body.action === 'remove'
        ? await session.client.rpc('ai_my_key_remove', { provider_id: body.provider })
        : body.action === 'set_base'
          ? await session.client.rpc('ai_set_member_base', { next_enabled: body.enabled })
          : await session.client.rpc('ai_set_member_base_source', { provider_id: body.provider, connection_id: body.connection_id, next_privacy_basis: body.privacy_basis });
    return result.error ? dbError(result.error) : reply({ ok: true, data: null });
  } catch (cause) {
    if (cause instanceof AiError) return reply({ error: cause.message }, cause.status === 429 ? 429 : 502);
    return reply({ error: 'Não consegui validar ou guardar sua chave. Confira o cofre e a configuração do servidor.' }, 503);
  }
}
