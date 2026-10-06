import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { reply } from '@/lib/api-route';
import { demoRequested } from '@/lib/config';
import { sealKey } from '@/lib/ai/crypto';
import { bridgeInput, freshMessage, validatedMedia } from '@/lib/whatsapp/protocol';
import { whatsappRpc } from '@/lib/whatsapp/server';
import { runWhatsAppJob } from '@/lib/whatsapp/run-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(request: Request) {
  if (demoRequested(process.env)) return reply({ error: 'Indisponível.' }, 404);
  const token = request.headers.get('authorization')?.match(/^Bearer (jpwa_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return reply({ error: 'Ponte não autorizada.' }, 401);
  try {
    const auth = await whatsappRpc(token, 'verify');
    // Only a refusal is final. A database outage is transient, so the bridge may try again.
    if (auth.error) return auth.error.code === '42501' ? reply({ error: 'Ponte pausada, revogada ou não autorizada.' }, 401) : reply({ error: 'Não foi possível concluir agora.' }, 503);
    if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Formato inválido.' }, 415);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Pedido vazio.' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2_800_000) { await reader.cancel(); return reply({ error: 'Envie um arquivo de até 2 MB.' }, 413); }
      chunks.push(chunk.value);
    }
    const parsed = bridgeInput.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) return reply({ error: 'Pedido inválido.' }, 400);
    const input = parsed.data;
    let operation: string = input.action;
    let payload: Record<string, unknown> = { ...input };
    if (input.action === 'message') {
      if (!freshMessage(input.timestamp)) return reply({ error: 'Mensagem expirada.' }, 400);
      validatedMedia(input.media);
      if (!input.text && !input.media) return reply({ error: 'Envie texto ou áudio.' }, 400);
      const raw = JSON.stringify(input);
      operation = 'enqueue'; payload = { peer: input.peer, message_id: input.message_id, input_ciphertext: sealKey(raw), input_hash: createHash('sha256').update(raw).digest('hex'),
        media_units: input.media ? Buffer.from(input.media.base64, 'base64').length : 0 };
    } else if (input.action === 'link') payload = { peer: input.peer, code_hash: createHash('sha256').update(input.code).digest('hex') };
    const result = await whatsappRpc(token, operation, payload);
    if (result.error) return reply({ error: result.error.code === '42501' ? 'Telefone não vinculado ou conexão revogada.' : result.error.code === 'PT429' ? 'O limite de arquivos da Jornada foi atingido. Aguarde antes de tentar novamente.' : 'Não foi possível concluir agora.', code: result.error.code }, result.error.code === '42501' ? 403 : result.error.code === 'PT429' ? 429 : result.error.code === 'PT409' ? 409 : 503);
    if (input.action === 'message') after(() => runWhatsAppJob(token, input.peer, result.data.id));
    if (input.action === 'result' && ['queued', 'working'].includes(result.data?.status)) after(() => runWhatsAppJob(token, input.peer, input.id));
    const data = input.action === 'result' ? { ...result.data, result: result.data?.result ? { reply: result.data.result.reply, speak: result.data.result.speak === true } : null } : result.data;
    return reply({ ok: true, data });
  } catch {
    return reply({ error: 'Não foi possível validar este pedido. Nenhuma nova alteração foi confirmada.' }, 400);
  }
}
