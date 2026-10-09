import type { Metadata } from 'next';
import { ReminderAck } from '@/components/reminder-ack';

export const metadata: Metadata = { title: 'Lembrete · Jornada Plena' };

// Opened from the Telegram, WhatsApp or e-mail link. Nothing changes on opening (link previews open it too):
// only a tap on Feito or Adiar, with the session of this device.
export default function ReminderPage() {
  return <main className="reminder-page"><ReminderAck /></main>;
}
