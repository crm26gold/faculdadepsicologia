'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BellRing, CheckCircle2, Circle, Send, Smartphone, XCircle } from 'lucide-react';
import { api } from './community/client';
import { channelLabels, levelLabels, reminderLevels, type Delivery, type ReminderLevel } from '@/lib/reminders';

type State = {
  devices: { label: string; created_at: string }[]; telegram: boolean; whatsapp: boolean; bridge_online: boolean;
  upcoming: { id: string; title: string; event_at: string | null; next_at: string; level: ReminderLevel; status: string }[];
  vapid: string;
};
const when = (value: string) => new Date(value).toLocaleString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const deviceLabel = () => /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computador';
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iosOutsideApp = () => typeof window !== 'undefined' && /iphone|ipad/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
function key(base64: string) {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Meu espaço › Avisos: each channel as a step to tick, and a test that shows what each one did. */
export function RemindersPanel() {
  const [state, setState] = useState<State | null>(null);
  const [here, setHere] = useState(false);
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
    if (!state.vapid) throw new Error('As notificações ainda não foram ativadas no servidor.');
    if (await Notification.requestPermission() !== 'granted') throw new Error('O aparelho não permitiu notificações. Libere em Configurações › Notificações do navegador e tente de novo.');
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(state.vapid) });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('O navegador não entregou a inscrição. Tente de novo.');
    await api('/api/reminders', { action: 'subscribe', endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() });
    setHere(true);
    return 'Notificações ligadas neste aparelho. Toque em Testar avisos agora para conferir.';
  });
  const disable = () => run('push', async () => {
    const subscription = await currentSubscription();
    if (subscription) { await api('/api/reminders', { action: 'unsubscribe', endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
    setHere(false);
    return 'Notificações desligadas neste aparelho.';
  });
  const test = () => run('test', async () => {
    setResult(null);
    const sent = await api<{ deliveries: Delivery[] }>('/api/reminders', { action: 'test', level });
    setResult(sent.deliveries);
    return sent.deliveries.some(item => item.ok) ? (level === 'suave' ? 'Teste enviado.' : 'Teste enviado. Sem tocar em Feito, ele volta em 5 minutos pelos outros canais.')
      : 'Nenhum canal entregou. Ligue pelo menos um dos passos acima.';
  });
  const steps: { done: boolean; title: string; detail: ReactNode; action?: ReactNode }[] = [
    { done: here, title: 'Notificação neste aparelho', detail: !pushSupported() ? (iosOutsideApp() ? 'No iPhone: toque em Compartilhar › Adicionar à Tela de Início e abra a Jornada pelo ícone. Depois volte aqui.' : 'Este navegador não recebe notificações. Use o Chrome no Android ou o app instalado.')
      : here ? `Ligado.${state.devices.length > 1 ? ` ${state.devices.length} aparelhos recebem.` : ''}` : 'Aviso nativo, com vibração e os botões Feito e Adiar, mesmo com o app fechado.',
      action: pushSupported() && (here ? <button type="button" className="text-button" disabled={!!busy} onClick={() => void disable()}>Desligar neste aparelho</button>
        : <button type="button" className="button primary" disabled={!!busy} onClick={() => void enable()}><Smartphone size={15} aria-hidden="true" />Ligar notificações</button>) },
    { done: state.telegram, title: 'Telegram', detail: state.telegram ? 'Ligado: o robô manda o aviso com o botão Feito ou adiar.' : 'Conecte seu Telegram logo abaixo, em Telegram.' },
    { done: state.whatsapp, title: 'WhatsApp', detail: state.whatsapp ? (state.bridge_online ? 'Ligado: a ponte está on-line e entrega os avisos.' : 'Vinculado, mas a ponte está desligada: os avisos esperam até 30 minutos por ela.') : 'Vincule seu telefone em WhatsApp, mais abaixo.' },
    { done: true, title: 'Google Agenda', detail: 'Compromissos com Avisar também avisam pelo app do Google Agenda e, em “Não me deixa esquecer”, por e-mail do Google. Conecte em Minha agenda › Google Agenda.' },
  ];
  return <section className="panel reminders-panel" aria-labelledby="reminders-title">
    <h2 id="reminders-title"><BellRing size={17} aria-hidden="true" /> Avisos</h2>
    <p className="muted">Escolha <strong>Avisar</strong> num compromisso, ou peça ao assistente (“me lembra às 9 de pagar o aluguel”). O aviso sai sozinho pelos canais ligados aqui, e só para você.</p>
    <ol className="reminder-steps">{steps.map(step => <li key={step.title} data-done={step.done}>
      {step.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
      <span><strong>{step.title}</strong><small>{step.detail}</small></span>{step.action}</li>)}
    </ol>
    <div className="reminder-test">
      <fieldset><legend>Testar com a intensidade</legend>{reminderLevels.map(item => <label key={item}><input type="radio" name="reminder-level" checked={level === item} onChange={() => setLevel(item)} /> {levelLabels[item].name}</label>)}</fieldset>
      <p className="muted small">{levelLabels[level].detail}</p>
      <button type="button" className="button primary" disabled={!!busy} onClick={() => void test()}><Send size={15} aria-hidden="true" />{busy === 'test' ? 'Enviando…' : 'Testar avisos agora'}</button>
      {result && <ul className="reminder-result" aria-label="Resultado do teste">{result.map(item => <li key={item.channel} data-ok={item.ok}>
        {item.ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}{channelLabels[item.channel]}: {item.detail}</li>)}</ul>}
    </div>
    {message && <p className="cm-message" role="status">{message}</p>}
    {state.upcoming.length > 0 && <><h3>Próximos avisos</h3><ul className="reminder-upcoming">{state.upcoming.map(item => <li key={item.id}>
      <strong>{when(item.next_at)}</strong> · {item.title}<small>{levelLabels[item.level].name}</small></li>)}</ul></>}
  </section>;
}
