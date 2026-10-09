'use client';
import { useEffect, useState } from 'react';
import { AlarmClock, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from './community/client';

type Reminder = { id: string; title: string; event_at: string | null; status: string; next_at: string | null; focus?: boolean; forgotten?: boolean; focus_id?: string | null };
const clock = (value: string) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
  async function answer(choice: 'feito' | 'adiar' | 'pausar' | 'encerrar') {
    setBusy(true);
    try {
      await api('/api/reminders', { action: 'ack', id, choice: choice === 'adiar' ? 'adiar' : 'feito' });
      // Pausing changes the focus itself, which lives in the account: the app opens and pauses it there.
      if (choice === 'pausar') { window.location.assign('/?foco=pausar'); return; }
      if (choice === 'encerrar') { window.location.assign(`/?foco=encerrar&id=${encodeURIComponent(reminder?.focus_id ?? '')}${reminder?.event_at ? `&fim=${Date.parse(reminder.event_at)}` : ''}`); return; }
      setDone(reminder?.focus ? (choice === 'feito' ? 'Combinado: o foco continua contando.' : 'Pergunto de novo em 10 minutos.')
        : choice === 'feito' ? 'Pronto. Este lembrete não avisa mais.' : 'Combinado: aviso de novo em 10 minutos.');
    }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Não consegui concluir.'); }
    finally { setBusy(false); }
  }
  return <>
    <h1><AlarmClock size={22} aria-hidden="true" /> {reminder?.forgotten ? 'O foco ficou ligado?' : reminder?.focus ? 'Ainda em foco?' : 'Lembrete'}</h1>
    {problem ? <p className="cm-message" role="alert">{problem}</p>
      : !reminder ? <p className="muted" role="status">Abrindo o lembrete…</p>
      : <>
        <p><strong>{reminder.title}</strong>{reminder.event_at ? ` · ${reminder.forgotten ? 'o tempo acabou ' : reminder.focus ? 'termina ' : ''}${when(reminder.event_at)}` : ''}</p>
        {done ? <p className="telegram-ok" role="status"><CheckCircle2 size={17} aria-hidden="true" />{done}</p>
          : reminder.status === 'visto' ? <p className="muted">{reminder.focus || reminder.forgotten ? 'Você já respondeu.' : 'Você já marcou como feito.'}</p>
          : reminder.forgotten ? <div className="button-row">
            <button type="button" className="button primary" disabled={busy} onClick={() => void answer('encerrar')}>{reminder.event_at ? `Encerrar às ${clock(reminder.event_at)}` : 'Encerrar agora'}</button>
            <button type="button" className="button outline" disabled={busy} onClick={() => void answer('feito')}>Ainda estou em foco</button>
          </div>
          : reminder.focus ? <div className="button-row">
            <button type="button" className="button primary" disabled={busy} onClick={() => void answer('feito')}>Continuar em foco</button>
            <button type="button" className="button outline" disabled={busy} onClick={() => void answer('pausar')}>Pausar o foco</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => void answer('adiar')}>Perguntar de novo em 10 minutos</button>
          </div>
          : <div className="button-row">
            <button type="button" className="button primary" disabled={busy} onClick={() => void answer('feito')}>Feito</button>
            <button type="button" className="button outline" disabled={busy} onClick={() => void answer('adiar')}>Adiar 10 minutos</button>
          </div>}
      </>}
    <a className="text-button" href="/">Abrir a Jornada</a>
  </>;
}
