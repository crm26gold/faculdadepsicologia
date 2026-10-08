import { dbError, reply, writeRequest } from '@/lib/api-route';
import { assistantRequest } from '@/lib/ai/catalog';
import { runtimeConfig, runtimeForSession } from '@/lib/ai/runtime';
import { AiError, generateResilient } from '@/lib/ai/providers';
import { beforeAttemptBudget, BudgetLimitError } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';

const system = `Você é o assistente da Jornada Plena, um organizador da vida inteira: estudos, trabalho, rotina, saúde, finanças, relações e projetos.
A mensagem da pessoa já foi guardada em "Para organizar". Responda em português do Brasil, com calor e no máximo três frases curtas:
confirme o que entendeu e sugira onde organizar (área da vida, curso ou matéria, data e horário, se houver).
Não invente fatos nem diga que executou ações: você só sugere, e a pessoa decide.`;

// The task's provider and model come from the owner's panel; the key is opened only here, on the server.
export async function POST(request: Request) {
  const input = await writeRequest(request, assistantRequest, 8_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const { data, error } = await runtimeForSession(session, 'assistente');
  if (error) return dbError(error);
  if (!data) return reply({ ok: true, data: { configured: false } });
  try {
    const config = runtimeConfig(data);
    const { text } = await generateResilient(config,
      { task: 'assistente', system, prompt: body.message, maxTokens: 400, signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]), beforeAttempt: beforeAttemptBudget(session, 'ai') });
    return reply({ ok: true, data: { configured: true, reply: text.slice(0, 1200) } });
  } catch (cause) {
    if (cause instanceof BudgetLimitError) return cause.response;
    return reply({ error: cause instanceof AiError ? cause.message : 'A inteligência artificial não respondeu agora. Sua mensagem ficou guardada.' }, 502);
  }
}
