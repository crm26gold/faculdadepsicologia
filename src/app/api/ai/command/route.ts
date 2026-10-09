import { z } from 'zod';
import { dbError, reply, writeRequest } from '@/lib/api-route';
import { runtimeConfig, runtimeForSession } from '@/lib/ai/runtime';
import { AiError, generateResilient } from '@/lib/ai/providers';
import { commandSystem, commandVersion, parseCommand } from '@/lib/commands';
import { AI_IMAGE_LIMIT, imageMime, type AiImage } from '@/lib/ai/media';
import { NOTE_BUCKET, safeMediaSource } from '@/lib/note-media';
import { beforeAttemptBudget, BudgetLimitError } from '@/lib/ai/budget';
import { imageReview, imageReviewSystem } from '@/lib/ai/image-review';

export const dynamic = 'force-dynamic';
const commandRequest = z.object({ message: z.string().trim().min(1).max(2000), context: z.string().max(20_000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(3000) })).max(16).default([]),
  image: z.object({ src: z.string().refine(value => !!safeMediaSource(value)), noteId: z.uuid() }).optional() });

// The model only proposes actions; the browser validates and applies them with the same rules as the screens.
export async function POST(request: Request) {
  const input = await writeRequest(request, commandRequest, 224_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const { data, error } = await runtimeForSession(session, 'assistente');
  if (error) return dbError(error);
  if (!data) return reply({ ok: true, data: { configured: false } });
  try {
    let image: AiImage | undefined;
    if (body.image) {
      const stored = await session.client.from('personal_workspaces').select('data').eq('owner_id', session.user.id).maybeSingle();
      const note = stored.data?.data?.notes?.find((row: { id: string; content: string }) => row.id === body.image!.noteId);
      if (stored.error || !note?.content.includes(`src="${body.image.src}"`)) return reply({ error: 'Não encontrei essa foto na sua anotação. Aguarde o salvamento antes de pedir a leitura.' }, 409);
      const path = `${session.user.id}/${body.image.src.split('/').at(-1)}`;
      const metadata = await session.client.storage.from(NOTE_BUCKET).info(path);
      if (metadata.error || !metadata.data) return reply({ error: 'Não consegui abrir a foto privada.' }, 404);
      if (!metadata.data.size || metadata.data.size > AI_IMAGE_LIMIT) return reply({ error: 'A foto está guardada, mas a leitura de IA aceita até 4 MB. Envie uma foto menor para ler os detalhes.' }, 413);
      const file = await session.client.storage.from(NOTE_BUCKET).download(path);
      if (file.error || !file.data) return reply({ error: 'Não consegui abrir a foto privada. A anotação continua guardada.' }, 404);
      if (file.data.size > AI_IMAGE_LIMIT) return reply({ error: 'A foto está guardada, mas a leitura de IA aceita até 4 MB. Envie uma foto menor para ler os detalhes.' }, 413);
      const bytes = new Uint8Array(await file.data.arrayBuffer()), mimeType = imageMime(bytes);
      if (!mimeType) return reply({ error: 'Este arquivo não é uma imagem compatível. A anotação foi preservada.' }, 400);
      image = { mimeType, base64: Buffer.from(bytes).toString('base64') };
    }
    const config = runtimeConfig(data);
    const { text: raw, model } = await generateResilient(config, { task: 'assistente', system: image ? imageReviewSystem : `${commandSystem}\n\nContexto da pessoa:\n${body.context}`,
      prompt: body.message, history: image ? [] : body.history, image, maxTokens: 2400, json: true, signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]), beforeAttempt: beforeAttemptBudget(session, 'ai') });
    return reply({ ok: true, data: { configured: true, model, version: commandVersion, ...(image ? imageReview(raw) : parseCommand(raw)) } });
  } catch (cause) {
    if (cause instanceof BudgetLimitError) return cause.response;
    return reply({ error: cause instanceof AiError ? cause.message : 'A inteligência artificial não respondeu agora.' }, 502);
  }
}
