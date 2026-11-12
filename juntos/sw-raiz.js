/* JuntOS · service worker de la raíz (landing y login). No guarda nada en caché:
   deja pasar todo a internet y, si no hay conexión al abrir una página, muestra un aviso en vez del error del navegador.
   Que exista hace que Chrome/Edge ofrezcan instalar la app sin vueltas. (Las notificaciones las maneja app/sw.js.) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JuntOS</title>' +
    '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center;color:#333;background:#fffdf8">' +
    '<div><div style="font-size:3rem">📶</div><h2>Sin conexión</h2><p>Conectate a internet y volvé a intentar.</p>' +
    '<button onclick="location.reload()" style="border:0;border-radius:6px 20px 6px 20px;background:#65A30D;color:#fff;font-weight:800;padding:12px 22px;font-size:1rem">Reintentar</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
