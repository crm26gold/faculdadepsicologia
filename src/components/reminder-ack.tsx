'use client';
import { useEffect, useState } from 'react';
import { AlarmClock, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from './community/client';

type Reminder = { id: string; title: string; event_at: string | null; status: string; next_at: string | null };
const when = (value: string) => new Date(value).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function ReminderAck() {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const id = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('id') ?? '';
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/.test(id)) { setProblem('Este link de lembrete está incompleto.'); return; }
    api<Reminder>('/api/reminders', { action: 'get', id }).then(setReminder, error => setProblem(error instanceof ApiError && error.status === 401
      ? 'Entre na Jornada neste aparelho para responder ao lembrete.' : error instanceof Error ? error.message : 'Não consegui abrir o lembrete.'));
  }, [id]);
  async function answer(choice: 'feito' | 'adiar') {
    setBusy(true);
    try { await api('/api/reminders', { action: 'ack', id, choice }); setDone(choice === 'feito' ? 'Pronto. Este lembrete não avisa mais.' : 'Combinado: aviso de novo em 10 minutos.'); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Não consegui concluir.'); }
    finally { setBusy(false); }
  }
  return <>
    <h1><AlarmClock size={22} aria-hidden="true" /> Lembrete</h1>
    {problem ? <p className="cm-message" role="alert">{problem}</p>
      : !reminder ? <p className="muted" role="status">Abrindo o lembrete…</p>
      : <>
        <p><strong>{reminder.title}</strong>{reminder.event_at ? ` · ${when(reminder.event_at)}` : ''}</p>
        {done ? <p className="telegram-ok" role="status"><CheckCircle2 size={17} aria-hidden="true" />{done}</p>
          : reminder.status === 'visto' ? <p className="muted">Você já marcou como feito.</p>
          : <div className="button-row">
            <button type="button" className="button primary" disabled={busy} onClick={() => void answer('feito')}>Feito</button>
            <button type="button" className="button outline" disabled={busy} onClick={() => void answer('adiar')}>Adiar 10 minutos</button>
          </div>}
      </>}
    <a className="text-button" href="/">Abrir a Jornada</a>
  </>;
}
