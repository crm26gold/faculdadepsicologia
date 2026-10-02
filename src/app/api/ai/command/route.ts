import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { openKey } from '@/lib/ai/crypto';
import { AiError, generate, resolveModel } from '@/lib/ai/providers';
import { commandSystem, parseCommand } from '@/lib/commands';

export const dynamic = 'force-dynamic';
const commandRequest = z.object({ message: z.string().trim().min(1).max(2000), context: z.string().max(6000) });

// The model only proposes actions; the browser validates and applies them with the same rules as the screens.
export async function POST(request: Request) {
  const input = await writeRequest(request, commandRequest, 12_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const { data, error } = await session.client.rpc('ai_runtime', { task_id: 'assistente' });
  if (error) return dbError(error);
  if (!data) return reply({ ok: true, data: { configured: false } });
  try {
    const config = await resolveModel({ provider: data.provider, model: data.model, base_url: data.base_url, gcp_project: data.gcp_project, gcp_location: data.gcp_location, key: openKey(data.key_ciphertext) });
    const raw = await generate(config, { system: `${commandSystem}\n\nContexto da pessoa:\n${body.context}`, prompt: body.message, maxTokens: 900, json: true });
    return reply({ ok: true, data: { configured: true, model: config.model, ...parseCommand(raw) } });
  } catch (cause) {
    return reply({ error: cause instanceof AiError ? cause.message : 'A inteligência artificial não respondeu agora.' }, 502);
  }
}
