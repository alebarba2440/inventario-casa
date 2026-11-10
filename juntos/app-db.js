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
    'ultima-categoria', 'sonidos', 'personajes_v1', 'copito_anios', 'viaje_sel', 'personaje'];

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
  var FIJO = { j: 'gionejulieta@gmail.com', a: 'alejandrobarba021@gmail.com' };
  var PERFIL_K = 'juntos\u0001pareja';
  function perfil() { var v = window.__jxValor ? window.__jxValor(PERFIL_K) : null; return (v && typeof v === 'object') ? v : {}; }
  function miembrosOrdenados(y) {
    var ms = ((y && y.pareja && y.pareja.miembros) || []).slice();
    if (perfil().invertido) { ms = [ms[1] || null, ms[0] || null]; }
    // Pareja fija (Juli y Ale): Juli siempre es "j" y Ale siempre "a", en todas las secciones.
    var em = function (m) { return m && String(m.email || '').toLowerCase(); };
    var ju = ms.filter(function (m) { return em(m) === FIJO.j; })[0], al = ms.filter(function (m) { return em(m) === FIJO.a; })[0];
    if (ju || al) {
      var otro = ms.filter(function (m) { return m && m !== ju && m !== al; })[0] || null;
      ms = [ju || otro, al || (ju ? otro : null)];
    }
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
  var servidorOk = false;
  // Mi nombre/apodo y si soy "él" o "ella" (se guardan en el perfil compartido de la pareja, por mail)
  function guardarPerfilYo(o) {
    var mail = YO && YO.usuario && YO.usuario.email; if (!mail) return;
    var c = {};
    if (o.apodo !== undefined) { c.apodos = {}; c.apodos[mail] = String(o.apodo || '').trim().slice(0, 30) || { __op: 'delete' }; }
    if (o.genero === 'f' || o.genero === 'm') { c.generos = {}; c.generos[mail] = o.genero; }
    if (Object.keys(c).length) db.collection('juntos').doc('pareja').set(c, { merge: true });
    publicarYo(YO);
  }
  window.guardarPerfilYo = guardarPerfilYo;
  // Cambiar el nombre que se muestra de uno de los dos (j / a), por ejemplo desde Ahorros
  window.ponerApodo = function (slot, nombre) {
    var e = window.JUNTOS && window.JUNTOS.emails && window.JUNTOS.emails[slot]; if (!e) return false;
    var c = { apodos: {} }; c.apodos[e] = String(nombre || '').trim().slice(0, 30) || { __op: 'delete' };
    db.collection('juntos').doc('pareja').set(c, { merge: true }); publicarYo(YO); return true;
  };
  function publicarYo(y) {
    var ms = miembrosOrdenados(y);
    var pn = function (m) { return m ? String(m.nombre || m.email || '').split(' ')[0] : ''; };
    var mail = y && y.usuario && y.usuario.email;
    var pf = perfil(), ap = pf.apodos || {}, gn = pf.generos || {};
    var apodo = function (m) { var x = m && ap[m.email]; return x ? String(x).slice(0, 30) : null; };
    var apodos = { j: apodo(ms[0]), a: apodo(ms[1]) };
    window.JUNTOS = {
      usuario: y && y.usuario, pareja: y && y.pareja,
      nombres: (ms[0] || ms[1]) ? { j: apodos.j || pn(ms[0]) || 'Yo', a: apodos.a || pn(ms[1]) || 'Pareja' } : null,
      apodos: apodos,   // nombre o apodo elegido en la app (manda sobre cualquier otro nombre)
      generos: { j: (ms[0] && gn[ms[0].email]) || null, a: (ms[1] && gn[ms[1].email]) || null },
      miGenero: (mail && gn[mail]) || null,
      perfilListo: !!servidorOk,   // ya llegó lo del servidor (para no preguntar de más con datos viejos)
      fotos: (ms[0] || ms[1]) ? { j: (ms[0] && ms[0].foto) || '', a: (ms[1] && ms[1].foto) || '' } : null,
      miSlot: mail ? (ms[0] && ms[0].email === mail ? 'j' : ms[1] && ms[1].email === mail ? 'a' : null) : null,
      emails: { j: (ms[0] && ms[0].email) || '', a: (ms[1] && ms[1].email) || '' },
      invertido: !!perfil().invertido,
      soloLectura: !!(y && y.pareja && y.pareja.solo_lectura)
    };
    var pp = perfil().personajes || {};
    window.JUNTOS.personajes = { j: (ms[0] && pp[ms[0].email]) || null, a: (ms[1] && pp[ms[1].email]) || null };
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
  if (paginaBloqueada()) document.documentElement.style.visibility = 'hidden';   // vencido (según lo guardado): no mostrar la sección mientras redirige
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
    var cambiadas = [], vk = cache.vk || (cache.vk = {});
    (r.docs || []).forEach(function (d) {
      var k = clave(d.c, d.i);
      // Una respuesta vieja (pedida antes de un cambio) no puede pisar algo más nuevo: así lo borrado no "revive"
      if (d.v && vk[k] && d.v < vk[k]) return;
      if (d.v) vk[k] = d.v;
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
      aplicarDocs(b); servidorOk = true;
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
  // Publica mi color y mi personaje (avatar), para que mi pareja vea lo mío así.
  // Cada uno solo publica lo suyo: nadie puede elegir por el otro.
  function miColor() {
    try {
      var mail = YO && YO.usuario && YO.usuario.email; if (!mail) return;
      var c = hex((JSON.parse(lget('cfg_v2') || '{}') || {}).accent) || '#1D9E75', pj = lget('personaje') || null, pf = perfil(), cambios = {};
      if ((pf.colores || {})[mail] !== c) { cambios.colores = {}; cambios.colores[mail] = c; }
      if (pj && (pf.personajes || {})[mail] !== pj) { cambios.personajes = {}; cambios.personajes[mail] = pj; }
      if (Object.keys(cambios).length) db.collection('juntos').doc('pareja').set(cambios, { merge: true });
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
        if (e.status === 402) { if (YO && YO.pareja) YO.pareja.solo_lectura = true; publicarYo(YO); bandaSoloLectura(); modalSuscripcion(); }
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
    if (!silencio && (k === 'cfg_v2' || k === 'personaje') && sincronizado) setTimeout(miColor, 0);
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
  /* ---------- Período vencido: se ven las tarjetas del inicio, pero no se entra a ninguna sección.
     Opciones (ajustes del inicio, personaje, sonidos) y la cuenta siguen andando. ---------- */
  var URL_SUSCRIPCION = '';   // link de pago (Mercado Pago): cuando esté, el botón "Suscribirme" lleva ahí
  function vencido() { return !!(window.JUNTOS && window.JUNTOS.soloLectura); }
  function esLibre(pagina) { return ['', 'index.html', 'personajes.html', 'sonidos.html'].indexOf(String(pagina || '').toLowerCase()) >= 0; }
  function paginaActual() { return location.pathname.split('/').pop(); }
  function paginaBloqueada() { return vencido() && !esLibre(paginaActual()); }
  function revisarBloqueo() {
    if (!vencido()) { document.documentElement.style.visibility = ''; return; }
    if (paginaBloqueada()) { location.replace('index.html?vencido=1'); return; }
    if (/[?&]vencido=1/.test(location.search)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} modalSuscripcion(); }
  }
  // tocar una tarjeta (o cualquier link a una sección) con el período vencido → modal en vez de entrar
  document.addEventListener('click', function (e) {
    if (!vencido() || !e.target.closest) return;
    var a = e.target.closest('a[href]'); if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:|#|\.\.\/)/.test(h)) return;
    var dest = h.split('#')[0].split('?')[0].split('/').pop();
    if (!/\.html$/i.test(dest) || esLibre(dest)) return;
    e.preventDefault(); e.stopPropagation(); modalSuscripcion();
  }, true);

  function modalSuscripcion() {
    if (document.getElementById('jxSus') || !document.body) return;
    var p = (window.JUNTOS && window.JUNTOS.pareja) || {}, pago = !!p.tuvo_pago;
    if (!document.getElementById('jxSusCss')) {
      var st = document.createElement('style'); st.id = 'jxSusCss';
      st.textContent =
        '#jxSus{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;transition:opacity .2s;font-family:Nunito,system-ui,sans-serif}' +
        '#jxSus.on{opacity:1}' +
        '#jxSus .c{background:#fff;color:#1a1a1a;width:100%;max-width:380px;border-radius:10px 30px 10px 30px;padding:26px 22px 18px;text-align:center;transform:scale(.94);transition:transform .2s;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
        '#jxSus.on .c{transform:none}' +
        '#jxSus .ic{width:64px;height:64px;margin:0 auto 12px;border-radius:8px 22px 8px 22px;background:#FCE7F3;display:grid;place-items:center;font-size:2rem}' +
        '#jxSus h3{margin:0 0 6px;font-size:1.3rem;font-weight:900}' +
        '#jxSus p{margin:0 0 16px;color:#5f5f58;font-size:.95rem;line-height:1.45}' +
        '#jxSus .precio{display:inline-block;background:#FFF7E6;border-radius:6px 18px 6px 18px;padding:8px 14px;margin-bottom:16px;font-weight:900}' +
        '#jxSus .precio small{display:block;font-weight:700;color:#5f5f58;font-size:.78rem}' +
        '#jxSus .si{display:block;width:100%;border:0;border-radius:6px 20px 6px 20px;background:#DB2777;color:#fff;font:900 1.02rem Nunito,system-ui,sans-serif;padding:14px;cursor:pointer;text-decoration:none;box-shadow:0 8px 20px rgba(219,39,119,.3)}' +
        '#jxSus .si:active{transform:scale(.97)}' +
        '#jxSus .fila{display:flex;justify-content:space-between;margin-top:12px}' +
        '#jxSus .fila a,#jxSus .fila button{background:none;border:0;color:#5f5f58;font:700 .9rem Nunito,system-ui,sans-serif;cursor:pointer;text-decoration:none;padding:6px}' +
        '@media (prefers-color-scheme:dark){#jxSus .c{background:#1c1c1e;color:#f5f5f5}#jxSus p,#jxSus .fila a,#jxSus .fila button,#jxSus .precio small{color:#aaa}#jxSus .precio{background:#2c2c2e}#jxSus .ic{background:rgba(219,39,119,.2)}}';
      document.head.appendChild(st);
    }
    var m = document.createElement('div'); m.id = 'jxSus'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="c"><div class="ic">' + (pago ? '⏰' : '💞') + '</div>' +
      '<h3>' + (pago ? 'Tu suscripción venció' : 'Terminó tu prueba gratis') + '</h3>' +
      '<p>Para seguir usando JuntOS, activá la suscripción. <b>Todo lo que cargaron está guardado</b> y vuelve a estar disponible apenas la actives.</p>' +
      '<div class="precio">$5.000 / mes<small>Una sola suscripción para los dos</small></div>' +
      '<a class="si" href="' + (URL_SUSCRIPCION || '#') + '"' + (URL_SUSCRIPCION ? ' target="_blank" rel="noopener"' : '') + '>Suscribirme</a>' +
      '<div class="fila"><a href="../entrar.html?cuenta=1">Ver mi cuenta</a><button type="button" class="no">Ahora no</button></div></div>';
    function cerrar() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 200); }
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.no')) cerrar(); });
    m.querySelector('.si').addEventListener('click', function (e) { if (!URL_SUSCRIPCION) { e.preventDefault(); aviso('Muy pronto vas a poder suscribirte desde acá 💞'); } });
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('on'); });
  }
  window.jxSuscripcion = modalSuscripcion;

  function bandaSoloLectura() {
    revisarBloqueo();
    var ya = document.getElementById('juntosRO');
    if (!vencido()) { if (ya) ya.remove(); return; }
    if (ya || !document.body) return;
    var p = (window.JUNTOS && window.JUNTOS.pareja) || {};
    var a = document.createElement('button'); a.id = 'juntosRO'; a.type = 'button';
    a.textContent = (p.tuvo_pago ? '⏰ Venció tu suscripción' : '⏰ Terminó tu prueba gratis') + ' · Tocá acá';
    a.onclick = modalSuscripcion;
    a.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;border:0;width:100%;cursor:pointer;background:#DB2777;color:#fff;font:800 13px Nunito,system-ui,sans-serif;text-align:center;padding:calc(7px + env(safe-area-inset-top)) 10px 7px';
    document.body.appendChild(a);
  }
  document.addEventListener('DOMContentLoaded', bandaSoloLectura);

  /* ---------- Arranque y actualización periódica ---------- */
  boot();
  setInterval(cambios, 5000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { cambios(); enviar(); } });
  window.addEventListener('online', function () { cambios(); enviar(); subirPersonal(); });
})();
