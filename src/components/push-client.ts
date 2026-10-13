'use client';
// Notificação do app: o aviso principal da Jornada (lembretes e Networking), no celular, no tablet ou no computador.
// Usado pelo convite do Meu dia e pela tela de Avisos.
import { api } from './community/client';

export type Device = 'iphone' | 'ipad' | 'android' | 'computer';
/** iPad recente se apresenta como Mac; o toque denuncia. */
export function deviceKind(): Device {
  const agent = navigator.userAgent;
  if (/iPhone|iPod/i.test(agent)) return 'iphone';
  if (/iPad/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/Android/i.test(agent)) return 'android';
  return 'computer';
}
export const deviceLabel = () => ({ iphone: 'iPhone', ipad: 'iPad', android: 'Android', computer: 'Computador' } as const)[deviceKind()];
/** Aberto pelo ícone da tela inicial (app instalado). */
export const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** No iPhone e no iPad, a notificação só existe com o app instalado na tela inicial. */
export const iosOutsideApp = () => typeof window !== 'undefined' && ['iphone', 'ipad'].includes(deviceKind()) && !installed();

function key(base64: string) {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Pede a permissão, inscreve este aparelho e avisa o servidor. Lança um erro com a orientação certa. */
export async function enablePush(vapid: string) {
  if (!vapid) throw new Error('As notificações ainda não foram ativadas no servidor.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('O aparelho não permitiu notificações. Libere nas configurações de notificação do navegador e tente de novo.');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapid) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('O navegador não entregou a inscrição. Tente de novo.');
  await api('/api/reminders', { action: 'subscribe', endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() });
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (subscription) { await api('/api/reminders', { action: 'unsubscribe', endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
}
