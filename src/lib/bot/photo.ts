import 'server-only';
import { imageMime, type AiImage } from '../ai/media';
import { captureNote } from '../capture';
import { safeMediaSource } from '../note-media';
import type { Note } from '../workspace';
export async function storeTelegramPhoto(base64: string, serverSecret: string, chat: string, update: number, caption: string): Promise<{ image: AiImage; note: Note }> {
  const bytes = Buffer.from(base64, 'base64'), mimeType = imageMime(bytes);
  if (mimeType !== 'image/jpeg' || bytes.length > 4_000_000) throw new Error('Envie a foto como imagem do Telegram, com até 4 MB.');
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-photo`, { method: 'POST',
    headers: { 'Content-Type': mimeType, 'x-jornada-server-secret': serverSecret, 'x-telegram-chat': chat, 'x-telegram-update': String(update) }, body: bytes, signal: AbortSignal.timeout(30_000) });
  const stored = await response.json().catch(() => null);
  if (!response.ok || !safeMediaSource(stored?.src) || !/^[a-f0-9-]{36}$/.test(stored?.id || '')) throw new Error('Não consegui guardar a foto na Jornada. Reenvie quando a conexão estiver estável.');
  const note = captureNote(`Foto recebida pelo Telegram\n${caption ? `Pedido da pessoa: ${caption}` : 'Comprovante aguardando interpretação; valores ainda não conferidos.'}\nOrigem: foto da pessoa, mensagem Telegram ${update}.`, stored.id, new Date().toISOString());
  note.content += `<p><img src="${stored.src}" alt="Foto enviada pelo Telegram" width="100%"></p>`;
  return { image: { mimeType, base64 }, note };
}
