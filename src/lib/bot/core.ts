import type { Applied } from '../commands';

// Messenger-independent pieces of the bot (Telegram now, WhatsApp next), kept pure so they can be tested.

/** The person's calendar day, not the server's: Vercel runs in UTC, the person lives in Brazil. */
export function todayIn(timeZone = 'America/Sao_Paulo', at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export type BotIntent = { kind: 'link'; code: string } | { kind: 'start' } | { kind: 'help' } | { kind: 'undo' } | { kind: 'unlink' } | { kind: 'text'; text: string };
export function botIntent(raw: string): BotIntent {
  const text = raw.trim();
  const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{4,64}))?$/);
  if (start) return start[1] ? { kind: 'link', code: start[1].toUpperCase() } : { kind: 'start' };
  const plain = text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!]+$/, '');
  if (/^\/(ajuda|help)(@\w+)?$/.test(plain) || plain === 'ajuda') return { kind: 'help' };
  if (/^\/desfazer(@\w+)?$/.test(plain) || plain === 'desfazer' || plain === 'desfaz' || plain === 'desfaca') return { kind: 'undo' };
  if (/^\/sair(@\w+)?$/.test(plain)) return { kind: 'unlink' };
  return { kind: 'text', text };
}

export const helpText = [
  'Sou o assistente da Jornada Plena. Converse comigo como no aplicativo:',
  '• "amanhã às 15h dentista"',
  '• "gastei 50 reais de lanche"',
  '• "conta de luz de 210 vence dia 10"',
  '• "o que eu tenho hoje?" ou "qual meu saldo?"',
  'Também entendo mensagens de voz.',
  '"desfazer" volta o último registro · /sair desconecta este Telegram.',
].join('\n');

export const notLinkedText = 'Este Telegram ainda não está ligado à sua Jornada Plena. No aplicativo, abra Meu espaço › Telegram, toque em "Conectar meu Telegram" e volte aqui pelo botão.';

/** The answer plus a checklist of what was actually done, in plain text (no Markdown to escape). */
export function botReply(reply: string, applied: Applied[], failed: string[]) {
  return [
    reply.trim(),
    applied.length ? applied.map(item => `✅ ${item.label}`).join('\n') : '',
    failed.length ? `⚠️ Não consegui: ${failed.join('; ')}.` : '',
    applied.length ? 'Escreva "desfazer" para voltar.' : '',
  ].filter(Boolean).join('\n\n').slice(0, 4000);
}
