import { z } from 'zod';

// Lembretes que saem sozinhos, só para a própria pessoa e só quando ela pede ("Avisar" no compromisso, assistente
// ou teste). O banco guarda a hora e a escada; o servidor escolhe os canais de cada degrau e escreve a mensagem.
export const reminderLevels = ['suave', 'normal', 'insistente'] as const;
export type ReminderLevel = (typeof reminderLevels)[number];
export const levelLabels: Record<ReminderLevel, { name: string; detail: string }> = {
  suave: { name: 'Suave', detail: 'Um aviso na hora.' },
  normal: { name: 'Normal', detail: 'Na hora e de novo 5 minutos depois, se você não tocar em Feito.' },
  insistente: { name: 'Não me deixa esquecer', detail: 'Na hora, 5 e 15 minutos depois, em todos os canais, até você tocar em Feito. No Google Agenda, também por e-mail.' },
};
export const remindMinutes = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
export const minutesLabel = (minutes: number) => minutes === 0 ? 'Na hora' : minutes < 60 ? `${minutes} min antes` : minutes === 1440 ? '1 dia antes' : `${minutes / 60} h antes`;
export const remindSchema = z.object({ minutes: z.literal(remindMinutes), level: z.enum(reminderLevels) }).strict();
export type Remind = z.infer<typeof remindSchema>;

// Only free channels. E-mail goes through Google Agenda's own reminders on insistent events.
export type ReminderChannel = 'push' | 'telegram' | 'whatsapp';
export const channelLabels: Record<ReminderChannel, string> = { push: 'Notificação do app', telegram: 'Telegram', whatsapp: 'WhatsApp' };
export type ClaimedReminder = {
  id: string; title: string; event_at: string | null; due_at: string; level: ReminderLevel; step: number;
  telegram: string | null; whatsapp: string | null; bridge_online: boolean; push: { endpoint: string; p256dh: string; auth: string }[];
};
export type Delivery = { at: string; step: number; channel: ReminderChannel; ok: boolean; detail: string };

/** The ladder: the quiet channels first, WhatsApp from the second step on. Suave has a single step, so WhatsApp joins it. */
export function channelsFor(reminder: ClaimedReminder): ReminderChannel[] {
  const wanted: ReminderChannel[] = reminder.step === 0 && reminder.level !== 'suave' ? ['push', 'telegram'] : ['push', 'telegram', 'whatsapp'];
  return wanted.filter(channel => channel === 'push' ? reminder.push.length > 0 : channel === 'telegram' ? !!reminder.telegram : !!reminder.whatsapp);
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
export const reminderLink = (origin: string, id: string) => `${origin.replace(/\/$/, '')}/lembrete?id=${encodeURIComponent(id)}`;
