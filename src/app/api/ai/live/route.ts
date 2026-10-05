import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { MAX_CALL_SECONDS } from '@/lib/voice/protocol';
import { requestBudget, retryBudget } from '@/lib/ai/budget';
import { runtimeConfig } from '@/lib/ai/runtime';
import { liveProviders } from '@/lib/ai/catalog';
import { AiError } from '@/lib/ai/providers';
import { LiveSessionError } from '@/lib/voice/gemini-session';
import { ElevenLabsError } from '@/lib/voice/elevenlabs';
import { prepareLiveSession } from '@/lib/voice/live-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const requestSchema = z.object({ context: z.string().max(6000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(12).default([]),
  // Automatic routing: providers that already failed in this call attempt in the browser.
  skip: z.array(z.enum(['gemini', 'openai', 'elevenlabs'])).max(3).default([]) });

const companies: Record<string, string> = { gemini: 'Gemini', elevenlabs: 'ElevenLabs', openai: 'OpenAI' };

export async function POST(request: Request) {
  const input = await writeRequest(request, requestSchema, 128_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const now = Date.now();
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'voz' });
  if (error) return dbError(error);
  if (!data || !liveProviders.includes(data.provider)) return reply({ error: 'Configure a tarefa “Chamada ao vivo” com Gemini, OpenAI ou ElevenLabs em Administração › Inteligência artificial.' }, 409);
  if (data.provider === 'openai' && data.routing !== 'auto') return data.model !== 'gpt-live-1' ? reply({ error: 'Escolha gpt-live-1 na tarefa Chamada ao vivo e salve antes de iniciar.' }, 409) : reply({ ok: true, data: { provider: 'openai', token: '', model: 'gpt-live-1', expiresAt: new Date(now + MAX_CALL_SECONDS * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS } });
  const limited = await requestBudget(session, 'live');
  if (limited) return limited;
  const reference = crypto.randomUUID().slice(0, 8);
  try {
    const { credentials, failures } = await prepareLiveSession(runtimeConfig(data), body.context, body.history, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]), beforeRetry: retryBudget(session, 'live'), skip: body.skip,
    });
    if (failures.length) console.warn('[voice-live]', { reference, stage: 'fallback', failed: failures.map(item => item.provider), chosen: credentials.provider });
    console.info('[voice-live]', { reference, provider: credentials.provider, stage: 'token', outcome: 'ready', model: credentials.model });
    return reply({ ok: true, data: credentials });
  } catch (error) {
    const diagnostic = error instanceof LiveSessionError ? { stage: error.stage, ...error.diagnostic } : error instanceof ElevenLabsError ? { stage: error.stage, ...error.diagnostic } : { stage: 'preparation' };
    console.warn('[voice-live]', { reference, outcome: 'failed', ...diagnostic });
    const message = error instanceof AiError ? error.message : 'Não foi possível preparar a chamada. Confira o cofre e a configuração da IA.';
    const status = error instanceof AiError ? error.status : undefined;
    const company = error instanceof ElevenLabsError ? 'ElevenLabs' : error instanceof LiveSessionError ? 'Gemini' : companies[data.provider] ?? 'IA';
    return reply({ error: `${message} Código da chamada: ${reference}${status ? ` · ${company} ${status}` : ''}.`, reference }, status === 429 ? 429 : 502);
  }
}
