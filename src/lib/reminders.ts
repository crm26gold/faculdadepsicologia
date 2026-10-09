import { z } from 'zod';

// Lembretes que saem sozinhos, só para a própria pessoa e só quando ela pede ("Avisar" no compromisso, assistente
// ou teste). O banco guarda a hora e a escada; o servidor escolhe os canais de cada degrau e escreve a mensagem.
export const reminderLevels = ['suave', 'normal', 'insistente'] as const;
export type ReminderLevel = (typeof reminderLevels)[number];
export const levelLabels: Record<ReminderLevel, { name: string; detail: string }> = {
  suave: { name: 'Suave', detail: 'Um aviso na hora.' },
  normal: { name: 'Normal', detail: 'Na hora e de novo 5 minutos depois, se você não tocar em Feito.' },
  insistente: { name: 'Não me deixa esquecer', detail: 'Na hora, 5 e 15 minutos depois, em todos os canais, até você tocar em Feito.' },
};
export const remindMinutes = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
export const minutesLabel = (minutes: number) => minutes === 0 ? 'Na hora' : minutes < 60 ? `${minutes} min antes` : minutes === 1440 ? '1 dia antes' : `${minutes / 60} h antes`;
export const remindSchema = z.object({ minutes: z.literal(remindMinutes), level: z.enum(reminderLevels) }).strict();
export type Remind = z.infer<typeof remindSchema>;

export type ReminderChannel = 'push' | 'telegram' | 'whatsapp' | 'email' | 'call';
export const channelLabels: Record<ReminderChannel, string> = { push: 'Notificação do app', telegram: 'Telegram', whatsapp: 'WhatsApp', email: 'E-mail', call: 'Ligação' };
export type ClaimedReminder = {
  id: string; title: string; event_at: string | null; due_at: string; level: ReminderLevel; step: number;
  telegram: string | null; whatsapp: string | null; bridge_online: boolean; push: { endpoint: string; p256dh: string; auth: string }[];
  owner: boolean; email: string | null; phone: string | null;
};
export type Delivery = { at: string; step: number; channel: ReminderChannel; ok: boolean; detail: string };

/** The ladder: first the quiet channels, then WhatsApp and e-mail, and the call only on the last step. */
export function channelsFor(reminder: ClaimedReminder, configured: { email: boolean; call: boolean }): ReminderChannel[] {
  const step = reminder.step;
  const wanted: ReminderChannel[] = step === 0 ? ['push', 'telegram'] : step === 1 ? ['push', 'telegram', 'whatsapp', 'email'] : ['push', 'telegram', 'whatsapp', 'call'];
  // Suave has a single step: it is the only chance, so WhatsApp joins it.
  if (reminder.level === 'suave') wanted.push('whatsapp');
  return wanted.filter(channel => channel === 'push' ? reminder.push.length > 0 : channel === 'telegram' ? !!reminder.telegram
    : channel === 'whatsapp' ? !!reminder.whatsapp : channel === 'email' ? configured.email && reminder.owner && !!reminder.email
      : configured.call && reminder.owner && !!reminder.phone);
}

const clock = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const day = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
/** "Dentista às 10:00 (em 15 minutos)". Repeats say so, to tell them apart from a new reminder. */
export function reminderText(reminder: Pick<ClaimedReminder, 'title' | 'event_at' | 'step'>, now = new Date()) {
  let when = '';
  if (reminder.event_at) {
    const minutes = Math.round((Date.parse(reminder.event_at) - now.getTime()) / 60_000);
    const sameDay = day(reminder.event_at) === day(now.toISOString());
    when = minutes > 1 ? ` às ${clock(reminder.event_at)}${sameDay ? '' : ` de ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short' }).format(new Date(reminder.event_at))}`}${minutes <= 180 ? ` (em ${minutes} minutos)` : ''}`
      : minutes >= -1 ? ' agora' : ` (era às ${clock(reminder.event_at)})`;
  }
  return `${reminder.step > 0 ? 'De novo: ' : ''}${reminder.title}${when}`;
}
/** Paid or third-party channels (e-mail, call) carry no title until their data policy is confirmed. */
export const privateText = 'Você tem um lembrete na Jornada Plena. Abra o aplicativo para ver.';
export const reminderLink = (origin: string, id: string) => `${origin.replace(/\/$/, '')}/lembrete?id=${encodeURIComponent(id)}`;
