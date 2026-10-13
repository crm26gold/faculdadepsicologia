'use client';
import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Circle, Send, Smartphone, XCircle } from 'lucide-react';
import { api } from './community/client';
import { currentSubscription, deviceLabel, disablePush, enablePush, iosOutsideApp, pushSupported } from './push-client';
import { channelLabels, levelLabels, reminderLevels, type Delivery, type ReminderLevel } from '@/lib/reminders';

type Network = { enabled: boolean; quiet_from: string | null; quiet_to: string | null; muted: string[] };
type State = {
  devices: { label: string; created_at: string }[]; telegram: boolean; whatsapp: boolean; bridge_online: boolean;
  upcoming: { id: string; title: string; event_at: string | null; next_at: string; level: ReminderLevel; status: string }[];
  network?: Network | null; groups?: { id: string; name: string }[];
  vapid: string;
};
const when = (value: string) => new Date(value).toLocaleString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Meu espaço › Avisos. A notificação do app é o aviso principal (lembretes e Networking); Telegram, WhatsApp e Google
 * Agenda são complementos opcionais dos lembretes. */
export function RemindersPanel() {
  const [state, setState] = useState<State | null>(null);
  const [here, setHere] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<ReminderLevel>('normal');
  const [result, setResult] = useState<Delivery[] | null>(null);
  const load = useCallback(async () => {
    try { setState(await api<State>('/api/reminders')); } catch { setState(null); }
  }, []);
  useEffect(() => {
    void load();
    if (!pushSupported()) return;
    setBlocked(Notification.permission === 'denied');
    // A device already subscribed is confirmed again (the server may have dropped it after a refusal).
    void currentSubscription().then(async subscription => {
      setHere(!!subscription && Notification.permission === 'granted');
      const json = subscription?.toJSON();
      if (json?.endpoint && json.keys?.p256dh && json.keys.auth && Notification.permission === 'granted')
        await api('/api/reminders', { action: 'subscribe', endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() }).then(load, () => null);
    }).catch(() => null);
  }, [load]);
  if (!state) return null;
  async function run(name: string, task: () => Promise<string | void>) {
    setBusy(name); setMessage('');
    try { const done = await task(); if (done) setMessage(done); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(''); }
  }
  const enable = () => run('push', async () => {
    try { await enablePush(state.vapid); } finally { setBlocked(Notification.permission === 'denied'); }
    setHere(true);
    return 'Notificações ligadas neste aparelho. Toque em Testar avisos agora para conferir.';
  });
  const disable = () => run('push', async () => { await disablePush(); setHere(false); return 'Notificações desligadas neste aparelho.'; });
  const test = () => run('test', async () => {
    setResult(null);
    const sent = await api<{ deliveries: Delivery[] }>('/api/reminders', { action: 'test', level });
    setResult(sent.deliveries);
    return sent.deliveries.some(item => item.ok) ? (level === 'suave' ? 'Teste enviado.' : 'Teste enviado. Sem tocar em Feito, ele volta em 5 minutos.')
      : 'Nenhum canal entregou. Ligue as notificações deste aparelho.';
  });
  // Networking: a mudança aparece na hora e volta atrás se o servidor recusar.
  async function saveNetwork(next: Network) {
    if (next.quiet_from && next.quiet_from === next.quiet_to) { setMessage('O começo e o fim do silêncio precisam ser diferentes.'); return; }
    const before = state!.network!;
    setState(value => value && { ...value, network: next }); setMessage('');
    try { await api('/api/reminders', { action: 'alerts', network: next.enabled, quiet_from: next.quiet_from, quiet_to: next.quiet_to, muted: next.muted }); }
    catch (error) { setState(value => value && { ...value, network: before }); setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
  }

  const supported = pushSupported();
  const mainDetail = !supported ? (iosOutsideApp() ? 'No iPhone e no iPad, a notificação chega com o app instalado: toque em Compartilhar › Adicionar à Tela de Início e abra a Jornada pelo novo ícone.'
      : 'Este navegador não recebe notificações. Use o Chrome, o Edge, o Safari ou o app instalado.')
    : here ? `Ligadas.${state.devices.length > 1 ? ` ${state.devices.length} aparelhos recebem.` : ''}`
    : blocked ? 'Bloqueadas neste navegador. Libere no cadeado ao lado do endereço (computador) ou nas configurações de notificação do app (celular) e volte aqui.'
    : 'Com vibração e os botões Feito e Adiar, mesmo com o app fechado.';
  const network = state.network;
  const groups = state.groups ?? [];
  const extras: { done: boolean; title: string; detail: string }[] = [
    { done: state.telegram, title: 'Telegram', detail: state.telegram ? 'Ligado: o robô manda o lembrete com o botão Feito ou adiar.' : 'Conecte em Meu espaço › Telegram e WhatsApp.' },
    { done: state.whatsapp, title: 'WhatsApp', detail: state.whatsapp ? (state.bridge_online ? 'Ligado: a ponte está on-line e entrega os lembretes.' : 'Vinculado, mas a ponte está desligada: os lembretes esperam até 30 minutos por ela.') : 'Vincule seu telefone em Meu espaço › Telegram e WhatsApp.' },
    { done: true, title: 'Google Agenda', detail: 'Compromissos com Avisar também avisam pelo app do Google Agenda e por e-mail, quando ele está conectado na Agenda.' },
  ];

  return <section className="panel reminders-panel" aria-labelledby="reminders-title">
    <h2 id="reminders-title"><BellRing size={17} aria-hidden="true" /> Avisos</h2>
    <p className="muted">A notificação do app é o aviso principal: seus lembretes e as novidades do Networking chegam nela, no celular, no tablet ou no computador, mesmo com o app fechado.</p>
    <div className="reminder-main" data-done={here}>
      <span className="reminder-main-icon" aria-hidden="true"><Smartphone size={22} /></span>
      <span><strong>Notificações neste aparelho</strong><small>{mainDetail}</small></span>
      {supported && (here ? <button type="button" className="text-button" disabled={!!busy} onClick={() => void disable()}>Desligar neste aparelho</button>
        : !blocked && <button type="button" className="button primary" disabled={!!busy} onClick={() => void enable()}><BellRing size={15} aria-hidden="true" />Ligar notificações</button>)}
    </div>

    {network && <fieldset className="reminder-network">
      <legend>Networking</legend>
      <label className="cm-check"><input type="checkbox" checked={network.enabled} onChange={event => void saveNetwork({ ...network, enabled: event.target.checked })} />
        Avisar quando alguém seguir você, pedir para seguir, gostar ou achar útil, e nos pedidos dos seus grupos</label>
      <label className="cm-check"><input type="checkbox" checked={!!network.quiet_from} disabled={!network.enabled}
        onChange={event => void saveNetwork({ ...network, quiet_from: event.target.checked ? '22:00' : null, quiet_to: event.target.checked ? '07:00' : null })} /> Horário de silêncio</label>
      {network.quiet_from && network.enabled && <div className="reminder-quiet">
        <label>das <input type="time" value={network.quiet_from} onChange={event => event.target.value && void saveNetwork({ ...network, quiet_from: event.target.value })} /></label>
        <label>às <input type="time" value={network.quiet_to ?? ''} onChange={event => event.target.value && void saveNetwork({ ...network, quiet_to: event.target.value })} /></label>
      </div>}
      <small className="muted">No silêncio, o Networking não toca e tudo fica nas Novidades. Os lembretes que você pediu tocam sempre.</small>
      {groups.length > 0 && network.enabled && <details className="reminder-groups">
        <summary>Silenciar grupos{network.muted.length ? ` (${network.muted.length})` : ''}</summary>
        <ul>{groups.map(group => <li key={group.id}><label className="cm-check"><input type="checkbox" checked={network.muted.includes(group.id)}
          onChange={event => void saveNetwork({ ...network, muted: event.target.checked ? [...network.muted, group.id] : network.muted.filter(id => id !== group.id) })} /> {group.name}</label></li>)}</ul>
      </details>}
    </fieldset>}

    <div className="reminder-test">
      <fieldset><legend>Testar um lembrete com a intensidade</legend>{reminderLevels.map(item => <label key={item}><input type="radio" name="reminder-level" checked={level === item} onChange={() => setLevel(item)} /> {levelLabels[item].name}</label>)}</fieldset>
      <p className="muted small">{levelLabels[level].detail}</p>
      <button type="button" className="button primary" disabled={!!busy} onClick={() => void test()}><Send size={15} aria-hidden="true" />{busy === 'test' ? 'Enviando…' : 'Testar avisos agora'}</button>
      {result && <ul className="reminder-result" aria-label="Resultado do teste">{result.map(item => <li key={item.channel} data-ok={item.ok}>
        {item.ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}{channelLabels[item.channel]}: {item.detail}</li>)}</ul>}
    </div>
    {message && <p className="cm-message" role="status">{message}</p>}

    <h3>Complementos dos lembretes · opcional</h3>
    <p className="muted small">Se você quiser, os lembretes também chegam por aqui, junto com a notificação. O Networking avisa só pela notificação do app.</p>
    <ul className="reminder-steps" aria-label="Complementos">{extras.map(step => <li key={step.title} data-done={step.done}>
      {step.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
      <span><strong>{step.title}</strong><small>{step.detail}</small></span></li>)}
    </ul>
    {state.upcoming.length > 0 && <><h3>Próximos lembretes</h3><ul className="reminder-upcoming">{state.upcoming.map(item => <li key={item.id}>
      <strong>{when(item.next_at)}</strong> · {item.title}<small>{levelLabels[item.level].name}</small></li>)}</ul></>}
  </section>;
}
