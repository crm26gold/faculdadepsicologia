import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { openKey } from '@/lib/ai/crypto';
import { chooseLiveModel, liveSetup, MAX_CALL_SECONDS } from '@/lib/voice/protocol';

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
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'assistente' });
  if (error) return dbError(error);
  if (!data || data.provider !== 'gemini') return reply({ error: 'Para a chamada ao vivo, ative o Gemini na tarefa “Conversa do assistente” em Administração › Inteligência artificial. O chat escrito continua disponível.' }, 409);
  try {
    const key = openKey(data.key_ciphertext);
    const modelsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!modelsResponse.ok) return reply({ error: 'Não consegui verificar os modelos de voz. Confira a chave e a disponibilidade do Gemini.' }, 502);
    const models = await modelsResponse.json();
    const model = chooseLiveModel(models.models ?? [], process.env.GEMINI_LIVE_MODEL);
    if (!model) return reply({ error: 'Esta chave ainda não tem um modelo de voz ao vivo disponível. Confira o acesso à Live API no Google AI Studio.' }, 409);
    const expiresAt = new Date(now + (MAX_CALL_SECONDS + 120) * 1000).toISOString();
    // Lock the model, instructions and tools on the server. Only the resumption handle may vary.
    // The long-lived provider key never reaches the browser or application logs.
    const tokenResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ uses: 1, expireTime: expiresAt, newSessionExpireTime: new Date(now + 120_000).toISOString(),
        bidiGenerateContentSetup: liveSetup(model, body.context, body.history),
        fieldMask: 'model,generationConfig,systemInstruction,tools,realtimeInputConfig,inputAudioTranscription,outputAudioTranscription,contextWindowCompression',
      }),
    });
    if (!tokenResponse.ok) return reply({ error: tokenResponse.status === 429 ? 'O limite de voz do Gemini foi atingido. Aguarde ou confira a cota no Google AI Studio.' : 'O Gemini não autorizou a chamada. Confira o acesso à Live API e o faturamento da chave configurada.' }, tokenResponse.status === 429 ? 429 : 502);
    const token = await tokenResponse.json();
    if (typeof token.name !== 'string' || !token.name) throw new Error('Invalid token');
    return reply({ ok: true, data: { token: token.name, model, expiresAt, maxSeconds: MAX_CALL_SECONDS } });
  } catch {
    return reply({ error: 'Não foi possível preparar a chamada. Confira a configuração da IA e tente novamente.' }, 502);
  }
}
