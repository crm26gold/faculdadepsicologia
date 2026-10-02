import 'server-only';

// Thin Telegram Bot API client: only what the bot uses.
export class TelegramError extends Error {}
const TIMEOUT = 15_000;

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store',
    });
  } catch { throw new TelegramError('O Telegram não respondeu agora.'); }
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !json?.ok) throw new TelegramError(`Telegram recusou (${response.status}): ${String(json?.description ?? '').slice(0, 200)}`);
  return json.result as T;
}

export const getMe = (token: string) => call<{ id: number; username: string; first_name: string }>(token, 'getMe');
export const setWebhook = (token: string, url: string, secret: string) =>
  call<boolean>(token, 'setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true, max_connections: 10 });
export const deleteWebhook = (token: string) => call<boolean>(token, 'deleteWebhook', { drop_pending_updates: true });
export const sendMessage = (token: string, chatId: string, text: string) =>
  call<unknown>(token, 'sendMessage', { chat_id: chatId, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } });
export const sendTyping = (token: string, chatId: string) => call<unknown>(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => null);

/** Downloads a voice note (limited in size) and returns it as base64 for the AI to transcribe. */
export async function downloadFile(token: string, fileId: string, maxBytes = 4_000_000) {
  const file = await call<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId });
  if (!file.file_path || (file.file_size ?? 0) > maxBytes) throw new TelegramError('Áudio grande demais. Mande mensagens de voz de até uns 3 minutos.');
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
  if (!response.ok) throw new TelegramError('Não consegui baixar o áudio do Telegram.');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) throw new TelegramError('Áudio grande demais.');
  return data.toString('base64');
}

export type TelegramUpdate = {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number }; text?: string; caption?: string;
    voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number }; audio?: { file_id: string; duration: number; mime_type?: string; file_size?: number } };
};
