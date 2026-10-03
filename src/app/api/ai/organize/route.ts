import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { openKey } from '@/lib/ai/crypto';
import { AiError, generateResilient } from '@/lib/ai/providers';
import { requestBudget } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';
const organizeRequest = z.object({
  title: z.string().max(160), text: z.string().max(2000),
  options: z.array(z.object({ key: z.string().max(140), label: z.string().max(300) })).min(1).max(300),
});
const system = `Você organiza anotações de uma pessoa em português do Brasil. Receberá uma anotação e a lista de lugares possíveis (cada um com uma chave).
Escolha o lugar mais adequado e devolva SOMENTE um JSON: {"key": "chave escolhida", "reason": "motivo em uma frase curta"}.
Prefira a matéria ou módulo quando o assunto for de estudo; um caderno pessoal quando combinar (diário, ideias, trabalho); uma área da vida quando nada mais servir.
Se não der para saber, use a chave "inbox".`;

// Suggests where a loose note belongs. The "organizar" task is used when set; otherwise the assistant's.
export async function POST(request: Request) {
  const input = await writeRequest(request, organizeRequest, 40_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  let runtime = await session.client.rpc('ai_runtime', { task_id: 'organizar' });
  if (!runtime.error && !runtime.data) runtime = await session.client.rpc('ai_runtime', { task_id: 'assistente' });
  if (runtime.error) return dbError(runtime.error);
  const data = runtime.data;
  if (!data) return reply({ ok: true, data: { configured: false } });
  const limited = await requestBudget(session, 'ai');
  if (limited) return limited;
  try {
    const config = { provider: data.provider, model: data.model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) };
    const prompt = `Anotação:\nTítulo: ${body.title || '(sem título)'}\nTexto: ${body.text || '(vazio)'}\n\nLugares possíveis:\n${body.options.map(option => `- ${option.key}: ${option.label}`).join('\n')}`;
    const { text: raw } = await generateResilient(config, { system, prompt, maxTokens: 200, json: true });
    const match = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    let parsed: { key?: unknown; reason?: unknown } = {};
    try { parsed = JSON.parse(match); } catch {}
    const key = typeof parsed.key === 'string' && body.options.some(option => option.key === parsed.key) ? parsed.key : 'inbox';
    return reply({ ok: true, data: { configured: true, key, reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '' } });
  } catch (cause) {
    return reply({ error: cause instanceof AiError ? cause.message : 'A inteligência artificial não respondeu agora.' }, 502);
  }
}
