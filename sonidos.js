/* Sonidos de JuntOS: se generan con código (Web Audio), no hay archivos.
   sonido('entrar'|'volver'|'agregar'|'aceptar'|'cancelar'|'borrar'|'pagado'|'tick')
   Se activan solos según el botón que tocás. Se apagan en Ajustes (localStorage 'sonidos' = '0'). */
(function () {
  let ctx = null;
  const activo = () => { try { return localStorage.getItem('sonidos') !== '0'; } catch (e) { return true; } };
  function ac() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // una nota: frecuencia inicial/final, duración, forma de onda, volumen, retraso
  function nota(f1, f2, dur, tipo = 'sine', vol = .16, delay = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f1, t);
    if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function soplido(dur = .2, vol = .12) {
    const c = ac(); if (!c) return;
    const t = c.currentTime, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  const SON = {
    entrar: () => nota(520, 900, .11, 'sine', .17),
    volver: () => nota(880, 460, .12, 'sine', .15),
    agregar: () => { nota(420, 1100, .07, 'sine', .15); nota(900, 1300, .06, 'sine', .1, .06); },
    aceptar: () => { nota(660, 660, .1, 'triangle', .14); nota(990, 990, .16, 'triangle', .14, .09); },
    cancelar: () => nota(320, 210, .14, 'triangle', .13),
    borrar: () => soplido(.22, .16),
    pagado: () => { nota(1320, 1320, .35, 'sine', .12); nota(1760, 1760, .45, 'sine', .1, .07); },
    tick: () => nota(1200, 1000, .035, 'sine', .07)
  };
  window.sonido = function (n, forzar) { if ((forzar || activo()) && SON[n]) try { SON[n](); } catch (e) {} };
  window.sonidosActivos = activo;

  // ¿qué sonido le corresponde a lo que se tocó?
  function cual(el) {
    const a = el.closest('a');
    if (a && a.classList.contains('home-link')) return 'volver';
    if (a && a.classList.contains('card')) return 'entrar';
    const b = el.closest('button, [onclick*="togglePago"]');
    if (!b) return null;
    const on = b.getAttribute('onclick') || '', txt = (b.textContent || '').trim().toLowerCase(), cl = b.classList;
    if (on.includes('togglePago')) return 'pagado';
    if (cl.contains('pq-si') || cl.contains('danger') || b.id === 'dOk' || (cl.contains('confirm-ok') && cl.contains('del'))) return 'borrar';
    if (cl.contains('pq-no') || cl.contains('ghost') || cl.contains('confirm-cancel') || cl.contains('close-btn') || /^(cancelar|cerrar)$/.test(txt)) return 'cancelar';
    if (cl.contains('add') || b.querySelector('.ti-plus,.ti-circle-plus,.ti-circle-plus-filled,.ti-calendar-plus') || /^\+/.test(txt)) return 'agregar';
    if (/^(guardar|aceptar|listo|confirmar|crear|agregar|reemplazar|ok)$/.test(txt) || cl.contains('confirm-ok') || cl.contains('pri')) return 'aceptar';
    if (b.closest('.desliz')) return 'tick';
    return null;
  }
  document.addEventListener('click', e => {
    const n = cual(e.target); if (!n) return;
    sonido(n);
    // al cambiar de página, esperar un instante para que el sonido se escuche
    const a = e.target.closest('a[href]');
    if (a && (n === 'entrar' || n === 'volver') && activo() && !e.defaultPrevented && !a.target) {
      e.preventDefault(); const href = a.href; setTimeout(() => { location.href = href; }, 140);
    }
  }, true);
})();
