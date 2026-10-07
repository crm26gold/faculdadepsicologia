import { createHash, timingSafeEqual } from 'node:crypto';
import { openKey } from '@/lib/ai/crypto';
import { AiError, generateResilient, type AiConfig } from '@/lib/ai/providers';
import { runtimeConfig, type SealedConfig } from '@/lib/ai/runtime';
import type { Turn } from '@/lib/ai/turns';
import { botIntent, botReply, helpText, notLinkedText, todayIn } from '@/lib/bot/core';
import { botServerSecret, telegramWebhookSecret } from '@/lib/bot/secrets';
import { downloadFile, sendMessage, sendTyping, TelegramError, type TelegramUpdate } from '@/lib/bot/telegram';
import { storeTelegramPhoto } from '@/lib/bot/photo';
import { botHome, botShared, splitShared } from '@/lib/bot/shared';
import type { AiImage } from '@/lib/ai/media';
import { imageReview, imageReviewSystem } from '@/lib/ai/image-review';
import { applyCommands, commandContext, commandSystem, executionSummary, parseCommand, undoApplied, type Applied } from '@/lib/commands';
import { demoRequested } from '@/lib/config';
import { botDatabase } from '@/lib/supabase/bot';
import { CURRENT_EDITOR_GENERATION, parseWorkspace, type Workspace } from '@/lib/workspace';
import { budgetPausedMessage } from '@/lib/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const CHANNEL = 'telegram';
const ok = () => new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
type Context = { user_id: string; workspace: { data: unknown; revision: number } | null; ai: SealedConfig | null; history: Turn[]; last_applied: Applied[] | null };

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
  if (!update || !Number.isSafeInteger(update.update_id) || !message || message.chat.type !== 'private') return ok();
  const chat = String(message.chat.id);

  const settings = await db.rpc('bot_settings', { server_secret: serverSecret, channel_id: CHANNEL });
  if (settings.error || !settings.data?.enabled || !settings.data.token_ciphertext) return ok();
  let token: string;
  try { token = openKey(settings.data.token_ciphertext); } catch { return ok(); }
  const say = (text: string) => sendMessage(token, chat, text).catch(() => null);

  const voice = message.voice ?? message.audio;
  const photo = message.photo?.filter(item => (item.file_size ?? 0) <= 4_000_000).toSorted((a, b) => b.width * b.height - a.width * a.height)[0];
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
  if (intent.kind === 'live') {
    const url = `${(process.env.APP_ORIGIN || 'https://faculdadepsicologia.vercel.app').replace(/\/$/, '')}/#assistant`;
    await sendMessage(token, chat, 'Abra sua Jornada e toque em “Conversar ao vivo”. A chamada usa sua conta da Jornada; o Telegram continua recebendo textos, áudios e fotos.', { text: 'Conversar na Jornada', url }).catch(() => null);
    return ok();
  }
  if (intent.kind === 'start' || intent.kind === 'help') { await say(helpText); return ok(); }
  if (intent.kind === 'unlink') {
    await db.rpc('bot_unlink', { server_secret: serverSecret, channel_id: CHANNEL, chat });
    await say('Desconectado. Para ligar de novo, use Meu espaço › Telegram no aplicativo.');
    return ok();
  }
  if (message.photo?.length && !photo) { await say('Envie uma foto de até 4 MB para guardar e ler os detalhes.'); return ok(); }
  if (intent.kind === 'text' && !intent.text && !voice && !photo) { await say('Envie texto, uma mensagem de voz ou uma foto.'); return ok(); }

  // Claim this update first: a retried delivery of the same message stops here.
  const claimed = await db.rpc('bot_log', { server_secret: serverSecret, channel_id: CHANNEL, chat, update_ref: String(update.update_id),
    message_role: 'user', message_body: intent.kind === 'text' && intent.text ? intent.text : photo ? '[foto enviada]' : '[mensagem de voz]', message_applied: null });
  if (!claimed.data) return ok();
  const reserve = async (scope: 'ai' | 'upload', source?: AiConfig['source']) => {
    const params = { server_secret: serverSecret, channel_id: CHANNEL, chat, budget_scope: scope };
    let { data, error } = source ? await db.rpc('bot_consume_jornada_budget_source', { ...params, budget_units: 1, credential_source: source }) : await db.rpc('bot_consume_jornada_budget', params);
    if (source === 'owner' && ['PGRST202', '42883'].includes(error?.code ?? '')) ({ data, error } = await db.rpc('bot_consume_jornada_budget', params));
    if (!error && data?.allowed === true) return true;
    await say(error ? 'Não consegui verificar o limite de uso agora. Tente novamente mais tarde.'
      : data?.limited_by === 'application' ? budgetPausedMessage : 'Você chegou ao limite temporário de uso. Tente novamente mais tarde.');
    return false;
  };
  const reserveCandidate = async (candidate: AiConfig) => {
    if (!await reserve('ai', candidate.source ?? 'owner')) {
      const cause = new AiError('Controle de uso da Jornada atingido.', 429) as AiError & { doNotRetry: boolean };
      cause.doNotRetry = true;
      throw cause;
    }
  };
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
  let revision = context.workspace?.revision ?? 0;
  let image: AiImage | undefined, photoNoteId = '';
  if (photo) {
    if (!await reserve('upload')) return ok();
    try {
      const attachment = await storeTelegramPhoto(await downloadFile(token, photo.file_id), serverSecret, chat, update.update_id, (message.caption || '').slice(0, 2000));
      const append = (previous: Workspace) => ({ ...previous, notes: previous.notes.some(note => note.id === attachment.note.id) ? previous.notes : [attachment.note, ...previous.notes] });
      let next = append(workspace), saved = await save(next, revision);
      if (saved.error?.code === 'PT409' || saved.error?.code === '40001') {
        const fresh = await db.rpc('bot_context', { server_secret: serverSecret, channel_id: CHANNEL, chat });
        if (fresh.error || !fresh.data?.workspace) throw new Error('Seu espaço mudou. Reenvie a foto quando a sincronização terminar.');
        workspace = parseWorkspace(JSON.stringify(fresh.data.workspace.data)); revision = fresh.data.workspace.revision;
        next = append(workspace); saved = await save(next, revision);
      }
      if (saved.error) throw new Error('Não consegui vincular a foto ao seu espaço. Nenhum gasto foi criado.');
      workspace = next; revision = Number(saved.data); image = attachment.image; photoNoteId = attachment.note.id;
    } catch (cause) { await say(cause instanceof Error ? cause.message : 'Não consegui guardar a foto.'); return ok(); }
  }

  if (intent.kind === 'undo') {
    if (!context.last_applied?.length) { await say('Não há nada recente para desfazer.'); return ok(); }
    const saved = await save(undoApplied(workspace, context.last_applied), revision);
    const text = saved.error ? 'Não consegui desfazer agora. Tente de novo.' : `Desfeito:\n${context.last_applied.map(item => `↩️ ${item.label}`).join('\n')}`;
    await log(text, null); await say(text); return ok();
  }

  if (!context.ai) { await say(`${photo ? 'Sua foto foi guardada em Para organizar. ' : ''}A inteligência artificial ainda não está ligada para sua conta. No aplicativo: Meu espaço › Minhas chaves de IA. O proprietário também pode configurar a base compartilhada.`); return ok(); }
  let config: AiConfig;
  try { config = runtimeConfig(context.ai); }
  catch { await say('Não consegui abrir a chave da IA. Salve a chave de novo no painel.'); return ok(); }

  try {
    let said = intent.kind === 'text' ? intent.text : '';
    let heard = '';
    if (voice) {
      if (voice.duration > 240) { await say('Áudio longo demais: mande mensagens de voz de até 4 minutos.'); return ok(); }
      const audio = { mimeType: voice.mime_type || 'audio/ogg', base64: await downloadFile(token, voice.file_id) };
      heard = (await generateResilient(config, { system: 'Transcreva fielmente o áudio, em português do Brasil. Devolva só o texto falado, sem comentários.', prompt: 'Transcreva este áudio.', audio, audioTask: 'transcribe', maxTokens: 800, signal: AbortSignal.timeout(40_000), beforeAttempt: reserveCandidate })).text.trim();
      said = [said, heard].filter(Boolean).join('\n');
      if (!said) { await say('Não consegui entender o áudio. Pode repetir ou escrever?'); return ok(); }
    }
    const rooms = photo ? '' : await botHome(db, serverSecret, CHANNEL, chat);
    const raw = (await generateResilient(config, { system: photo ? imageReviewSystem : `${commandSystem}\n\nA conversa acontece pelo Telegram.\n\nContexto da pessoa:\n${commandContext(workspace, today)}${rooms}`,
      prompt: said || 'Leia a foto, descreva os dados legíveis e pergunte o que quero organizar.', history: photo ? [] : context.history.slice(-12), image, maxTokens: 2400, json: true, signal: AbortSignal.timeout(40_000), beforeAttempt: reserveCandidate })).text;
    const result = photo ? imageReview(raw) : parseCommand(raw);
    // Rooms, group work and contacts act as the linked person, once; the personal part follows as before.
    const { personal, shared: collective } = splitShared(result.actions);
    const shared = collective.length ? await botShared(db, serverSecret, CHANNEL, chat, collective) : null;
    let outcome = applyCommands(workspace, personal, { today, now });
    if (outcome.applied.length) {
      let saved = await save(outcome.data, revision);
      if (saved.error?.code === 'PT409' || saved.error?.code === '40001') {
        // The app saved something meanwhile: apply the same actions on the fresh copy.
        const fresh = await db.rpc('bot_context', { server_secret: serverSecret, channel_id: CHANNEL, chat });
        const again = parseWorkspace(JSON.stringify((fresh.data as Context).workspace?.data));
        outcome = applyCommands(again, personal, { today, now });
        saved = await save(outcome.data, (fresh.data as Context).workspace?.revision ?? 0);
      }
      if (saved.error) { await say('Entendi, mas não consegui salvar agora. Tente de novo em instantes.'); return ok(); }
    }
    const pending = outcome.pending.length ? `Não excluí nem substituí conteúdo. Abra o Assistente na Jornada Plena, repita este pedido e confirme lá: ${outcome.pending.map(item => item.label).join('; ')}.` : '';
    const actualReply = result.actions.length ? [shared?.text ?? '', personal.length ? executionSummary({ ...outcome, pending: [] }) : ''].filter(Boolean).join(' ')
      : result.reply || 'Não entendi bem. Pode dizer de outro jeito?';
    const text = botReply(`${heard ? `🎙️ “${heard.slice(0, 300)}”\n\n` : ''}${actualReply}${pending ? ` ${pending}` : ''}`, outcome.applied, []);
    await log(text, outcome.applied.length ? outcome.applied : null);
    await say(text);
  } catch (error) {
    const reason = error instanceof AiError || error instanceof TelegramError ? error.message : 'erro inesperado';
    await say(`${photoNoteId ? 'A foto original está guardada em Para organizar. ' : ''}Não consegui responder agora (${reason}). Confira os registros antes de repetir qualquer ação.`);
  }
  return ok();
}
