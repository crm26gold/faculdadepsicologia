import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { MAX_CALL_SECONDS } from '@/lib/voice/protocol';
import { requestBudget, retryBudget } from '@/lib/ai/budget';
import { runtimeConfig } from '@/lib/ai/runtime';
import { AiError } from '@/lib/ai/providers';
import { prepareGeminiSession, LiveSessionError } from '@/lib/voice/gemini-session';
import { ElevenLabsError, prepareElevenLabsSession } from '@/lib/voice/elevenlabs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const requestSchema = z.object({ context: z.string().max(6000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(12).default([]) });

export async function POST(request: Request) {
  const input = await writeRequest(request, requestSchema, 128_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const now = Date.now();
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'voz' });
  if (error) return dbError(error);
  if (!data || !['gemini', 'openai', 'elevenlabs'].includes(data.provider)) return reply({ error: 'Configure a tarefa “Chamada ao vivo” com Gemini, OpenAI ou ElevenLabs em Administração › Inteligência artificial.' }, 409);
  if (data.provider === 'openai') return data.model !== 'gpt-live-1' ? reply({ error: 'Escolha gpt-live-1 na tarefa Chamada ao vivo e salve antes de iniciar.' }, 409) : reply({ ok: true, data: { provider: 'openai', token: '', model: 'gpt-live-1', expiresAt: new Date(now + MAX_CALL_SECONDS * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS } });
  const limited = await requestBudget(session, 'live');
  if (limited) return limited;
  const reference = crypto.randomUUID().slice(0, 8);
  if (data.provider === 'elevenlabs') {
    try {
      const credentials = await prepareElevenLabsSession(runtimeConfig(data), body.context, body.history, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]), beforeRetry: retryBudget(session, 'live'),
      });
      console.info('[voice-live]', { reference, provider: 'elevenlabs', stage: 'signed_url', outcome: 'ready', model: credentials.model });
      return reply({ ok: true, data: { provider: 'elevenlabs', ...credentials } });
    } catch (error) {
      const failure = error instanceof ElevenLabsError ? error : null;
      console.warn('[voice-live]', { reference, provider: 'elevenlabs', stage: failure?.stage ?? 'preparation', outcome: 'failed', ...failure?.diagnostic });
      const message = error instanceof AiError ? error.message : 'Não foi possível preparar a chamada. Confira o cofre e a configuração da IA.';
      const status = error instanceof AiError ? error.status : undefined;
      return reply({ error: `${message} Código da chamada: ${reference}${status ? ` · ElevenLabs ${status}` : ''}.`, reference }, status === 429 ? 429 : 502);
    }
  }
  try {
    const credentials = await prepareGeminiSession(runtimeConfig(data), body.context, body.history, {
      signal: AbortSignal.timeout(45_000), beforeRetry: retryBudget(session, 'live'),
    });
    console.info('[voice-live]', { reference, stage: 'token', outcome: 'ready', model: credentials.model });
    return reply({ ok: true, data: { provider: 'gemini', ...credentials } });
  } catch (error) {
    const diagnostic = error instanceof LiveSessionError ? error.diagnostic : undefined;
    console.warn('[voice-live]', { reference, stage: error instanceof LiveSessionError ? error.stage : 'preparation', outcome: 'failed', ...diagnostic });
    const message = error instanceof AiError ? error.message : 'Não foi possível preparar a chamada. Confira o cofre e a configuração da IA.';
    const status = error instanceof AiError ? error.status : undefined;
    return reply({ error: `${message} Código da chamada: ${reference}${status ? ` · Gemini ${status}` : ''}.`, reference }, status === 429 ? 429 : 502);
  }
}
