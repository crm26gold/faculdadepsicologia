'use client';
import { useEffect, useState } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { api } from './community/client';

type Link = { connected_at: string; synced_at: string | null; events: number; problem: '' | 'revoked' | 'partial' | 'failed'; syncing: boolean };
type State = { ready: boolean; link: Link | null };
const returns: Record<string, string> = {
  conectada: 'Google Agenda conectado. A agenda “Jornada Plena” recebe seus compromissos em instantes.',
  cancelado: 'Conexão cancelada na tela do Google. Nada foi alterado.',
  expirado: 'A conexão demorou ou começou em outra conta. Tente de novo.',
  'sem-permissao': 'Para copiar a agenda, marque a permissão da agenda na tela do Google.',
  indisponivel: 'O Google Agenda ainda não foi ativado nesta Jornada.',
  falhou: 'Não consegui concluir a conexão com o Google. Tente de novo em instantes.',
};
const problems: Record<Link['problem'], string> = {
  '': '', partial: 'A última atualização ficou incompleta. Ela continua sozinha na próxima mudança, ou toque em Atualizar agora.',
  failed: 'A última atualização falhou. Toque em Atualizar agora para tentar de novo.',
  revoked: 'O Google não aceita mais esta conexão (ela foi removida ou expirou). Conecte de novo.',
};
const when = (value: string) => new Date(value).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Jornada → Google: a copy in a calendar of its own, kept up to date by the server after each change. */
export function GoogleAgendaPanel({ returned }: { returned?: string }) {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState(returned ? returns[returned] ?? '' : '');
  const [busy, setBusy] = useState(false);
  const load = () => api<State>('/api/google-agenda').then(setState, () => setState({ ready: false, link: null }));
  useEffect(() => { void load(); }, []);
  async function act(action: 'sync' | 'disconnect') {
    if (action === 'disconnect' && !window.confirm('Desconectar o Google Agenda? A agenda “Jornada Plena” sai do seu Google; seus compromissos continuam na Jornada.')) return;
    setBusy(true); setMessage('');
    try {
      const result = await api<{ events?: number; complete?: boolean; calendarRemoved?: boolean }>('/api/google-agenda', { action });
      setMessage(action === 'sync' ? (result.complete ? `Pronto: ${result.events} eventos conferidos no Google.` : 'Atualizei parte dos eventos; o restante segue na próxima mudança.')
        : result.calendarRemoved ? 'Desconectado. A agenda “Jornada Plena” saiu do seu Google.' : 'Desconectado da Jornada. Não consegui apagar a agenda “Jornada Plena” no Google: apague por lá, se quiser.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não consegui concluir.'); }
    finally { setBusy(false); await load(); }
  }
  return <section className="google-agenda-panel" aria-labelledby="google-agenda-title">
    <h3 id="google-agenda-title"><CalendarCheck size={18} aria-hidden="true" /> Google Agenda</h3>
    {message && <p className="cm-message" role="status">{message}</p>}
    {!state ? <p className="muted">Consultando a conexão…</p>
      : !state.ready ? <p className="muted">O Google Agenda ainda não foi ativado nesta Jornada. Enquanto isso, o arquivo abaixo leva uma cópia manual.</p>
      : !state.link ? <>
        <p>Seus compromissos, prazos e aulas aparecem numa agenda própria, “Jornada Plena”, no seu Google, e ela se atualiza sozinha quando algo muda aqui, inclusive pelo assistente. Vai de uma semana atrás a quatro meses à frente.</p>
        <p className="muted small">A Jornada só alcança essa agenda: suas outras agendas do Google ficam fora de alcance. O que você mudar por lá é substituído pela versão da Jornada.</p>
        <form method="post" action="/api/google-agenda/connect"><button className="button primary">Conectar Google Agenda</button></form>
      </>
      : <>
        <p>Conectado desde {when(state.link.connected_at)}. {state.link.syncing ? 'Atualizando agora…' : state.link.synced_at ? `Última atualização: ${when(state.link.synced_at)}, ${state.link.events} eventos.` : 'Primeira atualização a caminho.'}</p>
        {problems[state.link.problem] && <p className="cm-message">{problems[state.link.problem]}</p>}
        <div className="button-row">
          {state.link.problem === 'revoked' ? <form method="post" action="/api/google-agenda/connect"><button className="button primary">Conectar de novo</button></form>
            : <button type="button" className="button outline" disabled={busy} onClick={() => void act('sync')}><RefreshCw size={16} aria-hidden="true" />Atualizar agora</button>}
          <button type="button" className="text-button cm-danger" disabled={busy} onClick={() => void act('disconnect')}>Desconectar</button>
        </div>
      </>}
  </section>;
}
