import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { openKey } from '@/lib/ai/crypto';
import { chooseLiveModel, liveTokenRequest, MAX_CALL_SECONDS } from '@/lib/voice/protocol';
import { liveProviderFailure } from '@/lib/voice/provider-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const requestSchema = z.object({ context: z.string().max(6000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(12).default([]) });
const starts = new Map<string, number[]>();

export async function POST(request: Request) {
  const input = await writeRequest(request, requestSchema, 128_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const now = Date.now();
  const recent = (starts.get(session.user.id) ?? []).filter(time => now - time < 60_000);
  if (recent.length >= 4) return reply({ error: 'Aguarde um minuto antes de iniciar outra chamada.' }, 429);
  if (starts.size > 1000) starts.clear();
  starts.set(session.user.id, [...recent, now]);
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'voz' });
  if (error) return dbError(error);
  if (!data || !['gemini', 'openai'].includes(data.provider)) return reply({ error: 'Configure a tarefa “Chamada ao vivo” com Gemini ou OpenAI em Administração › Inteligência artificial.' }, 409);
  if (data.provider === 'openai') return data.model !== 'gpt-live-1' ? reply({ error: 'Escolha gpt-live-1 na tarefa Chamada ao vivo e salve antes de iniciar.' }, 409) : reply({ ok: true, data: { provider: 'openai', token: '', model: 'gpt-live-1', expiresAt: new Date(now + MAX_CALL_SECONDS * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS } });
  const reference = crypto.randomUUID().slice(0, 8);
  let stage = 'key';
  const failed = async (response: Response) => {
    const failure = await liveProviderFailure(response);
    console.warn('[voice-live]', { reference, stage, outcome: 'provider_error', ...failure.diagnostic });
    return reply({ error: `${failure.message} Código da chamada: ${reference} · Gemini ${response.status}.`, reference }, failure.status);
  };
  try {
    const key = openKey(data.key_ciphertext);
    stage = 'models';
    console.info('[voice-live]', { reference, stage, outcome: 'started' });
    const modelsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!modelsResponse.ok) return await failed(modelsResponse);
    const models = await modelsResponse.json();
    const model = chooseLiveModel(models.models ?? [], process.env.GEMINI_LIVE_MODEL || (data.model?.startsWith('auto:') ? undefined : data.model));
    if (!model) {
      console.warn('[voice-live]', { reference, stage, outcome: 'no_live_model' });
      return reply({ error: `Esta chave ainda não tem um modelo de voz ao vivo disponível. Confira o acesso à Live API no Google AI Studio. Código da chamada: ${reference}.`, reference }, 409);
    }
    const expiresAt = new Date(now + (MAX_CALL_SECONDS + 120) * 1000).toISOString();
    // Lock the model, instructions and tools on the server. Only the resumption handle may vary.
    // The long-lived provider key never reaches the browser or application logs.
    stage = 'token';
    console.info('[voice-live]', { reference, stage, outcome: 'started', model });
    const createToken = (format: 'discovery' | 'rest') => fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(liveTokenRequest(model, body.context, body.history, now, format)),
    });
    let tokenResponse = await createToken('discovery');
    if (tokenResponse.status === 400) {
      const rejected = await liveProviderFailure(tokenResponse.clone());
      if (rejected.diagnostic.upstreamCode === 'INVALID_ARGUMENT' && !rejected.diagnostic.reason) {
        console.warn('[voice-live]', { reference, stage, outcome: 'constrained_format_retry', format: 'rest', ...rejected.diagnostic });
        tokenResponse = await createToken('rest');
      }
    }
    if (!tokenResponse.ok) return await failed(tokenResponse);
    const token = await tokenResponse.json();
    if (typeof token.name !== 'string' || !token.name) throw new Error('Invalid token');
    console.info('[voice-live]', { reference, stage, outcome: 'ready', model });
    return reply({ ok: true, data: { provider: 'gemini', token: token.name, model, expiresAt, maxSeconds: MAX_CALL_SECONDS } });
  } catch (error) {
    const outcome = stage === 'key' ? 'key_storage_error' : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'request_or_response_error';
    console.warn('[voice-live]', { reference, stage, outcome });
    return reply({ error: `Não foi possível preparar a chamada. Confira a configuração da IA e tente novamente. Código da chamada: ${reference}.`, reference }, 502);
  }
}
