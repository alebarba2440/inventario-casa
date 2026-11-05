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
    if (c.theme && c.theme !== 'auto') r.setAttribute('data-theme', c.theme);
    if (c.fontSize) r.style.fontSize = (parseFloat(c.fontSize) * 100) + '%';
  } catch (e) {}
})();
