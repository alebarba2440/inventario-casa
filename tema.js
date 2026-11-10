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
})();

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

/* Ventana de confirmación común para toda la app: preguntar(titulo, mensaje, alConfirmar, textoBoton) */
(function () {
  const css = `.pq-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:99999;opacity:0;pointer-events:none;transition:opacity .18s}
.pq-bg.show{opacity:1;pointer-events:auto}
.pq{background:var(--surface,#fff);color:var(--text,#222);border-radius:20px;padding:22px 20px 18px;width:100%;max-width:340px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.25);transform:scale(.92);transition:transform .18s;font-family:'Nunito',system-ui,sans-serif}
.pq-bg.show .pq{transform:scale(1)}
.pq-ic{width:52px;height:52px;border-radius:50%;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;background:#fdecec;color:#d64545}
.pq-ic svg{width:26px;height:26px}
.pq h3{margin:0 0 6px;font-size:1.1rem;font-weight:800}
.pq p{margin:0 0 18px;font-size:.93rem;color:var(--text2,#666);line-height:1.4}
.pq-b{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pq-b button{border:none;border-radius:12px;padding:12px;font-family:inherit;font-weight:800;font-size:.95rem;cursor:pointer}
.pq-no{background:var(--surface2,#eee);color:var(--text,#222)}
.pq-si{background:#d64545;color:#fff}`;
  let bg, cb = null;
  function armar() {
    if (bg) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    bg = document.createElement('div'); bg.className = 'pq-bg';
    bg.innerHTML = `<div class="pq" role="dialog" aria-modal="true"><div class="pq-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></div>
      <h3></h3><p></p><div class="pq-b"><button class="pq-no">Cancelar</button><button class="pq-si">Eliminar</button></div></div>`;
    document.body.appendChild(bg);
    const cerrar = () => { bg.classList.remove('show'); cb = null; };
    bg.querySelector('.pq-no').onclick = cerrar;
    bg.addEventListener('click', e => { if (e.target === bg) cerrar(); });
    bg.querySelector('.pq-si').onclick = () => { const f = cb; cerrar(); if (f) f(); };
  }
  window.preguntar = function (titulo, msg, alConfirmar, boton) {
    armar();
    bg.querySelector('h3').textContent = titulo || '¿Estás segura?';
    bg.querySelector('p').textContent = msg || '';
    bg.querySelector('.pq-si').textContent = boton || 'Sí, eliminar';
    cb = alConfirmar; bg.classList.add('show');
  };
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
