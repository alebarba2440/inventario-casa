/* JuntOS · service worker de la app: muestra las notificaciones y, sin conexión, un aviso en vez del error (no guarda nada en caché). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'JuntOS', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'img/icono.png', badge: 'img/icono.png', data: { url: d.url || 'calendario.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'calendario.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JuntOS</title>' +
    '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center;color:#333;background:#fffdf8">' +
    '<div><div style="font-size:3rem">📶</div><h2>Sin conexión</h2><p>Conectate a internet y volvé a intentar.</p>' +
    '<button onclick="location.reload()" style="border:0;border-radius:6px 20px 6px 20px;background:#0EA5E9;color:#fff;font-weight:800;padding:12px 22px;font-size:1rem">Reintentar</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
