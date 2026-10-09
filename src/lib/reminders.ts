import { z } from 'zod';

// Lembretes que saem sozinhos, só para a própria pessoa e só quando ela pede ("Avisar" no compromisso, assistente
// ou teste), ou quando um foco chega perto do fim. Todo aviso sai em todos os canais ligados; a intensidade decide só
// quantas vezes ele volta. O banco guarda a hora e a escada; o servidor envia e escreve a mensagem.
export const reminderLevels = ['suave', 'normal', 'insistente'] as const;
export type ReminderLevel = (typeof reminderLevels)[number];
export const levelLabels: Record<ReminderLevel, { name: string; detail: string }> = {
  suave: { name: 'Suave', detail: 'Um aviso só, em todos os canais ligados.' },
  normal: { name: 'Normal', detail: 'Em todos os canais na hora e de novo 5 minutos depois, se você não tocar em Feito.' },
  insistente: { name: 'Não me deixa esquecer', detail: 'Em todos os canais na hora, 5 e 15 minutos depois, até você tocar em Feito.' },
};
export const remindMinutes = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
export const minutesLabel = (minutes: number) => minutes === 0 ? 'Na hora' : minutes < 60 ? `${minutes} min antes` : minutes === 1440 ? '1 dia antes' : `${minutes / 60} h antes`;
export const remindSchema = z.object({ minutes: z.literal(remindMinutes), level: z.enum(reminderLevels) }).strict();
export type Remind = z.infer<typeof remindSchema>;

// Only free channels. E-mail goes through Google Agenda's own reminders (every event with a reminder).
export type ReminderChannel = 'push' | 'telegram' | 'whatsapp';
export const channelLabels: Record<ReminderChannel, string> = { push: 'Notificação do app', telegram: 'Telegram', whatsapp: 'WhatsApp' };
export type ClaimedReminder = {
  id: string; title: string; event_at: string | null; due_at: string; level: ReminderLevel; step: number;
  /** "Ainda em foco?" near the end; forgotten: the focus kept running well after it. */
  focus?: boolean; forgotten?: boolean; focus_id?: string | null;
  telegram: string | null; whatsapp: string | null; bridge_online: boolean; push: { endpoint: string; p256dh: string; auth: string }[];
};
export type Delivery = { at: string; step: number; channel: ReminderChannel; ok: boolean; detail: string };

/** Every step goes to every channel the person turned on: whatever device is at hand, the reminder is there. */
export function channelsFor(reminder: ClaimedReminder): ReminderChannel[] {
  return (['push', 'telegram', 'whatsapp'] as const).filter(channel => channel === 'push' ? reminder.push.length > 0 : channel === 'telegram' ? !!reminder.telegram : !!reminder.whatsapp);
}

/** Date and minute in São Paulo, where the agenda lives (the server runs in UTC). */
export function saoPauloMoment(now: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
const clock = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const day = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
/** "Dentista às 10:00 (em 15 minutos)". Repeats say so, to tell them apart from a new reminder. */
export function reminderText(reminder: Pick<ClaimedReminder, 'title' | 'event_at' | 'step' | 'focus' | 'forgotten'>, now = new Date()) {
  if (reminder.forgotten) {
    // "Foco: Bases Biológicas continua ligado; o tempo dele acabou às 19:10. Esqueceu? Encerrar às 19:10 ou continuar?"
    const end = reminder.event_at ? clock(reminder.event_at) : null;
    return `${reminder.title} continua ligado${end ? `; o tempo dele acabou às ${end}` : ' há mais de 3 horas'}. Esqueceu? Encerrar${end ? ` às ${end}` : ' agora'} ou continuar?`;
  }
  if (reminder.focus) {
    // "Foco: Bases Biológicas termina às 19:10 (em 5 minutos). Ainda em foco? Continuar ou pausar?"
    const left = reminder.event_at ? Math.round((Date.parse(reminder.event_at) - now.getTime()) / 60_000) : null;
    const end = left === null ? ' já passa de 1 hora' : left > 1 ? ` termina às ${clock(reminder.event_at!)} (em ${left} minutos)` : left >= -1 ? ' termina agora' : ` terminou às ${clock(reminder.event_at!)}`;
    return `${reminder.step > 0 ? 'De novo: ' : ''}${reminder.title}${end}. Ainda em foco? Continuar ou pausar?`;
  }
  let when = '';
  if (reminder.event_at) {
    const minutes = Math.round((Date.parse(reminder.event_at) - now.getTime()) / 60_000);
    const sameDay = day(reminder.event_at) === day(now.toISOString());
    when = minutes > 1 ? ` às ${clock(reminder.event_at)}${sameDay ? '' : ` de ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short' }).format(new Date(reminder.event_at))}`}${minutes <= 180 ? ` (em ${minutes} minutos)` : ''}`
      : minutes >= -1 ? ' agora' : ` (era às ${clock(reminder.event_at)})`;
  }
  return `${reminder.step > 0 ? 'De novo: ' : ''}${reminder.title}${when}`;
}
/** Where "Encerrar" goes for a forgotten focus: the app ends that focus at the end of its time (or now). */
export const focusStopLink = (origin: string, reminder: Pick<ClaimedReminder, 'focus_id' | 'event_at'>) =>
  `${origin.replace(/\/$/, '')}/?foco=encerrar&id=${encodeURIComponent(reminder.focus_id ?? '')}${reminder.event_at ? `&fim=${Date.parse(reminder.event_at)}` : ''}`;
export const reminderLink = (origin: string, id: string) => `${origin.replace(/\/$/, '')}/lembrete?id=${encodeURIComponent(id)}`;
