import { createHash, timingSafeEqual } from 'node:crypto';
import { openKey } from '@/lib/ai/crypto';
import { AiError, generateResilient, type AiConfig } from '@/lib/ai/providers';
import type { Turn } from '@/lib/ai/turns';
import { botIntent, botReply, helpText, notLinkedText, todayIn } from '@/lib/bot/core';
import { botServerSecret, telegramWebhookSecret } from '@/lib/bot/secrets';
import { downloadFile, sendMessage, sendTyping, TelegramError, type TelegramUpdate } from '@/lib/bot/telegram';
import { applyCommands, commandContext, commandSystem, executionSummary, parseCommand, undoApplied, type Applied } from '@/lib/commands';
import { demoRequested } from '@/lib/config';
import { botDatabase } from '@/lib/supabase/bot';
import { CURRENT_EDITOR_GENERATION, parseWorkspace, type Workspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const CHANNEL = 'telegram';
const ok = () => new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
type Context = { user_id: string; workspace: { data: unknown; revision: number } | null; ai: Record<string, string> | null; history: Turn[]; last_applied: Applied[] | null };

// Telegram calls this for every message to the bot. It always answers 200 (otherwise Telegram retries);
// repeated deliveries are dropped by the update id saved in the database.
export async function POST(request: Request) {
  if (demoRequested(process.env)) return new Response(null, { status: 404 });
  let secret = '';
  try { secret = telegramWebhookSecret(); } catch { return new Response(null, { status: 503 }); }
  const given = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response(null, { status: 401 });
  const db = botDatabase();
  if (!db) return new Response(null, { status: 503 });
  const serverSecret = botServerSecret();
  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  const message = update?.message;
  if (!update || !message || message.chat.type !== 'private') return ok();
  const chat = String(message.chat.id);

  const settings = await db.rpc('bot_settings', { server_secret: serverSecret, channel_id: CHANNEL });
  if (settings.error || !settings.data?.enabled || !settings.data.token_ciphertext) return ok();
  let token: string;
  try { token = openKey(settings.data.token_ciphertext); } catch { return ok(); }
  const say = (text: string) => sendMessage(token, chat, text).catch(() => null);

  const voice = message.voice ?? message.audio;
  const intent = botIntent(message.text ?? message.caption ?? '');
  if (intent.kind === 'link') {
    const code = createHash('sha256').update(intent.code).digest('hex');
    const linked = await db.rpc('bot_link', { server_secret: serverSecret, channel_id: CHANNEL, chat, code });
    await say(linked.data ? `Pronto! Este Telegram está ligado à sua Jornada Plena.\n\n${helpText}` : 'Esse código não vale mais (ele dura 15 minutos e só pode ser usado uma vez). Gere outro no aplicativo, em Meu espaço › Telegram.');
    return ok();
  }

  const loaded = await db.rpc('bot_context', { server_secret: serverSecret, channel_id: CHANNEL, chat });
  const context = loaded.data as Context | null;
  if (loaded.error || !context) { await say(notLinkedText); return ok(); }
  if (intent.kind === 'start' || intent.kind === 'help') { await say(helpText); return ok(); }
  if (intent.kind === 'unlink') {
    await db.rpc('bot_unlink', { server_secret: serverSecret, channel_id: CHANNEL, chat });
    await say('Desconectado. Para ligar de novo, use Meu espaço › Telegram no aplicativo.');
    return ok();
  }
  if (intent.kind === 'text' && !intent.text && !voice) { await say('Por enquanto eu entendo texto e mensagens de voz.'); return ok(); }

  // Claim this update first: a retried delivery of the same message stops here.
  const claimed = await db.rpc('bot_log', { server_secret: serverSecret, channel_id: CHANNEL, chat, update_ref: String(update.update_id),
    message_role: 'user', message_body: intent.kind === 'text' && intent.text ? intent.text : '[mensagem de voz]', message_applied: null });
  if (!claimed.data) return ok();
  void sendTyping(token, chat);

  const today = todayIn();
  const now = Date.now();
  const save = async (data: Workspace, revision: number) => db.rpc('bot_save', { server_secret: serverSecret, channel_id: CHANNEL, chat,
    next_data: parseWorkspace(JSON.stringify({ ...data, editorGeneration: CURRENT_EDITOR_GENERATION })), expected_revision: revision });
  const log = (body: string, applied: Applied[] | null) => db.rpc('bot_log', { server_secret: serverSecret, channel_id: CHANNEL, chat, update_ref: null,
    message_role: 'assistant', message_body: body, message_applied: applied });
  let workspace: Workspace;
  try { workspace = parseWorkspace(JSON.stringify(context.workspace?.data ?? { version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} })); }
  catch { await say('Não consegui abrir o seu espaço agora. Abra o aplicativo uma vez e tente de novo.'); return ok(); }
  const revision = context.workspace?.revision ?? 0;

  if (intent.kind === 'undo') {
    if (!context.last_applied?.length) { await say('Não há nada recente para desfazer.'); return ok(); }
    const saved = await save(undoApplied(workspace, context.last_applied), revision);
    const text = saved.error ? 'Não consegui desfazer agora. Tente de novo.' : `Desfeito:\n${context.last_applied.map(item => `↩️ ${item.label}`).join('\n')}`;
    await log(text, null); await say(text); return ok();
  }

  if (!context.ai) { await say('A inteligência artificial ainda não está ligada. No aplicativo: Administração › Inteligência artificial › "Conversa do assistente".'); return ok(); }
  let config: AiConfig;
  try { config = { provider: context.ai.provider as AiConfig['provider'], model: context.ai.model, base_url: context.ai.base_url, gcp_project: context.ai.gcp_project, gcp_location: context.ai.gcp_location, key: openKey(context.ai.key_ciphertext) }; }
  catch { await say('Não consegui abrir a chave da IA. Salve a chave de novo no painel.'); return ok(); }

  try {
    let said = intent.kind === 'text' ? intent.text : '';
    let heard = '';
    if (voice) {
      if (voice.duration > 240) { await say('Áudio longo demais: mande mensagens de voz de até 4 minutos.'); return ok(); }
      const audio = { mimeType: voice.mime_type || 'audio/ogg', base64: await downloadFile(token, voice.file_id) };
      heard = (await generateResilient(config, { system: 'Transcreva fielmente o áudio, em português do Brasil. Devolva só o texto falado, sem comentários.', prompt: 'Transcreva este áudio.', audio, maxTokens: 800 })).text.trim();
      said = [said, heard].filter(Boolean).join('\n');
      if (!said) { await say('Não consegui entender o áudio. Pode repetir ou escrever?'); return ok(); }
    }
    const raw = (await generateResilient(config, { system: `${commandSystem}\n\nA conversa acontece pelo Telegram.\n\nContexto da pessoa:\n${commandContext(workspace, today)}`,
      prompt: said, history: context.history.slice(-12), maxTokens: 1200, json: true })).text;
    const result = parseCommand(raw);
    let outcome = applyCommands(workspace, result.actions, { today, now });
    if (outcome.applied.length) {
      let saved = await save(outcome.data, revision);
      if (saved.error?.code === 'PT409' || saved.error?.code === '40001') {
        // The app saved something meanwhile: apply the same actions on the fresh copy.
        const fresh = await db.rpc('bot_context', { server_secret: serverSecret, channel_id: CHANNEL, chat });
        const again = parseWorkspace(JSON.stringify((fresh.data as Context).workspace?.data));
        outcome = applyCommands(again, result.actions, { today, now });
        saved = await save(outcome.data, (fresh.data as Context).workspace?.revision ?? 0);
      }
      if (saved.error) { await say('Entendi, mas não consegui salvar agora. Tente de novo em instantes.'); return ok(); }
    }
    const pending = outcome.pending.length ? `Para excluir ou substituir conteúdo, abra o Assistente na Jornada Plena e confirme os itens lá. Pendentes: ${outcome.pending.map(item => item.label).join('; ')}.` : '';
    const actualReply = result.actions.length ? executionSummary({ ...outcome, pending: [] }) : result.reply || 'Não entendi bem. Pode dizer de outro jeito?';
    const text = botReply(`${heard ? `🎙️ “${heard.slice(0, 300)}”\n\n` : ''}${actualReply}${pending ? ` ${pending}` : ''}`, outcome.applied, []);
    await log(text, outcome.applied.length ? outcome.applied : null);
    await say(text);
  } catch (error) {
    const reason = error instanceof AiError || error instanceof TelegramError ? error.message : 'erro inesperado';
    await say(`Não consegui responder agora (${reason}). Tente de novo em instantes.`);
  }
  return ok();
}
