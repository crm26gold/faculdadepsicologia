import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { openKey } from '@/lib/ai/crypto';
import { AiError, generateResilient } from '@/lib/ai/providers';
import { commandSystem, parseCommand } from '@/lib/commands';

export const dynamic = 'force-dynamic';
const commandRequest = z.object({ message: z.string().trim().min(1).max(2000), context: z.string().max(20_000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(3000) })).max(16).default([]) });

// The model only proposes actions; the browser validates and applies them with the same rules as the screens.
export async function POST(request: Request) {
  const input = await writeRequest(request, commandRequest, 224_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'assistente' });
  if (error) return dbError(error);
  if (!data) return reply({ ok: true, data: { configured: false } });
  try {
    const config = { provider: data.provider, model: data.model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) };
    const { text: raw, model } = await generateResilient(config, { system: `${commandSystem}\n\nContexto da pessoa:\n${body.context}`, prompt: body.message, history: body.history, maxTokens: 2400, json: true });
    return reply({ ok: true, data: { configured: true, model, ...parseCommand(raw) } });
  } catch (cause) {
    return reply({ error: cause instanceof AiError ? cause.message : 'A inteligência artificial não respondeu agora.' }, 502);
  }
}
