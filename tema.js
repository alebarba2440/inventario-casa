/* Aplica en cualquier página los ajustes elegidos en el inicio (color, modo y tamaño de texto). */
(function () {
  try {
    const c = JSON.parse(localStorage.getItem('cfg_v2') || '{}');
    const r = document.documentElement;
    if (c.accent) {
      r.style.setProperty('--accent', c.accent);
      if (c.accentD) r.style.setProperty('--accent-dark', c.accentD);
      if (c.accentL) r.style.setProperty('--accent-light', c.accentL);
    }
    r.setAttribute('data-theme', c.theme === 'dark' ? 'dark' : 'light'); // sin modo automático
    if (c.fontSize) r.style.fontSize = (parseFloat(c.fontSize) * 100) + '%';
  } catch (e) {}
  barraDeColor();
})();

/* Color de la barra de arriba (la ventana de la app instalada en la compu y la barra del celu):
   el color principal elegido en la app; en modo oscuro, negro. Se llama de nuevo al cambiar color o modo. */
function barraDeColor() {
  try {
    const c = JSON.parse(localStorage.getItem('cfg_v2') || '{}');
    const col = c.theme === 'dark' ? '#111111' : (c.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D9E75');
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = col;
  } catch (e) {}
}
window.barraDeColor = barraDeColor;

/* Interruptores deslizantes: cualquier contenedor con la clase "desliz" recibe una pastilla de color
   que se desliza hasta el botón activo (clase on, active, sel-add o sel-rem). */
(function () {
  const ACT = ['on', 'active', 'sel-add', 'sel-rem'];
  function sync(sw) {
    const btns = [...sw.children].filter(b => b.tagName === 'BUTTON');
    if (!btns.length) return;
    let k = sw.querySelector(':scope > .sw-knob');
    if (!k) { k = document.createElement('span'); k.className = 'sw-knob'; sw.prepend(k); }
    const i = btns.findIndex(b => ACT.some(c => b.classList.contains(c)));
    sw.style.setProperty('--n', btns.length);
    sw.style.setProperty('--i', Math.max(0, i));
    k.style.opacity = i < 0 ? '0' : '1';
    k.style.background = (i >= 0 && btns[i].dataset.kc) || '';
  }
  function all() { document.querySelectorAll('.desliz').forEach(sync); }
  document.addEventListener('DOMContentLoaded', () => {
    all();
    new MutationObserver(ms => {
      const set = new Set();
      ms.forEach(m => { const sw = m.target.closest && m.target.closest('.desliz'); if (sw) set.add(sw); });
      set.forEach(sync);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  window.syncSwitches = all;
})();

/* Ventanas comunes de toda la app (en lugar de alert / confirm / prompt del navegador), con la estética de JuntOS:
   preguntar(titulo, mensaje, alConfirmar, textoBoton)          → confirmar borrar (botón rojo), como siempre
   confirmar(titulo, mensaje, {boton, peligro, icono}) → Promise<true/false>
   avisar(titulo, mensaje, {icono, boton})             → Promise (se cierra con "Entendido")
   pedirTexto(titulo, mensaje, {valor, boton, placeholder}) → Promise<texto | null> */
(function () {
  const css = `.pq-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100050;opacity:0;pointer-events:none;transition:opacity .18s}
.pq-bg.show{opacity:1;pointer-events:auto}
.pq{background:var(--surface,#fff);color:var(--text,#222);border-radius:10px 28px 10px 28px;padding:24px 20px 18px;width:100%;max-width:350px;max-height:calc(100dvh - 40px);overflow-y:auto;text-align:center;box-shadow:0 16px 44px rgba(0,0,0,.28);transform:scale(.92);transition:transform .18s;font-family:'Nunito',system-ui,sans-serif}
.pq-bg.show .pq{transform:scale(1)}
.pq-ic{width:56px;height:56px;border-radius:8px 20px 8px 20px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:1.7rem;background:var(--accent-light,#E1F5EE);color:var(--accent,#1D9E75)}
.pq.peligro .pq-ic{background:#fdecec;color:#d64545}
.pq-ic svg{width:28px;height:28px}
.pq h3{margin:0 0 6px;font-size:1.12rem;font-weight:900}
.pq p{margin:0 0 18px;font-size:.93rem;color:var(--text2,#666);line-height:1.45;white-space:pre-line}
.pq input{display:block;width:100%;box-sizing:border-box;margin:-6px 0 16px;font:inherit;font-size:1rem;font-weight:700;padding:12px;border-radius:12px;border:1.5px solid var(--border2,#ddd);background:var(--surface2,#f5f5f0);color:inherit;outline:none}
.pq input:focus{border-color:var(--accent,#1D9E75)}
.pq input[hidden],.pq p[hidden],.pq button[hidden]{display:none}
.pq-b{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pq-b.uno{grid-template-columns:1fr}
.pq-b button{border:none;border-radius:6px 18px 6px 18px;padding:13px;font-family:inherit;font-weight:800;font-size:.95rem;cursor:pointer}
.pq-b button:active{transform:scale(.97)}
.pq-no{background:var(--surface2,#eee);color:var(--text,#222)}
.pq-si{background:var(--accent,#1D9E75);color:#fff}
.pq.peligro .pq-si{background:#d64545}`;
  const TACHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  let bg, fin = null;
  function armar() {
    if (bg) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    bg = document.createElement('div'); bg.className = 'pq-bg';
    bg.innerHTML = '<div class="pq" role="dialog" aria-modal="true"><div class="pq-ic"></div><h3></h3><p></p><input hidden><div class="pq-b"><button class="pq-no">Cancelar</button><button class="pq-si">Aceptar</button></div></div>';
    document.body.appendChild(bg);
    bg.querySelector('.pq-no').onclick = () => cerrar(false);
    bg.addEventListener('click', e => { if (e.target === bg) cerrar(false); });
    bg.querySelector('.pq-si').onclick = () => cerrar(true);
    bg.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cerrar(true); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && bg.classList.contains('show')) cerrar(false); });
  }
  function cerrar(ok) { bg.classList.remove('show'); const f = fin; fin = null; if (f) f(ok); }
  function abrir(o) {
    armar(); if (fin) cerrar(false);
    const pq = bg.querySelector('.pq'), inp = bg.querySelector('input');
    pq.classList.toggle('peligro', !!o.peligro);
    bg.querySelector('.pq-ic').innerHTML = o.icono || (o.peligro ? TACHO : '💞');
    bg.querySelector('h3').textContent = o.titulo || '';
    const p = bg.querySelector('p'); p.textContent = o.msg || ''; p.hidden = !o.msg;
    inp.hidden = !o.input; if (o.input) { inp.value = o.valor || ''; inp.placeholder = o.placeholder || ''; }
    bg.querySelector('.pq-no').hidden = !!o.solo; bg.querySelector('.pq-b').classList.toggle('uno', !!o.solo);
    bg.querySelector('.pq-si').textContent = o.boton || 'Aceptar';
    return new Promise(res => {
      fin = ok => res(o.input ? (ok ? inp.value : null) : ok);
      requestAnimationFrame(() => bg.classList.add('show'));
      if (o.input) setTimeout(() => { inp.focus(); inp.select(); }, 60);
    });
  }
  window.preguntar = function (titulo, msg, alConfirmar, boton) {
    abrir({ titulo: titulo || '¿Estás segura?', msg, boton: boton || 'Sí, eliminar', peligro: true }).then(ok => { if (ok && alConfirmar) alConfirmar(); });
  };
  window.confirmar = (titulo, msg, o = {}) => abrir(Object.assign({ titulo, msg, boton: 'Aceptar' }, o));
  window.avisar = (titulo, msg, o = {}) => abrir(Object.assign({ titulo, msg, boton: 'Entendido', solo: true, icono: 'ℹ️' }, o));
  window.pedirTexto = (titulo, msg, o = {}) => abrir(Object.assign({ titulo, msg, boton: 'Guardar', input: true, icono: '✏️' }, o));
})();

/* Separador de miles dentro de cuentas: "2000+1500" se muestra "2.000+1.500".
   ptsTexto(texto) devuelve el texto con puntos; ptsCampo(input) lo arregla en el campo sin mover el cursor. */
window.ptsTexto = function (t) {
  return String(t ?? '').replace(/(^|[^\d,.])(\d[\d.]*)/g, (m, pre, num) => {
    const d = num.replace(/\./g, '');
    return pre + (d.length > 3 ? (+d).toLocaleString('es-AR') : d);
  });
};
window.ptsCampo = function (el) {
  const v = el.value, pos = el.selectionStart ?? v.length;
  const nuevo = window.ptsTexto(v);
  if (nuevo === v) return v;
  // mantener el cursor después de la misma cantidad de caracteres que no son puntos
  const antes = v.slice(0, pos).replace(/\./g, '').length;
  let i = 0, c = 0;
  while (i < nuevo.length && c < antes) { if (nuevo[i] !== '.') c++; i++; }
  el.value = nuevo;
  try { el.setSelectionRange(i, i); } catch (e) {}
  return nuevo;
};

/* Campos con cuentas (ej. 2.000+1.500): mientras no estás escribiendo muestran el total (3.500);
   al tocarlos vuelve a aparecer la cuenta para poder editarla. */
(function () {
  const OPS = /\d\s*[+\-*/]\s*[\d(]/;
  function calc(x) {
    let s = String(x ?? '').trim(); if (!s) return NaN;
    s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
    if (!/^[0-9+\-*/().\s]+$/.test(s)) return NaN;
    try { const v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? v : NaN; } catch (e) { return NaN; }
  }
  const esCampo = el => el && el.tagName === 'INPUT' && /decimal|numeric/.test(el.inputMode || el.getAttribute('inputmode') || '');
  function mostrarTotal(el) {
    if (!esCampo(el) || document.activeElement === el) return;
    const v = el.value;
    if (!OPS.test(v)) return;
    const t = calc(v); if (isNaN(t)) return;
    el.dataset.expr = v;
    el.value = t.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    el.classList.add('es-suma');
  }
  function todos() { document.querySelectorAll('input[inputmode="decimal"],input[inputmode="numeric"]').forEach(mostrarTotal); }
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (esCampo(el) && el.dataset.expr) {
      el.value = el.dataset.expr; delete el.dataset.expr; el.classList.remove('es-suma');
      const n = el.value.length; setTimeout(() => { try { el.setSelectionRange(n, n); } catch (_) {} }, 0);
    }
  });
  document.addEventListener('focusout', e => setTimeout(() => mostrarTotal(e.target), 0));
  let pend = false;
  document.addEventListener('DOMContentLoaded', () => {
    todos();
    new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; todos(); }); })
      .observe(document.body, { childList: true, subtree: true });
  });
  // marquita sutil para saber que ese número es una suma
  const st = document.createElement('style');
  st.textContent = 'input.es-suma{text-decoration:underline dotted;text-underline-offset:4px;text-decoration-thickness:1.5px}';
  document.head.appendChild(st);
})();

/* Barrita con + − × ÷ arriba del teclado numérico (el del iPhone no trae el "+").
   Aparece en los campos de monto de las secciones que aceptan cuentas (window.CALC_OK = true). */
(function () {
  let bar, campo = null;
  const esMonto = el => window.CALC_OK && el && el.tagName === 'INPUT' && (el.inputMode === 'decimal' || el.getAttribute('inputmode') === 'decimal');
  function armar() {
    if (bar) return;
    const st = document.createElement('style');
    st.textContent = `.calcbar{position:fixed;left:0;right:0;z-index:99998;display:none;justify-content:center;gap:8px;padding:6px 10px;background:var(--surface,#fff);border-top:1px solid var(--border,rgba(0,0,0,.1));box-shadow:0 -4px 14px rgba(0,0,0,.08)}
.calcbar.show{display:flex}
.calcbar button{flex:1;max-width:84px;height:40px;border:none;border-radius:10px;background:var(--surface2,#eee);color:var(--text,#222);font-size:1.35rem;font-weight:800;font-family:inherit}
.calcbar button:active{background:var(--accent,#1D9E75);color:#fff}`;
    document.head.appendChild(st);
    bar = document.createElement('div'); bar.className = 'calcbar';
    bar.innerHTML = [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/']].map(([t, v]) => `<button type="button" data-v="${v}">${t}</button>`).join('');
    document.body.appendChild(bar);
    bar.addEventListener('pointerdown', e => {
      e.preventDefault(); // que no se cierre el teclado
      const b = e.target.closest('button'); if (!b || !campo) return;
      const s = campo.selectionStart ?? campo.value.length, f = campo.selectionEnd ?? s;
      campo.setRangeText(b.dataset.v, s, f, 'end');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  function ubicar() {
    if (!bar || !bar.classList.contains('show')) return;
    const vv = window.visualViewport;
    const abajo = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
    bar.style.bottom = abajo + 'px';
  }
  document.addEventListener('focusin', e => {
    if (!esMonto(e.target)) return;
    armar(); campo = e.target; bar.classList.add('show'); ubicar();
  });
  document.addEventListener('focusout', e => {
    if (e.target !== campo) return;
    setTimeout(() => { if (!esMonto(document.activeElement)) { bar && bar.classList.remove('show'); campo = null; } }, 50);
  });
  if (window.visualViewport) { visualViewport.addEventListener('resize', ubicar); visualViewport.addEventListener('scroll', ubicar); }
})();

/* Nombre de cada sección: si en el inicio (Ajustes › Accesos directos) se le cambió el nombre con el lápiz,
   el título de arriba de la página muestra ese nombre en lugar del original. */
(function () {
  const k = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  const SECC = ['inventario', 'ahorros', 'vacaciones', 'copito', 'gastos', 'compartidos', 'calendario'];
  function propio() {
    if (!SECC.includes(k)) return '';
    try { const c = JSON.parse(localStorage.getItem('cfg_v2') || '{}'); return ((c.accesos || {})[k] || {}).nombre || ''; } catch (e) { return ''; }
  }
  window.nombreSeccion = function (def) { const n = propio(); return n ? n.toUpperCase() : def; };
  document.addEventListener('DOMContentLoaded', () => {
    const n = propio(); if (!n) return;
    const el = document.getElementById('topLabel') || document.querySelector('.top h1');
    if (el) el.textContent = n.toUpperCase();
    document.title = n;
  });
})();
