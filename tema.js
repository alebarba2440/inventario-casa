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

/* Interruptores deslizantes: cualquier contenedor con la clase "sw" recibe una pastilla de color
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
  function all() { document.querySelectorAll('.sw').forEach(sync); }
  document.addEventListener('DOMContentLoaded', () => {
    all();
    new MutationObserver(ms => {
      const set = new Set();
      ms.forEach(m => { const sw = m.target.closest && m.target.closest('.sw'); if (sw) set.add(sw); });
      set.forEach(sync);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  window.syncSwitches = all;
})();
