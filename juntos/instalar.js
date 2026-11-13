/* JuntOS · instalar como app.
   - Chrome / Edge / Samsung (Android y PC): un click abre el cartel nativo de instalación.
   - iPhone / iPad: Apple no deja instalar con un botón → guía de 2 pasos (Compartir → Agregar a inicio).
   - Si ya está instalada o se abrió desde el ícono, no muestra nada.
   Uso: cualquier elemento con [data-instalar] se vuelve botón de instalar (queda oculto si no corresponde).
        window.JX_INSTALAR_AVISO = true  → además muestra un aviso abajo (se puede cerrar; vuelve a los 14 días). */
(function () {
  var ua = navigator.userAgent || '';
  var esIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var esAndroid = /Android/.test(ua);
  var esMovil = esIOS || esAndroid || /Mobi/.test(ua);
  var enApp = /FBAN|FBAV|Instagram|Line\/|TikTok|Twitter|; wv\)/.test(ua);           // navegador interno de otra app
  var iosOtro = esIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);                            // Chrome/Firefox/Edge en iPhone
  var safariMac = !esMovil && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  var firefoxPC = !esMovil && /Firefox/.test(ua);
  var chromePC = !esMovil && /Chrome\/|Edg\//.test(ua) && !/OPR|Firefox/.test(ua);
  var yaInstalada = false;   // la detecta getInstalledRelatedApps (Chrome/Edge) aunque se abra en una pestaña
  var instalada = function () {
    return (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches)) || navigator.standalone === true;
  };
  var LS = 'jx_instalar_cerrado';
  var evento = null;   // beforeinstallprompt guardado
  var listo = false;

  // Qué se puede ofrecer en este navegador
  function modo() {
    if (instalada() || yaInstalada) return null;
    if (evento) return 'nativo';
    if (enApp) return 'abrir';                       // Instagram / Facebook / etc: hay que abrirla en el navegador
    if (esIOS) return 'ios';
    if (safariMac) return 'mac';
    if (firefoxPC) return null;                      // Firefox en PC no instala webs
    // Chrome/Edge en PC: si no avisó que se puede instalar es porque YA está instalada (cuando no lo está, avisa siempre) → no mostrar nada
    // Android con un navegador que no avisa (Firefox, Opera...): pasos con el menú ⋮.
    // En Chrome/Samsung/Edge no: si no avisó es porque ya está instalada.
    if (esAndroid && listo && (/Firefox|OPR|UCBrowser|MiuiBrowser|YaBrowser/.test(ua) || !/Chrome\//.test(ua))) return 'android';
    return null;
  }

  // ---------- estilos ----------
  var css = document.createElement('style');
  css.textContent =
    '.jxi-fondo{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;font-family:Nunito,system-ui,sans-serif}' +
    '.jxi-fondo.on{opacity:1}' +
    '.jxi-ic{display:inline-flex !important;vertical-align:-3px;margin:0 2px 0 -4px !important;color:inherit !important;font-size:inherit !important}.jxi-ic svg{width:18px;height:18px}' +
    '.jxi-hoja{background:#fff;color:#1a1a1a;width:100%;max-width:440px;border-radius:22px 22px 0 0;padding:20px 18px calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateY(30px);transition:transform .2s;position:relative}' +
    '.jxi-fondo.on .jxi-hoja{transform:none}' +
    '@media (min-width:700px){.jxi-fondo{align-items:center}.jxi-hoja{border-radius:22px}}' +
    '.jxi-hoja h3{margin:0 0 4px;font-size:1.2rem;font-weight:900;text-align:center}' +
    '.jxi-hoja>p{margin:0 0 14px;text-align:center;color:#5f5f58;font-size:.95rem}' +
    '.jxi-paso{display:flex;gap:12px;align-items:center;background:#EBF3E0;border-radius:6px 18px 6px 18px;padding:12px;margin-bottom:8px;font-size:.98rem;line-height:1.35}' +
    '.jxi-paso b.n{flex-shrink:0;width:30px;height:30px;border-radius:50%;background:#65A30D;color:#fff;display:grid;place-items:center;font-weight:900}' +
    '.jxi-ic{display:inline-flex;vertical-align:-5px;width:22px;height:22px;color:#0A84FF}' +
    '.jxi-ok{display:block;width:100%;margin-top:8px;border:0;border-radius:6px 20px 6px 20px;background:#65A30D;color:#fff;font:800 1rem Nunito,system-ui,sans-serif;padding:13px;cursor:pointer}' +
    '.jxi-x{position:absolute;top:10px;right:12px;width:34px;height:34px;border:0;background:none;font-size:1.5rem;color:#888;cursor:pointer}' +
    '.jxi-flecha{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);transform:translateX(-50%);z-index:100001;font-size:2rem;color:#fff;animation:jxiRebote 1s ease-in-out infinite;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.4)}' +
    '@keyframes jxiRebote{50%{transform:translate(-50%,8px)}}' +
    '.jxi-aviso{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:99990;max-width:460px;margin:0 auto;background:#fff;color:#1a1a1a;border:1px solid rgba(0,0,0,.08);border-radius:8px 22px 8px 22px;box-shadow:0 12px 34px rgba(0,0,0,.18);display:flex;align-items:center;gap:12px;padding:10px 10px 10px 12px;font-family:Nunito,system-ui,sans-serif;transform:translateY(140%);transition:transform .35s cubic-bezier(.2,.9,.3,1.2)}' +
    '.jxi-aviso.on{transform:none}' +
    '.jxi-aviso img{width:42px;height:42px;border-radius:11px;flex-shrink:0}' +
    '.jxi-aviso div{flex:1;min-width:0;line-height:1.25}.jxi-aviso b{display:block;font-weight:900;font-size:.95rem}.jxi-aviso small{color:#5f5f58;font-weight:600;font-size:.8rem}' +
    '.jxi-aviso .si{border:0;border-radius:5px 16px 5px 16px;background:#65A30D;color:#fff;font:800 .9rem Nunito,system-ui,sans-serif;padding:9px 14px;cursor:pointer;flex-shrink:0}' +
    '.jxi-aviso .no{border:0;background:none;color:#999;font-size:1.3rem;width:30px;height:30px;cursor:pointer;flex-shrink:0;padding:0}' +
    '.jxi-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:11px 18px;border-radius:14px;font:700 .92rem Nunito,system-ui,sans-serif;z-index:100002}' +
    '@media (prefers-color-scheme:dark){.jxi-hoja,.jxi-aviso{background:#1c1c1e;color:#f5f5f5;border-color:rgba(255,255,255,.1)}.jxi-hoja>p,.jxi-aviso small{color:#aaa}.jxi-paso{background:rgba(101,163,13,.18)}}';
  document.head.appendChild(css);

  var IC_COMPARTIR = '<svg class="jxi-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  var IC_INST = '<svg class="jxi-ic" style="color:#555" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 7v6M9 10l3 3 3-3"/></svg>';
  var IC_MAS = '<svg class="jxi-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  function hoja(titulo, texto, pasos, flecha) {
    var f = document.createElement('div'); f.className = 'jxi-fondo';
    f.innerHTML = '<div class="jxi-hoja" role="dialog" aria-modal="true"><button class="jxi-x" aria-label="Cerrar">×</button><h3>' + titulo + '</h3><p>' + texto + '</p>' +
      pasos.map(function (p, i) { return '<div class="jxi-paso"><b class="n">' + (i + 1) + '</b><span>' + p + '</span></div>'; }).join('') +
      '<button class="jxi-ok">Entendido</button></div>';
    var fl = null;
    if (flecha) { fl = document.createElement('div'); fl.className = 'jxi-flecha'; fl.textContent = '⬇'; f.querySelector('.jxi-hoja').style.paddingBottom = 'calc(env(safe-area-inset-bottom,0px) + 58px)'; }
    function cerrar() { f.classList.remove('on'); if (fl) fl.remove(); setTimeout(function () { f.remove(); }, 220); }
    f.addEventListener('click', function (e) { if (e.target === f || e.target.closest('.jxi-x,.jxi-ok')) cerrar(); });
    document.body.appendChild(f); if (fl) document.body.appendChild(fl);
    requestAnimationFrame(function () { f.classList.add('on'); });
  }

  function toast(t) { var d = document.createElement('div'); d.className = 'jxi-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500); }

  function instalar() {
    var m = modo();
    if (m === 'nativo') {
      var ev = evento; evento = null;
      ev.prompt();
      (ev.userChoice || Promise.resolve({})).then(function (r) { if (r && r.outcome === 'accepted') ocultarTodo(); else pintar(); });
    } else if (m === 'ios') {
      var ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      hoja('Instalá JuntOS en tu ' + (ipad ? 'iPad' : 'iPhone'), 'Apple pide hacerlo a mano, son dos toques:', [
        'Tocá el botón <b>Compartir</b> ' + IC_COMPARTIR + (iosOtro ? ' (arriba, en la barra de direcciones)' : (ipad ? ' (arriba a la derecha)' : ' (abajo, en la barra de Safari)')),
        'Bajá y elegí <b>"Agregar a inicio"</b> ' + IC_MAS + ' y después <b>Agregar</b>.'
      ].concat(iosOtro ? ['Si no te aparece la opción, abrí <b>juntosapp.com.ar</b> en <b>Safari</b> y repetí los pasos.'] : []), !ipad && !iosOtro);
    } else if (m === 'mac') {
      hoja('Instalá JuntOS en tu Mac', 'En Safari:', ['Andá al menú <b>Archivo</b> (o tocá Compartir ' + IC_COMPARTIR + ').', 'Elegí <b>"Agregar al Dock"</b>.'], false);
    } else if (m === 'barra') {
      hoja('Instalá JuntOS en tu compu', 'Desde ' + (/Edg\//.test(ua) ? 'Edge' : 'Chrome') + ', en dos clicks:', [
        'Hacé click en el ícono de <b>instalar</b> ' + IC_INST + ' que aparece a la derecha de la <b>barra de direcciones</b>.',
        'Confirmá con <b>Instalar</b>. Queda en el escritorio y en el menú inicio.'
      ].concat(['Si no ves el ícono: menú <b>⋮</b> → <b>"Transmitir, guardar y compartir"</b> → <b>"Instalar JuntOS"</b>' + (/Edg\//.test(ua) ? ' (en Edge: menú ⋯ → Aplicaciones → Instalar este sitio como aplicación).' : '.')]), false);
    } else if (m === 'android') {
      hoja('Instalá JuntOS', 'Desde el menú del navegador:', ['Tocá los <b>tres puntitos ⋮</b> (arriba a la derecha).', 'Elegí <b>"Instalar app"</b> o <b>"Agregar a pantalla de inicio"</b>.'], false);
    } else if (m === 'abrir') {
      hoja('Abrila en tu navegador', 'Estás dentro de otra app y desde acá no se puede instalar.', [
        'Tocá los <b>tres puntitos</b> (⋯ o ⋮) de arriba.',
        'Elegí <b>"Abrir en ' + (esIOS ? 'Safari' : 'Chrome') + '"</b> (o "Abrir en el navegador") y ahí tocá <b>Instalar app</b>.'
      ], false);
    }
  }

  // ---------- texto del botón según el dispositivo ----------
  var esMac = /Macintosh/.test(ua) && !esIOS, ipadD = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var IC_CEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
  var IC_PC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>';
  function textoBoton(m) {
    // iPhone, iPad y Safari en Mac no instalan con un botón: el botón abre la guía, por eso dice "Cómo instalar…"
    if (m === 'ios') return { t: 'Cómo instalar en tu ' + (ipadD ? 'iPad' : 'iPhone'), s: 'Te mostramos los 2 pasos', ic: IC_CEL };
    if (m === 'mac') return { t: 'Cómo instalar en tu Mac', s: 'Te mostramos los 2 pasos', ic: IC_PC };
    if (m === 'abrir') return { t: 'Cómo instalar la app', s: 'Te mostramos cómo', ic: esMovil ? IC_CEL : IC_PC };
    if (esAndroid) return { t: 'Instalar en tu Android', s: 'Gratis · en un toque', ic: IC_CEL };
    if (esMovil) return { t: 'Instalar en tu celu', s: 'Gratis · en un toque', ic: IC_CEL };
    return { t: 'Instalar en tu ' + (esMac ? 'Mac' : 'PC'), s: 'Gratis · en un click', ic: IC_PC };
  }
  function rotular(b, m) {
    if (!m) return;
    var x = textoBoton(m), t = b.querySelector('.t');
    if (t) {   // botón chico del inicio: "Título + <small>detalle</small>"
      var sm = t.querySelector('small'); t.firstChild && t.firstChild.nodeType === 3 ? (t.firstChild.nodeValue = x.t) : t.insertBefore(document.createTextNode(x.t), t.firstChild);
      if (sm) sm.textContent = x.s;
    } else if (b.dataset.instalarTexto !== 'no') {
      b.innerHTML = '<span class="jxi-ic">' + x.ic + '</span>' + x.t;
    }
    b.setAttribute('aria-label', x.t);
  }

  // ---------- botones [data-instalar] ----------
  function pintar() {
    var m = modo();
    document.querySelectorAll('[data-instalar]').forEach(function (b) {
      b.hidden = !m; rotular(b, m);
      if (!b.dataset.jxi) { b.dataset.jxi = '1'; b.addEventListener('click', function (e) { e.preventDefault(); instalar(); }); }
    });
    document.querySelectorAll('[data-instalar-ya]').forEach(function (el) { el.hidden = !instalada(); });
    // el texto de "abrí desde Chrome…" solo cuando no hay botón para instalar ni ya está instalada
    document.querySelectorAll('[data-instalar-nada]').forEach(function (el) { el.hidden = !!m || instalada(); });
    if (window.JX_INSTALAR_AVISO) aviso(m);
  }
  function ocultarTodo() { document.querySelectorAll('[data-instalar]').forEach(function (b) { b.hidden = true; }); var a = document.querySelector('.jxi-aviso'); if (a) a.remove(); }

  // ---------- aviso abajo (dentro de la app) ----------
  var avisoHecho = false;
  function aviso(m) {
    if (!m || avisoHecho) return;
    var c = 0; try { c = +localStorage.getItem(LS) || 0; } catch (e) {}
    if (c && Date.now() - c < 14 * 864e5) return;
    avisoHecho = true;
    var icono = (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '';
    var a = document.createElement('div'); a.className = 'jxi-aviso';
    a.innerHTML = (icono ? '<img src="' + icono + '" alt="">' : '') + '<div><b>Tené JuntOS a un toque</b><small>' + (esMovil ? 'Agregala al inicio de tu celu' : 'Instalala en tu compu') + '</small></div><button class="si">Instalar</button><button class="no" aria-label="Ahora no">×</button>';
    a.querySelector('.si').onclick = function () { a.classList.remove('on'); instalar(); };
    a.querySelector('.no').onclick = function () { try { localStorage.setItem(LS, Date.now()); } catch (e) {} a.classList.remove('on'); setTimeout(function () { a.remove(); }, 400); };
    document.body.appendChild(a);
    setTimeout(function () { a.classList.add('on'); }, 1500);
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); evento = e; pintar(); });
  window.addEventListener('appinstalled', function () { evento = null; ocultarTodo(); toast('¡Listo! JuntOS quedó instalada 💞'); });
  window.jxInstalar = instalar;

  function iniciar() {
    if ('serviceWorker' in navigator && window.JX_SW) navigator.serviceWorker.register(window.JX_SW).catch(function () {});
    if (navigator.getInstalledRelatedApps) navigator.getInstalledRelatedApps().then(function (l) { if (l && l.length) { yaInstalada = true; pintar(); } }).catch(function () {});
    pintar();
    // Si el navegador no avisa que se puede instalar (Firefox Android, Opera...), a los 2,5 s ofrecemos los pasos a mano
    setTimeout(function () { listo = true; pintar(); }, 3500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
