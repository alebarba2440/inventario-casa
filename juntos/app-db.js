/* JuntOS · adaptador de datos.
   Reemplaza a Firebase dentro de las secciones: ofrece las mismas funciones que usan las páginas
   (collection/doc/set/delete/onSnapshot/batch/FieldValue) pero guarda todo en la base de JuntOS (DonWeb),
   separado por pareja. También sincroniza los datos personales de cada uno (gastos personales, ajustes).
   Se carga primero en cada página de /juntos/app/. */
(function () {
  'use strict';
  var API = '../api/?a=';
  var K_DOCS = 'juntos_docs', K_PEND = 'juntos_pend', K_YO = 'juntos_yo', K_PPEND = 'juntos_ppend';
  // Claves de localStorage que son de cada persona y se guardan en su cuenta.
  var PERSONAL = ['cfg_v2', 'gastos-mensuales', 'categorias', 'nombres-categoria', 'grupos-colapsados', 'tend-cat',
    'ultima-categoria', 'sonidos', 'personajes_v1', 'copito_anios', 'viaje_sel'];

  var LS = window.localStorage;
  var P = 'jx:';   // todo lo de JuntOS va con este prefijo: así no se mezcla con otros sitios del mismo dominio
  var getItemOrig = Storage.prototype.getItem, setItemOrig = Storage.prototype.setItem, removeItemOrig = Storage.prototype.removeItem;
  function lget(k) { return getItemOrig.call(LS, P + k); }
  function lset(k, v) { setItemOrig.call(LS, P + k, v); }
  function ldel(k) { removeItemOrig.call(LS, P + k); }
  function lclear() { var ks = []; for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(P) === 0) ks.push(k); } ks.forEach(function (k) { removeItemOrig.call(LS, k); }); }
  function rd(k, d) { try { var v = JSON.parse(lget(k)); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { lset(k, JSON.stringify(v)); } catch (e) {} }
  function clon(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ---------- Quién soy (cacheado para que las páginas lo lean al instante) ---------- */
  var YO = rd(K_YO, null);
  /* Cada integrante ocupa un lugar en los datos: "j" (el primero) y "a" (el segundo).
     Por defecto, j = quien creó la pareja. Si quedó al revés (por ej. con datos importados), se intercambia desde el panel de administración
     y queda guardado para los dos en el documento compartido juntos/pareja. */
  var PERFIL_K = 'juntos\u0001pareja';
  function perfil() { var v = window.__jxValor ? window.__jxValor(PERFIL_K) : null; return (v && typeof v === 'object') ? v : {}; }
  function miembrosOrdenados(y) {
    var ms = ((y && y.pareja && y.pareja.miembros) || []).slice();
    if (perfil().invertido) { ms = [ms[1] || null, ms[0] || null]; }
    return ms;
  }
  var DEF_COL = { j: '#DB2777', a: '#0284C7' };
  function hex(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toUpperCase() : null; }
  function mezcla(c, a) { var n = parseInt(c.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function aplicarColores(ms) {
    var col = perfil().colores || {}, el = document.documentElement;
    var cj = hex(ms[0] && col[ms[0].email]) || DEF_COL.j, ca = hex(ms[1] && col[ms[1].email]) || DEF_COL.a;
    if (ca === cj) ca = (cj === DEF_COL.a) ? DEF_COL.j : DEF_COL.a;   // si eligieron el mismo color, el segundo usa otro que contraste
    el.style.setProperty('--juli', cj); el.style.setProperty('--juli-l', mezcla(cj, .16));
    el.style.setProperty('--ale', ca); el.style.setProperty('--ale-l', mezcla(ca, .16));
    window.JUNTOS && (window.JUNTOS.colores = { j: cj, a: ca });
  }
  function publicarYo(y) {
    var ms = miembrosOrdenados(y);
    var pn = function (m) { return m ? String(m.nombre || m.email || '').split(' ')[0] : ''; };
    var mail = y && y.usuario && y.usuario.email;
    window.JUNTOS = {
      usuario: y && y.usuario, pareja: y && y.pareja,
      nombres: (ms[0] || ms[1]) ? { j: pn(ms[0]) || 'Yo', a: pn(ms[1]) || 'Pareja' } : null,
      fotos: (ms[0] || ms[1]) ? { j: (ms[0] && ms[0].foto) || '', a: (ms[1] && ms[1].foto) || '' } : null,
      miSlot: mail ? (ms[0] && ms[0].email === mail ? 'j' : ms[1] && ms[1].email === mail ? 'a' : null) : null,
      invertido: !!perfil().invertido,
      soloLectura: !!(y && y.pareja && y.pareja.solo_lectura)
    };
    aplicarColores(ms);
    try { window.dispatchEvent(new Event('juntos')); } catch (e) {}
  }

  /* ---------- Estado: lo que dijo el servidor + lo pendiente de subir ---------- */
  var cache = rd(K_DOCS, null);
  if (!cache || !YO || cache.pareja !== YO.pareja_id) cache = { pareja: YO && YO.pareja_id, ver: 0, srv: {} };
  var pend = rd(K_PEND, []);          // [{c,i,t,d,n}]
  var docL = {}, colL = {};           // escuchas
  var vista = {};                     // último estado notificado por doc
  var sincronizado = false;           // ya respondió el servidor en esta carga
  var enviando = false, nPend = 0;
  var esperas = {};                   // n -> [ok, ko]
  pend.forEach(function (p) { nPend = Math.max(nPend, p.n || 0); });

  function clave(c, i) { return c + '\u0001' + i; }
  function partes(k) { var x = k.split('\u0001'); return { c: x[0], i: x[1] }; }
  function esOp(x, n) { return x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && x.__op === n; }
  function resolver(v) {
    if (esOp(v, 'ts')) return Date.now();
    if (Array.isArray(v)) return v.map(resolver);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { if (!esOp(v[k], 'delete')) o[k] = resolver(v[k]); }); return o; }
    return v;
  }
  function mezclar(base, c) {
    base = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
    Object.keys(c).forEach(function (k) {
      var x = c[k];
      if (esOp(x, 'delete')) delete base[k];
      else if (x && typeof x === 'object' && !Array.isArray(x) && !esOp(x, 'ts') && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = mezclar(base[k], x);
      else base[k] = resolver(x);
    });
    return base;
  }
  function valor(k) {   // servidor + pendientes
    var v = clon(cache.srv[k]);
    pend.forEach(function (p) {
      if (clave(p.c, p.i) !== k) return;
      if (p.t === 'delete') v = undefined;
      else if (p.t === 'merge') v = mezclar(v, clon(p.d));
      else v = resolver(clon(p.d));
    });
    return v;
  }
  window.__jxValor = valor;
  publicarYo(YO);
  function pendiente(k) { return pend.some(function (p) { return clave(p.c, p.i) === k; }); }
  function guardarEstado() { wr(K_DOCS, cache); wr(K_PEND, pend); }

  /* ---------- Fotos de lo que ven las páginas ---------- */
  function snapDoc(c, i) {
    var k = clave(c, i), v = valor(k);
    return { id: i, exists: v !== undefined, data: function () { return clon(v); }, get: function (f) { return v && v[f]; },
      ref: ref(c, i), metadata: { hasPendingWrites: pendiente(k), fromCache: !sincronizado } };
  }
  function snapCol(c) {
    var ids = {};
    Object.keys(cache.srv).forEach(function (k) { var p = partes(k); if (p.c === c) ids[p.i] = 1; });
    pend.forEach(function (p) { if (p.c === c) ids[p.i] = 1; });
    var docs = Object.keys(ids).map(function (i) { return snapDoc(c, i); }).filter(function (d) { return d.exists; });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); },
      metadata: { hasPendingWrites: pend.some(function (p) { return p.c === c; }), fromCache: !sincronizado } };
  }
  function notificar(claves, forzar) {
    var cols = {};
    claves.forEach(function (k) {
      var v = valor(k), pe = pendiente(k), ant = vista[k];
      var nuevo = JSON.stringify([v, pe]);
      if (!forzar && ant === nuevo) return;
      vista[k] = nuevo;
      var p = partes(k); cols[p.c] = 1;
      (docL[k] || []).forEach(function (f) { try { f(snapDoc(p.c, p.i)); } catch (e) { console.error(e); } });
    });
    Object.keys(cols).forEach(function (c) { (colL[c] || []).forEach(function (f) { try { f(snapCol(c)); } catch (e) { console.error(e); } }); });
    return cols;
  }
  function todasLasClaves() {
    var s = {}; Object.keys(cache.srv).forEach(function (k) { s[k] = 1; });
    pend.forEach(function (p) { s[clave(p.c, p.i)] = 1; }); Object.keys(docL).forEach(function (k) { s[k] = 1; });
    return Object.keys(s);
  }

  /* ---------- Servidor ---------- */
  function pedir(accion, datos) {
    var op = datos === undefined ? { credentials: 'same-origin', cache: 'no-store' } :
      { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Juntos': '1' }, body: JSON.stringify(datos) };
    return fetch(API + accion, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { irAIngresar(); throw new Error('sin sesión'); }
        if (!r.ok) { var e = new Error(j.error || 'Error ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function irAIngresar() { location.href = '../entrar.html'; }
  function aplicarDocs(r) {
    var cambiadas = [];
    (r.docs || []).forEach(function (d) {
      var k = clave(d.c, d.i);
      if (d.d === null) delete cache.srv[k]; else cache.srv[k] = d.d;
      cambiadas.push(k);
    });
    if (r.ver > cache.ver) cache.ver = r.ver;
    guardarEstado();
    return cambiadas;
  }
  function marcarSincronizado() {
    if (sincronizado) return;
    sincronizado = true;
    var hechas = notificar(todasLasClaves(), true);   // primera foto para todas las escuchas
    Object.keys(colL).forEach(function (c) { if (!hechas[c]) (colL[c] || []).forEach(function (f) { try { f(snapCol(c)); } catch (e) { console.error(e); } }); });
  }

  function boot() {
    pedir('boot&desde=' + (cache.pareja ? cache.ver : 0)).then(function (b) {
      if (!b.usuario) { ldel(K_YO); irAIngresar(); return; }
      if (!b.pareja) { location.href = '../entrar.html'; return; }
      var yo = { usuario: b.usuario, pareja: b.pareja, pareja_id: b.pareja_id, usuario_id: b.usuario_id };
      var otraCuenta = !YO || YO.pareja_id !== b.pareja_id || YO.usuario_id !== b.usuario_id;
      if (otraCuenta) {
        // Cambió la cuenta en este celu: borro todo lo local de la cuenta anterior.
        try { lclear(); } catch (e) {}
        pend = []; cache = { pareja: b.pareja_id, ver: 0, srv: {} };
      }
      YO = yo; wr(K_YO, yo);
      aplicarDocs(b);
      publicarYo(yo); bandaSoloLectura();
      var recargar = personalDesdeServidor(b.personal || {}) || otraCuenta;
      if (recargar && puedeRecargar()) { location.reload(); return; }
      marcarSincronizado(); miColor(); enviar();
    }).catch(function () { marcarSincronizado(); });   // sin conexión: sigo con lo guardado
  }

  function cambios() {
    if (!sincronizado || document.visibilityState === 'hidden') return Promise.resolve();
    return pedir('cambios&desde=' + cache.ver).then(function (r) {
      var ks = aplicarDocs(r); notificar(ks);
      if (ks.indexOf(PERFIL_K) >= 0) { var antes = window.JUNTOS && window.JUNTOS.invertido; publicarYo(YO); if (antes !== window.JUNTOS.invertido && puedeRecargar()) location.reload(); }
    }).catch(function () {});
  }
  // Publica el color que elegí en mi app, para que mi pareja vea lo mío de ese color.
  function miColor() {
    try {
      var c = hex((JSON.parse(lget('cfg_v2') || '{}') || {}).accent) || '#1D9E75', mail = YO && YO.usuario && YO.usuario.email;
      if (!mail) return;
      if ((perfil().colores || {})[mail] !== c) { var o = {}; o[mail] = c; db.collection('juntos').doc('pareja').set({ colores: o }, { merge: true }); }
      publicarYo(YO);
    } catch (e) {}
  }

  function enviar() {
    if (enviando || !pend.length || !YO) return;
    enviando = true;
    var lote = pend.slice(0, 200);
    pedir('escribir', { ops: lote.map(function (p) { return { c: p.c, i: p.i, t: p.t, d: p.d }; }), desde: cache.ver }).then(function (r) {
      pend = pend.slice(lote.length);
      var ks = aplicarDocs(r);
      lote.forEach(function (p) { ks.push(clave(p.c, p.i)); var w = esperas[p.n]; if (w) { w[0](); delete esperas[p.n]; } });
      enviando = false; notificar(ks);
      if (pend.length) enviar();
    }).catch(function (e) {
      enviando = false;
      if (e.status === 402 || e.status === 400 || e.status === 409) {
        // Período vencido o datos rechazados: descarto lo pendiente y vuelvo a lo del servidor.
        var ks = lote.map(function (p) { var w = esperas[p.n]; if (w) { w[1](e); delete esperas[p.n]; } return clave(p.c, p.i); });
        pend = pend.slice(lote.length); guardarEstado(); notificar(ks);
        if (e.status === 402) { if (YO && YO.pareja) YO.pareja.solo_lectura = true; publicarYo(YO); bandaSoloLectura(); aviso('⏸️ Tu período terminó: podés ver todo, pero no guardar cambios.'); }
        else aviso('No se pudo guardar: ' + e.message);
      } else setTimeout(enviar, 5000);   // sin conexión: reintento
    });
  }

  function encolar(c, i, t, d) {
    var n = ++nPend, k = clave(c, i);
    pend.push({ c: c, i: i, t: t, d: d === undefined ? undefined : clon(d), n: n });
    guardarEstado(); notificar([k]);
    var pr = new Promise(function (ok, ko) { esperas[n] = [ok, ko]; });
    pr.catch(function () {});
    clearTimeout(encolar.t); encolar.t = setTimeout(enviar, 300);
    return pr;
  }

  /* ---------- API tipo Firebase ---------- */
  function idNuevo() { var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function escuchar(mapa, k, f, inicial) {
    (mapa[k] = mapa[k] || []).push(f);
    if (sincronizado) setTimeout(function () { try { f(inicial()); } catch (e) { console.error(e); } }, 0);
    return function () { mapa[k] = (mapa[k] || []).filter(function (x) { return x !== f; }); };
  }
  function ref(c, i) {
    return {
      id: i, path: c + '/' + i,
      get: function () { return cambios().then(function () { return snapDoc(c, i); }); },
      set: function (d, o) { return encolar(c, i, o && o.merge ? 'merge' : 'set', d); },
      update: function (d) { return encolar(c, i, 'merge', d); },
      delete: function () { return encolar(c, i, 'delete'); },
      onSnapshot: function (f) { var k = clave(c, i); return escuchar(docL, k, function (s) { f(s); }, function () { return snapDoc(c, i); }); }
    };
  }
  function coleccion(c) {
    return {
      id: c,
      doc: function (i) { return ref(c, i == null ? idNuevo() : String(i)); },
      add: function (d) { var r = ref(c, idNuevo()); return r.set(d).then(function () { return r; }); },
      get: function () { return cambios().then(function () { return snapCol(c); }); },
      onSnapshot: function (f) { return escuchar(colL, c, f, function () { return snapCol(c); }); }
    };
  }
  var db = {
    collection: coleccion,
    batch: function () {
      var ops = [];
      return {
        set: function (r, d, o) { ops.push(function () { return r.set(d, o); }); return this; },
        update: function (r, d) { ops.push(function () { return r.update(d); }); return this; },
        delete: function (r) { ops.push(function () { return r.delete(); }); return this; },
        commit: function () { return Promise.all(ops.map(function (f) { return f(); })); }
      };
    },
    enablePersistence: function () { return Promise.resolve(); }
  };
  var fs = function () { return db; };
  fs.FieldValue = { serverTimestamp: function () { return { __op: 'ts' }; }, delete: function () { return { __op: 'delete' }; } };
  window.firebase = { apps: [], initializeApp: function (c) { this.apps.push(c || {}); return {}; }, firestore: fs };
  window.FB_CONFIG = { apiKey: 'juntos', projectId: 'juntos' };
  window.getFbConfig = function () { return window.FB_CONFIG; };

  /* ---------- Datos personales (gastos personales, ajustes) ---------- */
  var ppend = rd(K_PPEND, {});
  var silencio = false;
  function esPersonal(k) { return PERSONAL.indexOf(k) >= 0; }
  // Las páginas siguen usando localStorage normalmente; acá se le agrega el prefijo y se suben los datos personales.
  Storage.prototype.getItem = function (k) { return getItemOrig.call(this, this === LS ? P + k : k); };
  Storage.prototype.setItem = function (k, v) {
    if (this !== LS) return setItemOrig.call(this, k, v);
    lset(k, v);
    if (!silencio && esPersonal(k)) { ppend[k] = String(v); wr(K_PPEND, ppend); subirPersonal(); }
    if (!silencio && k === 'cfg_v2' && sincronizado) setTimeout(miColor, 0);
  };
  Storage.prototype.removeItem = function (k) {
    if (this !== LS) return removeItemOrig.call(this, k);
    ldel(k);
    if (!silencio && esPersonal(k)) { ppend[k] = null; wr(K_PPEND, ppend); subirPersonal(); }
  };
  function subirPersonal() {
    clearTimeout(subirPersonal.t);
    subirPersonal.t = setTimeout(function () {
      var envio = ppend; if (!Object.keys(envio).length || !YO) return;
      pedir('personal', { claves: envio }).then(function () {
        Object.keys(envio).forEach(function (k) { if (ppend[k] === envio[k]) delete ppend[k]; });
        wr(K_PPEND, ppend);
      }).catch(function () { setTimeout(subirPersonal, 8000); });
    }, 600);
  }
  // Devuelve true si cambió algo que la página ya había leído (hay que recargar).
  function personalDesdeServidor(srv) {
    var cambio = false;
    silencio = true;
    try {
      PERSONAL.forEach(function (k) {
        if (k in ppend) return;                       // lo local todavía no se subió: manda lo local
        var local = lget(k);
        if (k in srv) { if (local !== srv[k]) { lset(k, srv[k]); cambio = true; } }
        else if (local != null) { ppend[k] = local; }  // primera vez: subo lo que había en este celu
      });
    } finally { silencio = false; }
    wr(K_PPEND, ppend); subirPersonal();
    return cambio;
  }
  function puedeRecargar() {
    var t = +sessionStorage.getItem('juntos_rl') || 0;
    if (Date.now() - t < 15000) return false;
    sessionStorage.setItem('juntos_rl', String(Date.now())); return true;
  }

  /* ---------- Avisos ---------- */
  function aviso(txt) {
    var d = document.createElement('div');
    d.textContent = txt;
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:99999;background:#1a1a1a;color:#fff;padding:12px 16px;border-radius:14px;font:600 14px system-ui;max-width:90vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    (document.body || document.documentElement).appendChild(d); setTimeout(function () { d.remove(); }, 4500);
  }
  function bandaSoloLectura() {
    var ya = document.getElementById('juntosRO');
    if (!(window.JUNTOS && window.JUNTOS.soloLectura)) { if (ya) ya.remove(); return; }
    if (ya || !document.body) return;
    var a = document.createElement('a'); a.id = 'juntosRO'; a.href = '../entrar.html?cuenta=1';
    a.textContent = '⏸️ Período terminado · solo lectura. Tocá para ver tu cuenta';
    a.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#FFEDD5;color:#9a3412;font:700 13px system-ui;text-align:center;padding:calc(6px + env(safe-area-inset-top)) 10px 6px;text-decoration:none';
    document.body.appendChild(a);
  }
  document.addEventListener('DOMContentLoaded', bandaSoloLectura);

  /* ---------- Arranque y actualización periódica ---------- */
  boot();
  setInterval(cambios, 5000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { cambios(); enviar(); } });
  window.addEventListener('online', function () { cambios(); enviar(); subirPersonal(); });
})();
