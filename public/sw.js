// Jornada Plena: recebe os lembretes que a própria pessoa pediu. Não guarda páginas nem dados (sem cache offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const id = typeof data.id === 'string' ? data.id : '';
  const url = typeof data.url === 'string' && data.url.startsWith(self.location.origin) ? data.url : '/';
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title : 'Jornada Plena', {
    body: typeof data.body === 'string' ? data.body.slice(0, 300) : 'Você tem um lembrete.',
    icon: '/brand/icone-192.png', badge: '/brand/icone-192.png', tag: id || undefined, renotify: true,
    requireInteraction: data.insist === true, vibrate: [300, 120, 300, 120, 600],
    data: { id, url, focus: data.focus === true },
    // A focus near its end asks whether to keep going; "Pausar" opens the app, which pauses it on this account.
    actions: !id ? [] : data.focus === true ? [{ action: 'feito', title: 'Continuar' }, { action: 'pausar', title: 'Pausar' }]
      : [{ action: 'feito', title: 'Feito' }, { action: 'adiar', title: 'Adiar 10 min' }],
  }));
});

self.addEventListener('notificationclick', event => {
  const { id, url } = event.notification.data || {};
  event.notification.close();
  if (id && event.action === 'pausar') {
    event.waitUntil(fetch('/api/reminders', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack', id, choice: 'feito' }) }).catch(() => null)
      .then(() => self.clients.openWindow('/?foco=pausar')));
    return;
  }
  if (id && (event.action === 'feito' || event.action === 'adiar')) {
    // Same route as the app, with the session cookie of this device. If it fails, the reminder page opens.
    event.waitUntil(fetch('/api/reminders', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack', id, choice: event.action }) })
      .then(response => { if (!response.ok) return self.clients.openWindow(url); })
      .catch(() => self.clients.openWindow(url)));
    return;
  }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(item => item.url.startsWith(self.location.origin));
    if (open) { open.navigate(url).catch(() => null); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
