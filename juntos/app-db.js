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
    var cumple = /^\d{4}-\d{2}-\d{2}$/.test(o.cumple || '') ? o.cumple : (perfil().cumples || {})[mail];
    if (o.cumple && cumple === o.cumple) { c.cumples = {}; c.cumples[mail] = cumple; }
    if (Object.keys(c).length) db.collection('juntos').doc('pareja').set(c, { merge: true });
    // El cumple queda agendado en el Calendario, todos los años (un solo evento por persona: si cambia la fecha o el apodo, se actualiza)
    if (cumple && (o.cumple || o.apodo !== undefined)) {
      var nom = String((o.apodo !== undefined ? o.apodo : (perfil().apodos || {})[mail]) || (YO.usuario.nombre || '').split(' ')[0] || mail).trim();
      var id = 'cumple_' + mail.toLowerCase().replace(/[^a-z0-9]/g, '_');
      var prev = window.__jxValor ? window.__jxValor('calendario\u0001' + id) : null;
      db.collection('calendario').doc(id).set({ id: id, titulo: 'Cumple de ' + nom, fecha: cumple, hora: '', tipo: 'cumple', quien: 'ambos', rep: 'anio', notas: '',
        creado: (prev && prev.creado) || Date.now(), autor: mail, editado: Date.now(), auto: 'cumple' });
    }
    publicarYo(YO);
  }
  window.guardarPerfilYo = guardarPerfilYo;
  // Cambiar el nombre que se muestra de uno de los dos (j / a), por ejemplo desde Ahorros
  window.ponerApodo = function (slot, nombre) {
    var e = window.JUNTOS && window.JUNTOS.emails && window.JUNTOS.emails[slot]; if (!e) return false;
    var c = { apodos: {} }; c.apodos[e] = String(nombre || '').trim().slice(0, 30) || { __op: 'delete' };
    db.collection('juntos').doc('pareja').set(c, { merge: true }); publicarYo(YO); return true;
  };
  function edad(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ''); if (!m) return null;
    var h = new Date(), e = h.getFullYear() - +m[1];
    if (h.getMonth() + 1 < +m[2] || (h.getMonth() + 1 === +m[2] && h.getDate() < +m[3])) e--;
    return e;
  }
  window.jxEdad = edad;
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
      miCumple: (mail && (pf.cumples || {})[mail]) || null,   // fecha de cumpleaños (AAAA-MM-DD)
      miEdad: edad(mail && (pf.cumples || {})[mail]),
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
      recibirBandeja(b.bandeja, b.msg_visto);
      if (b.precios) { PRECIOS = b.precios; wr('juntos_precios', b.precios); }
      avisoPorVencer();
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
  var PRECIOS = rd('juntos_precios', null);   // precios y datos de transferencia (vienen del servidor; se editan en el panel)
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

  function modalSuscripcion(dias) {
    if (document.getElementById('jxSus') || !document.body) return;
    var p = (window.JUNTOS && window.JUNTOS.pareja) || {}, pago = !!p.tuvo_pago;
    var porVencer = typeof dias === 'number';   // aviso de los últimos días de prueba (todavía puede usar todo)
    if (!document.getElementById('jxSusCss')) {
      var st = document.createElement('style'); st.id = 'jxSusCss';
      st.textContent =
        '#jxSus{--m-ac:var(--accent,#DB2777);--m-bg:var(--surface,#fff);--m-tx:var(--text,#1a1a1a);--m-tx2:var(--text2,#5f5f58);--m-bd:var(--border,rgba(0,0,0,.08));--m-s2:var(--surface2,#f5f5f0);--m-tint:color-mix(in srgb,var(--m-ac) 16%,var(--m-bg));--m-tint2:color-mix(in srgb,var(--m-ac) 30%,var(--m-bg));--m-sh:color-mix(in srgb,var(--m-ac) 30%,transparent);--m-x:color-mix(in srgb,var(--m-tx) 9%,transparent);position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;opacity:0;transition:opacity .2s;font-family:Nunito,system-ui,sans-serif}' +
        '#jxSus.on{opacity:1}' +
        '#jxSus .c{position:relative;box-sizing:border-box;background:var(--m-bg);color:var(--m-tx);width:100%;max-width:380px;max-height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;border-radius:10px 30px 10px 30px;padding:26px 22px 18px;text-align:center;transform:scale(.94);transition:transform .2s;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
        '#jxSus.on .c{transform:none}' +
        '#jxSus .ic{width:64px;height:64px;margin:0 auto 12px;border-radius:8px 22px 8px 22px;background:var(--m-tint);display:grid;place-items:center;font-size:2rem}' +
        '#jxSus h3{margin:0 0 6px;font-size:1.3rem;font-weight:900}' +
        '#jxSus p{margin:0 0 16px;color:var(--m-tx2);font-size:.95rem;line-height:1.45}' +
        '#jxSus .precio{display:inline-block;background:var(--m-s2);border-radius:6px 18px 6px 18px;padding:8px 14px;margin-bottom:16px;font-weight:900}' +
        '#jxSus .precio small{display:block;font-weight:700;color:var(--m-tx2);font-size:.78rem}' +
        '#jxSus .si{display:block;box-sizing:border-box;width:100%;border:0;border-radius:6px 20px 6px 20px;background:var(--m-ac);color:#fff;font:900 1.02rem Nunito,system-ui,sans-serif;padding:14px;cursor:pointer;text-decoration:none;box-shadow:0 8px 20px var(--m-sh)}' +
        '#jxSus .si:active{transform:scale(.97)}' +
        '#jxSus .fila{display:flex;justify-content:space-between;margin-top:12px}' +
        '#jxSus .cuenta{display:flex;justify-content:center;gap:5px;margin:0 0 14px}' +
        '#jxSus .cuenta i{width:26px;height:8px;border-radius:999px;background:var(--m-tint2)}#jxSus .cuenta i.on{background:var(--m-ac)}' +
        '#jxSus .dias{display:inline-block;font-size:2.4rem;font-weight:900;color:var(--m-ac);line-height:1}' +
        '#jxSus .fila.uno{justify-content:center}' +
        '#jxSus .x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;border-radius:50% !important;background:var(--m-x);color:var(--m-tx2);font:700 1.25rem/1 system-ui,sans-serif;display:grid;place-items:center;cursor:pointer;padding:0}' +
        '#jxSus .x:active{transform:scale(.92)}' +
        '@media (max-height:640px){#jxSus .c{padding:20px 18px 12px}#jxSus .ic{width:50px;height:50px;font-size:1.6rem;margin-bottom:8px}#jxSus p{margin-bottom:12px}#jxSus .precio{margin-bottom:12px}#jxSus .si{padding:12px}#jxSus .dias{font-size:2rem}}' +
        '#jxSus .planes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 6px}' +
        '#jxSus .pl{position:relative;border:2px solid var(--m-bd);background:var(--m-bg);color:var(--m-tx);border-radius:6px 18px 6px 18px;padding:12px 6px 10px;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:2px}' +
        '#jxSus .pl.on{border-color:var(--m-ac);background:var(--m-tint)}' +
        '#jxSus .pl b{font-size:1.15rem;font-weight:900}#jxSus .pl small{font-size:.74rem;font-weight:700;color:var(--m-tx2);line-height:1.25}' +
        '#jxSus .pl i{position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-style:normal;font-size:.6rem;font-weight:900;letter-spacing:.05em;background:#15803d;color:#fff;padding:2px 7px;border-radius:3px 9px 3px 9px}' +
        '#jxSus .dos{font-size:.78rem;font-weight:700;color:var(--m-tx2);margin:0 0 14px}' +
        '#jxSus .trf{margin-top:12px;text-align:left}' +
        '#jxSus .trf .ab{display:block;width:100%;border:1.5px dashed var(--m-bd);background:none;color:var(--m-tx);font:800 .92rem Nunito,system-ui,sans-serif;border-radius:6px 18px 6px 18px;padding:11px;cursor:pointer}' +
        '#jxSus .trf .dt{display:flex;flex-direction:column;gap:6px;margin-top:8px}#jxSus .trf .dt[hidden]{display:none}' +
        '#jxSus .trf .f{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--m-s2);border-radius:6px 16px 6px 16px;padding:8px 12px}' +
        '#jxSus .trf .f span{display:block;font-size:.68rem;font-weight:800;color:var(--m-tx2);text-transform:uppercase;letter-spacing:.05em}#jxSus .trf .f b{font-size:.92rem;word-break:break-all}' +
        '#jxSus .trf .cp{flex-shrink:0;border:1.5px solid var(--m-bd);background:var(--m-bg);color:var(--m-tx);font:800 .78rem Nunito,system-ui,sans-serif;border-radius:4px 12px 4px 12px;padding:6px 10px;cursor:pointer}' +
        '#jxSus .trf .cmp{margin:4px 0 0;font-size:.82rem}' +
        '#jxSus .fila a,#jxSus .fila button{background:none;border:0;color:var(--m-tx2);font:700 .9rem Nunito,system-ui,sans-serif;cursor:pointer;text-decoration:none;padding:6px}';
      document.head.appendChild(st);
    }
    var m = document.createElement('div'); m.id = 'jxSus'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    var boton = '<a class="si" href="' + (URL_SUSCRIPCION || '#') + '"' + (URL_SUSCRIPCION ? ' target="_blank" rel="noopener"' : '') + '>Suscribirme</a>';
    var X = '<button type="button" class="x no" aria-label="Cerrar" style="border-radius:50% !important">✕</button>';
    // Planes (mensual / anual con promo) y, si están cargados en el panel, los datos para transferir
    var PR = PRECIOS || {}, mm = +PR.mensual || 5000, aa = +PR.anual || 50000, ah = mm * 12 - aa;
    var pesos = function (n) { return '$' + Math.round(n).toLocaleString('es-AR'); };
    var precio = '<div class="planes"><button type="button" class="pl on" data-p="mensual"><b>' + pesos(mm) + '</b><small>por mes</small></button>' +
      '<button type="button" class="pl" data-p="anual">' + (ah > 0 ? '<i>PROMO</i>' : '') + '<b>' + pesos(aa) + '</b><small>por año' + (ah > 0 ? ' · ahorrás ' + pesos(ah) : '') + '</small></button></div>' +
      '<div class="dos">Una sola suscripción para los dos</div>';
    var tr = [['Alias', PR.alias], ['CBU / CVU', PR.cbu], ['Titular', PR.titular], ['Banco', PR.banco]].filter(function (x) { return x[1]; });
    if (PR.alias || PR.cbu) precio += '<div class="trf"><button type="button" class="ab">🏦 Pagar por transferencia</button><div class="dt" hidden>' +
      tr.map(function (x) { return '<div class="f"><div><span>' + x[0] + '</span><b>' + escH(x[1]) + '</b></div>' + (x[0] === 'Alias' || x[0] === 'CBU / CVU' ? '<button type="button" class="cp" data-c="' + escH(x[1]) + '">Copiar</button>' : '') + '</div>'; }).join('') +
      '<p class="cmp">Transferí <b class="mt">' + pesos(mm) + '</b> y mandanos el comprobante' + (PR.contacto ? ' a <b>' + escH(PR.contacto) + '</b>' : '') + '. Activamos tu suscripción apenas lo recibimos.</p></div></div>';
    if (porVencer) {
      var barras = ''; if (dias <= 7) for (var k = 7; k >= 1; k--) barras += '<i class="' + (k <= dias ? 'on' : '') + '"></i>';
      m.innerHTML = '<div class="c">' + X + '<div class="ic">⏳</div>' +
        '<h3>' + (dias <= 1 ? '¡Hoy es tu último día de prueba!' : 'Te quedan <span class="dias">' + dias + '</span> días de prueba') + '</h3>' +
        (barras ? '<div class="cuenta" aria-hidden="true">' + barras + '</div>' : '') +
        '<p>Todavía no te suscribiste. Activá la suscripción ahora y seguí usando JuntOS <b>sin cortes</b>: todo lo que cargaron queda igual.</p>' +
        precio + boton + '<div class="fila uno"><button type="button" class="no">Más tarde</button></div></div>';
    } else {
      m.innerHTML = '<div class="c">' + X + '<div class="ic">' + (pago ? '⏰' : '💞') + '</div>' +
        '<h3>' + (pago ? 'Tu suscripción venció' : 'Terminó tu prueba gratis') + '</h3>' +
        '<p>Para seguir usando JuntOS, activá la suscripción. <b>Todo lo que cargaron está guardado</b> y vuelve a estar disponible apenas la actives.</p>' +
        precio + boton + '<div class="fila"><a href="../entrar.html?cuenta=1">Ver mi cuenta</a><button type="button" class="no">Ahora no</button></div></div>';
    }
    function cerrar() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 200); }
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.no')) return cerrar();
      var pl = e.target.closest('.pl');   // elegir mensual / anual
      if (pl) { m.querySelectorAll('.pl').forEach(function (b) { b.classList.toggle('on', b === pl); }); var mt = m.querySelector('.mt'); if (mt) mt.textContent = pl.querySelector('b').textContent; return; }
      if (e.target.closest('.ab')) { var dt = m.querySelector('.trf .dt'); dt.hidden = !dt.hidden; if (!dt.hidden) setTimeout(function () { dt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 50); return; }
      var cp = e.target.closest('.cp');
      if (cp) { var t = cp.getAttribute('data-c'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { cp.textContent = '¡Copiado!'; setTimeout(function () { cp.textContent = 'Copiar'; }, 1500); }).catch(function () {}); }
    });
    m.querySelector('.si').addEventListener('click', function (e) { if (!URL_SUSCRIPCION) { e.preventDefault(); aviso('Muy pronto vas a poder suscribirte desde acá 💞'); } });
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('on'); });
  }
  window.jxSuscripcion = modalSuscripcion;

  /* Últimos 7 días de la prueba gratis sin suscripción: aviso cada vez que abren la app (una vez por apertura, en el inicio) */
  function avisoPorVencer() {
    if (!servidorOk || vencido() || !esLibre(paginaActual()) || /personajes|sonidos/i.test(paginaActual())) return;
    var p = (window.JUNTOS && window.JUNTOS.pareja) || {};
    if (p.plan !== 'prueba' || p.tuvo_pago) return;
    var d = +p.dias_restantes; if (!(d >= 1 && d <= 7)) return;
    try { if (sessionStorage.getItem('jx_aviso_prueba')) return; } catch (e) {}
    var intro = document.getElementById('intro');   // si está la animación de entrada, espero a que termine
    var esperar = function () { if (document.getElementById('jxMsg') || mostrando || (intro && document.body.contains(intro) && getComputedStyle(intro).display !== 'none' && getComputedStyle(intro).visibility !== 'hidden')) return setTimeout(esperar, 400); try { sessionStorage.setItem('jx_aviso_prueba', '1'); } catch (e) {} modalSuscripcion(d); };
    setTimeout(esperar, 600);
  }

  /* ---------- Casilla de notificaciones (ícono ✉️ del inicio, a la izquierda de Ajustes) ----------
     Junta los mensajes globales del panel de admin y los avisos automáticos de la pareja (prueba, vencimiento, etc.).
     Todo vive en la base: acá no se guarda nada salvo hasta qué mensaje global ya saltó como cartel. */
  var K_MSG = 'juntos_msgs';
  var MSG = { items: [], visto: +(rd(K_MSG, null) || {}).visto || 0 };
  function escH(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sinLeer() { return (MSG.items || []).filter(function (m) { return !m.leido; }); }
  // mensajes globales que todavía no saltaron como cartel al abrir la app
  function globalesNuevos() { return (MSG.items || []).filter(function (m) { return !m.leido && ((m.tipo === 'mensaje' && m.id > (MSG.visto || 0)) || m.tipo === 'directo'); }); }
  function recibirBandeja(items, vistoSrv) {
    MSG = { items: Array.isArray(items) ? items : [], visto: Math.max(+MSG.visto || 0, +vistoSrv || 0) };
    wr(K_MSG, { visto: MSG.visto }); botonMensajes(); mostrarMensajesNuevos();
  }
  function marcarLeidos(ks) {
    if (ks !== 'todo') ks = ks.filter(function (k) { return (MSG.items || []).some(function (m) { return m.k === k && !m.leido; }); });
    if (ks !== 'todo' && !ks.length) return;
    (MSG.items || []).forEach(function (m) { if (ks === 'todo' || ks.indexOf(m.k) >= 0) m.leido = true; });
    botonMensajes();
    pedir('leido', { k: ks }).catch(function () {});
  }
  function marcarCartelVisto() {
    var max = 0; (MSG.items || []).forEach(function (m) { if (m.tipo === 'mensaje' && m.id > max) max = m.id; });
    if (max <= (MSG.visto || 0)) return;
    MSG.visto = max; wr(K_MSG, { visto: max });
    pedir('mensaje_visto', { id: max }).catch(function () {});
  }
  function cssMensajes() {
    if (document.getElementById('jxMsgCss')) return;
    var st = document.createElement('style'); st.id = 'jxMsgCss';
    st.textContent =
      '#jxMsg{--m-ac:var(--accent,#DB2777);--m-bg:var(--surface,#fff);--m-tx:var(--text,#1a1a1a);--m-tx2:var(--text2,#5f5f58);--m-bd:var(--border,rgba(0,0,0,.08));--m-tint:color-mix(in srgb,var(--m-ac) 16%,var(--m-bg));--m-nl:color-mix(in srgb,var(--m-ac) 7%,var(--m-bg));--m-x:color-mix(in srgb,var(--m-tx) 9%,transparent);' +
        'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;opacity:0;transition:opacity .2s;font-family:Nunito,system-ui,sans-serif}' +
      '#jxMsg.on{opacity:1}' +
      '#jxMsg .c{position:relative;box-sizing:border-box;background:var(--m-bg);color:var(--m-tx);width:100%;max-width:400px;max-height:100%;display:flex;flex-direction:column;border-radius:10px 30px 10px 30px;padding:22px 0 14px;transform:scale(.94);transition:transform .2s;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
      '#jxMsg.on .c{transform:none}' +
      '#jxMsg .cab{padding:0 56px 10px 20px;font:900 .78rem Nunito,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--m-ac)}' +
      '#jxMsg .lst{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 12px;flex:1;min-height:0}' +
      '#jxMsg .m{position:relative;padding:12px 10px;border-top:1px solid var(--m-bd);border-radius:6px 18px 6px 18px}#jxMsg .m:first-child{border-top-color:transparent}' +
      '#jxMsg .m.nl{background:var(--m-nl);border-top-color:transparent;cursor:pointer}#jxMsg .m.nl+.m{border-top-color:transparent}' +
      '#jxMsg .m.nl::after{content:"";position:absolute;top:16px;right:12px;width:9px;height:9px;border-radius:50%;background:var(--m-ac)}' +
      '#jxMsg .m .t{display:flex;align-items:flex-start;gap:10px;padding-right:14px}' +
      '#jxMsg .m .e{flex-shrink:0;width:44px;height:44px;border-radius:6px 16px 6px 16px;background:var(--m-tint);display:grid;place-items:center;font-size:1.5rem}' +
      '#jxMsg .m h3{margin:0;font-size:1.05rem;font-weight:800;line-height:1.25}#jxMsg .m.nl h3{font-weight:900}' +
      '#jxMsg .m small{display:block;color:var(--m-tx2);font-weight:700;font-size:.78rem;margin-top:2px}' +
      '#jxMsg .m p{margin:8px 0 0;color:var(--m-tx);opacity:.9;font-size:.96rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '#jxMsg .m .ir{display:inline-block;margin-top:8px;color:var(--m-ac);font:800 .9rem Nunito,system-ui,sans-serif;text-decoration:none;background:none;border:0;padding:0;cursor:pointer}' +
      '#jxMsg .ok{display:block;box-sizing:border-box;width:calc(100% - 40px);margin:12px 20px 0;border:0;border-radius:6px 20px 6px 20px;background:var(--m-ac);color:#fff;font:900 1rem Nunito,system-ui,sans-serif;padding:13px;cursor:pointer}' +
      '#jxMsg .todo{display:block;margin:10px auto 0;background:none;border:0;color:var(--m-tx2);font:800 .88rem Nunito,system-ui,sans-serif;cursor:pointer;padding:6px}' +
      '#jxMsg .x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;background:var(--m-x);color:var(--m-tx2);font:700 1.25rem/1 system-ui,sans-serif;display:grid;place-items:center;cursor:pointer;padding:0}' +
      '#jxMsg .x:active,#jxMsg .ok:active{transform:scale(.95)}' +
      '#jxMsg .vacio{color:var(--m-tx2);text-align:center;padding:26px 10px;font-weight:700}#jxMsg .vacio div{font-size:2.4rem;margin-bottom:6px}' +
      '#jxMsgBtn{width:44px;height:44px;border:none;background:none;color:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;position:relative;padding:0;transition:transform .12s ease}' +
      '#jxMsgBtn svg{width:28px;height:28px;display:block}#jxMsgBtn:active{transform:scale(.88)}' +
      '#jxMsgBtn .n{position:absolute;top:3px;right:2px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--err,#E24B4A);color:#fff;font:900 11px/14px Nunito,system-ui,sans-serif;text-align:center;border:2px solid var(--surface,#fff)}';
    document.head.appendChild(st);
  }
  function fechaMsg(iso) {
    try {
      var d = new Date(iso), h = new Date(), ay = new Date(h.getTime() - 86400000);
      var hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (d.toDateString() === h.toDateString()) return 'Hoy · ' + hora;
      if (d.toDateString() === ay.toDateString()) return 'Ayer · ' + hora;
      return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: d.getFullYear() === h.getFullYear() ? undefined : 'numeric' });
    } catch (e) { return ''; }
  }
  // lista: lo que se muestra; casilla: true = la casilla completa (con no leídos), false = cartel de mensajes nuevos al abrir
  function modalMensajes(lista, titulo, casilla) {
    if (document.getElementById('jxMsg') || !document.body) return;
    cssMensajes();
    var m = document.createElement('div'); m.id = 'jxMsg'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    var items = lista.length ? lista.map(function (x) {
      var url = x.url && /^[a-z0-9_-]+\.html([#?].*)?$/i.test(x.url) && !/^index\.html$/i.test(x.url) ? x.url : '';
      return '<div class="m' + (casilla && !x.leido ? ' nl' : '') + '" data-k="' + escH(x.k) + '"><div class="t"><div class="e">' + escH(x.emoji || '🔔') + '</div><div><h3>' + escH(x.titulo) +
        '</h3><small>' + escH(fechaMsg(x.creado)) + '</small></div></div>' + (x.texto ? '<p>' + escH(x.texto) + '</p>' : '') +
        (x.url === '#suscribir' ? '<button type="button" class="ir sus">Suscribirme →</button>' : url ? '<a class="ir" href="' + escH(url) + '">Ver →</a>' : '') + '</div>';
    }).join('') : '<div class="vacio"><div>📭</div>No tenés notificaciones</div>';
    var haySinLeer = casilla && lista.some(function (x) { return !x.leido; });
    m.innerHTML = '<div class="c"><button type="button" class="x" aria-label="Cerrar" style="border-radius:50% !important">✕</button>' +
      '<div class="cab">' + escH(titulo) + '</div><div class="lst">' + items + '</div><button type="button" class="ok">' + (casilla ? 'Cerrar' : 'Entendido') + '</button>' +
      (haySinLeer ? '<button type="button" class="todo">Marcar todo como leído</button>' : '') + '</div>';
    function cerrar() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 200); }
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.x') || e.target.closest('.ok')) return cerrar();
      if (e.target.closest('.sus')) {   // aviso de prueba/vencimiento → suscribirse (por ahora abre el cartel de suscripción)
        var mi = e.target.closest('.m'); if (mi && mi.classList.contains('nl')) { mi.classList.remove('nl'); marcarLeidos([mi.getAttribute('data-k')]); }
        if (URL_SUSCRIPCION) { window.open(URL_SUSCRIPCION, '_blank', 'noopener'); return; }
        var pj = (window.JUNTOS && window.JUNTOS.pareja) || {}, dr = +pj.dias_restantes;
        cerrar(); setTimeout(function () { modalSuscripcion(!vencido() && dr >= 1 ? dr : undefined); }, 220); return;
      }
      if (e.target.closest('.todo')) { marcarLeidos('todo'); m.querySelectorAll('.m.nl').forEach(function (n) { n.classList.remove('nl'); }); e.target.remove(); return; }
      var it = e.target.closest('.m.nl');   // tocar un aviso no leído lo marca como leído
      if (it) { it.classList.remove('nl'); marcarLeidos([it.getAttribute('data-k')]); if (!m.querySelector('.m.nl')) { var t = m.querySelector('.todo'); if (t) t.remove(); } }
    });
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('on'); });
    if (!casilla) { marcarCartelVisto(); marcarLeidos(lista.map(function (x) { return x.k; })); }
  }
  window.jxMensajes = function () { modalMensajes(MSG.items || [], 'Notificaciones', true); };
  var mostrando = false;
  // Al abrir la app: los mensajes globales nuevos salen como cartel (los avisos automáticos solo quedan en la casilla)
  function mostrarMensajesNuevos() {
    if (mostrando || !globalesNuevos().length || /personajes|sonidos/i.test(paginaActual())) return;
    mostrando = true;
    var esperar = function () {
      var intro = document.getElementById('intro');
      var ocupado = !document.body || document.getElementById('jxSus') ||
        (intro && document.body.contains(intro) && getComputedStyle(intro).display !== 'none' && getComputedStyle(intro).visibility !== 'hidden');
      if (ocupado) return setTimeout(esperar, 400);
      mostrando = false;
      var nuevos = globalesNuevos(); if (!nuevos.length) return;
      modalMensajes(nuevos, nuevos.length > 1 ? 'Mensajes nuevos' : 'Mensaje nuevo', false);
    };
    setTimeout(esperar, 500);
  }
  // Ícono en el inicio, a la izquierda de Ajustes, con la cantidad sin leer
  function botonMensajes() {
    if (!document.body || !YO) return;
    var gear = document.querySelector('.botones .gear'); if (!gear) return;
    cssMensajes();
    var b = document.getElementById('jxMsgBtn');
    if (!b) {
      b = document.createElement('button'); b.id = 'jxMsgBtn'; b.type = 'button';
      b.style.setProperty('border-radius', '10px', 'important');
      b.onclick = window.jxMensajes;
      gear.parentNode.insertBefore(b, gear);
    }
    var n = sinLeer().length;
    b.setAttribute('aria-label', n ? 'Notificaciones (' + n + ' sin leer)' : 'Notificaciones');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.8 7l8.2 6 8.2-6"/></svg>' +
      (n ? '<span class="n">' + (n > 9 ? '9+' : n) + '</span>' : '');
  }
  document.addEventListener('DOMContentLoaded', botonMensajes);
  // Si la app vuelve del segundo plano, me fijo si llegó algo nuevo
  var ultMsgCheck = Date.now();
  function revisarMensajes() {
    if (!servidorOk || Date.now() - ultMsgCheck < 60000) return;
    ultMsgCheck = Date.now();
    pedir('bandeja').then(function (r) { if (r && r.bandeja) recibirBandeja(r.bandeja, r.msg_visto); }).catch(function () {});
  }

  function bandaSoloLectura() {
    revisarBloqueo();
    var ya = document.getElementById('juntosRO');
    if (!vencido()) { if (ya) ya.remove(); return; }
    if (ya || !document.body) return;
    var p = (window.JUNTOS && window.JUNTOS.pareja) || {};
    var a = document.createElement('button'); a.id = 'juntosRO'; a.type = 'button';
    a.textContent = (p.tuvo_pago ? '⏰ Venció tu suscripción' : '⏰ Terminó tu prueba gratis') + ' · Tocá acá';
    a.onclick = modalSuscripcion;
    a.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;border:0;width:100%;cursor:pointer;background:var(--accent,#DB2777);color:#fff;font:800 13px Nunito,system-ui,sans-serif;text-align:center;padding:calc(7px + env(safe-area-inset-top)) 10px 7px';
    document.body.appendChild(a);
  }
  document.addEventListener('DOMContentLoaded', bandaSoloLectura);

  /* ---------- Arranque y actualización periódica ---------- */
  boot();
  var sincTimer = setInterval(cambios, 5000);
  // Una pantalla puede pedir sincronizar más seguido mientras está abierta (ej.: los dados de a dos). Sin argumento vuelve a 5 s.
  window.jxSyncCada = function (ms) { clearInterval(sincTimer); sincTimer = setInterval(cambios, Math.max(1000, ms || 5000)); };
  window.jxAvisarPareja = function (o) { return pedir('avisar_pareja', o); };
  // Contenido extra (Coaching / Intimidad) cargado desde el panel: primero lo guardado, después lo del servidor
  window.jxContenido = function (cb) {
    var c = rd('juntos_contenido', null); if (c) cb(c);
    pedir('contenido').then(function (r) { if (JSON.stringify(r) !== JSON.stringify(c)) { wr('juntos_contenido', r); cb(r); } }).catch(function () {});
  };
  window.jxPrivado = { leer: function (clave) { return pedir('privado&clave=' + encodeURIComponent(clave)); }, guardar: function (clave, data) { return pedir('privado', { clave: clave, data: data }); } };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { cambios(); enviar(); revisarMensajes(); } });
  window.addEventListener('online', function () { cambios(); enviar(); subirPersonal(); });
})();
