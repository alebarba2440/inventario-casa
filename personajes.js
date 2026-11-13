/* Personajes de Juntos: cada persona elige el suyo (Ajustes › Personalizar avatar).
   El elegido aparece, por ejemplo, en la tarjeta de Gastos personales.
   Para sumar personajes nuevos: poner la imagen en img/personajes/ y agregarla a la lista. */
(function () {
  // "oculto": no aparece para elegir (Julieta y Alejandro son los del Default)
  const L = [
    { id: 'julieta',   nombre: 'Julieta',   g: 'f', img: 'img/personajes/julieta.webp',   gastos: 'img/personajes/julieta-gastos.webp', oculto: true },
    { id: 'alejandro', nombre: 'Alejandro', g: 'm', img: 'img/personajes/alejandro.webp', gastos: 'img/personajes/alejandro-gastos.webp', oculto: true },
    { id: 'mujer1',    nombre: 'Mujer 1',   g: 'f', img: 'img/personajes/julieta.webp' },
    { id: 'mujer2',    nombre: 'Mujer 2',   g: 'f', img: 'img/personajes/mujer2.webp' },
    { id: 'mujer3',    nombre: 'Mujer 3',   g: 'f', img: 'img/personajes/mujer3.webp' },
    { id: 'hombreA',   nombre: 'Hombre A',  g: 'm', img: 'img/personajes/hombreA.webp' },
    { id: 'hombreB',   nombre: 'Hombre B',  g: 'm', img: 'img/personajes/hombreB.webp' },
    { id: 'hombreC',   nombre: 'Hombre C',  g: 'm', img: 'img/personajes/hombreC.webp' }
  ];
  window.PERSONAJES = L;
  window.personaje = id => L.find(p => p.id === id) || null;
  // ¿Estoy en "Default"? (no elegí ninguno, o elegí el botón Default)
  window.esDefault = function () { let id = null; try { id = localStorage.getItem('personaje'); } catch (e) {} return !id || id === 'default' || !window.personaje(id); };
  // El mío: el que elegí; en Default, el de siempre según mi lugar en la pareja (Julieta / Alejandro).
  window.miPersonaje = function () {
    let id = null; try { id = localStorage.getItem('personaje'); } catch (e) {}
    if (id && id !== 'default' && window.personaje(id)) return window.personaje(id);
    const J = window.JUNTOS, s = J && J.miSlot;
    // Default: la ilustración según lo que eligió al entrar ("ella" / "él"); si no eligió, según su lugar en la pareja.
    if (J && J.miGenero) return window.personaje(J.miGenero === 'f' ? 'julieta' : 'alejandro');
    return s === 'j' ? window.personaje('julieta') : s === 'a' ? window.personaje('alejandro') : null;
  };
  // Imagen para una sección (si el personaje tiene una propia para esa sección, se usa esa)
  window.imagenPersonaje = (p, seccion) => p ? (p[seccion] || p.img) : null;

  /* ---------- Bienvenida: "¿ella o él?" y nombre o apodo (solo en JuntOS) ----------
     Aparece sola la primera vez en el inicio; después se puede abrir con abrirPerfil(). */
  window.abrirPerfil = function (sola) {   // sola = true cuando aparece automáticamente (perfil sin completar)
    const J = window.JUNTOS; if (!J || !window.guardarPerfilYo || document.getElementById('jxPerfil')) return;
    if (!document.getElementById('jxPerfilCss')) {
      const st = document.createElement('style'); st.id = 'jxPerfilCss';
      st.textContent = '#jxPerfil{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:18px}'
        + '#jxPerfil .bx{max-height:calc(100dvh - 36px);overflow-y:auto;background:var(--surface,#fff);color:var(--text,#1a1a1a);width:100%;max-width:420px;border-radius:22px;padding:22px 18px 18px;display:flex;flex-direction:column;gap:14px;font-family:inherit;box-shadow:0 20px 50px rgba(0,0,0,.25);animation:jxSube .25s ease-out}'
        + '@keyframes jxSube{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}'
        + '#jxPerfil h2{margin:0;text-align:center;font-size:1.3rem;font-weight:900}#jxPerfil p{margin:-6px 0 0;text-align:center;color:var(--text2,#666);font-size:.92rem}'
        + '#jxPerfil .gs{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
        + '#jxPerfil .g{border:2.5px solid var(--border2,#ddd);background:var(--surface2,#f6f6f6);border-radius:16px;padding:10px 6px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font:inherit;font-weight:900;font-size:1rem;color:inherit}'
        + '#jxPerfil .g img{height:110px;width:auto;object-fit:contain}#jxPerfil .g.on{border-color:var(--accent,#1D9E75);background:var(--accent-light,#E1F5EE)}'
        + '#jxPerfil label,#jxPerfil .lb{display:flex;flex-direction:column;gap:6px;font-size:.78rem;font-weight:900;letter-spacing:.06em;color:var(--text2,#666)}'
        + '#jxPerfil input{font:inherit;font-size:1.05rem;font-weight:700;padding:12px;border-radius:12px;border:1px solid var(--border2,#ddd);background:var(--surface2,#f6f6f6);color:inherit;outline:none}'
        + '#jxPerfil .nt{margin-top:-8px;font-size:.78rem;color:var(--text2,#666);text-align:center}#jxPerfil .nt.err{color:var(--err,#E24B4A);font-weight:800}'
        + '#jxPerfil input[type=date]{min-height:48px;-webkit-appearance:none;appearance:none}'
        + '#jxPerfil .cs{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}#jxPerfil .c{aspect-ratio:1;border-radius:50%;border:3px solid var(--surface,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.12);cursor:pointer;padding:0;transition:transform .12s}'
        + '#jxPerfil .c.on{box-shadow:0 0 0 3px var(--text,#1a1a1a);transform:scale(1.08)}#jxPerfil .c:active{transform:scale(.9)}'
        + '#jxPerfil .ok{font:inherit;font-weight:900;font-size:1.05rem;padding:14px;border:none;border-radius:14px;background:var(--accent,#1D9E75);color:#fff;cursor:pointer}#jxPerfil .ok:disabled{opacity:.4;cursor:default}';
      document.head.appendChild(st);
    }
    const yo = J.miSlot, nom = (J.apodos && yo && J.apodos[yo]) || (J.usuario && String(J.usuario.nombre || '').split(' ')[0]) || '';
    let gen = J.miGenero || null;
    const d = document.createElement('div'); d.id = 'jxPerfil';
    d.innerHTML = '<div class="bx" role="dialog" aria-modal="true" aria-labelledby="jxPT"><h2 id="jxPT">' + (sola !== true ? 'Editar perfil' : J.miGenero ? 'Completá tu perfil 🎂' : '¡Bienvenido/a a JuntOS! 💞') + '</h2>' + (sola !== true ? '' : '<p>' + (J.miGenero ? 'Nos falta tu cumpleaños.' : 'Contanos cómo querés aparecer en la app.') + '</p>')
      + '<div class="gs"><button type="button" class="g" data-g="f"><img src="' + window.personaje('julieta').img + '" alt="">Ella</button>'
      + '<button type="button" class="g" data-g="m"><img src="' + window.personaje('alejandro').img + '" alt="">Él</button></div>'
      + '<label>TU NOMBRE O APODO<input id="jxPN" maxlength="30" autocomplete="nickname" placeholder="Ej: Juli"></label>'
      + '<label>TU CUMPLEAÑOS<input id="jxPC" type="date" autocomplete="bday"></label><small class="nt" id="jxPCn" hidden></small>'
      + '<div class="lb">ELEGÍ TU COLOR FAVORITO<span class="cs" id="jxPCol"></span></div><small class="nt">Es el color de la app en tu celu. Lo podés cambiar cuando quieras en Ajustes.</small>'
      + '<button type="button" class="ok" id="jxPOk">Listo</button></div>';
    document.body.appendChild(d);
    const inp = d.querySelector('#jxPN'), ok = d.querySelector('#jxPOk'), cum = d.querySelector('#jxPC'), nota = d.querySelector('#jxPCn');
    inp.value = nom; cum.value = J.miCumple || '';
    // Color favorito: se ve al instante y se guarda en los ajustes (cfg_v2, el mismo que usa Ajustes del inicio)
    const COLS = ['#65A30D','#16A34A','#1D9E75','#0D9488','#0891B2','#0EA5E9','#2563EB','#6366F1','#7C3AED','#9333EA','#EC4899','#E11D48','#DC2626','#EA580C','#F59E0B','#CA8A04','#64748B','#78716C'];
    const mix = (h, to, t) => { const n = parseInt(h.slice(1), 16), f = v => Math.round(v + (to - v) * t).toString(16).padStart(2, '0'); return ('#' + f(n >> 16) + f(n >> 8 & 255) + f(n & 255)).toUpperCase(); };
    let cfgAct = {}; try { cfgAct = (typeof cfg === 'object' && cfg) || JSON.parse(localStorage.getItem('cfg_v2') || '{}'); } catch (e) {}
    let col = String(cfgAct.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D9E75').toUpperCase();
    const ponerColor = c => { const r = document.documentElement.style; r.setProperty('--accent', c); r.setProperty('--accent-dark', mix(c, 0, .4)); r.setProperty('--accent-light', mix(c, 255, .87)); };
    const pc = d.querySelector('#jxPCol');
    pc.innerHTML = COLS.map(c => '<button type="button" class="c" data-c="' + c + '" style="background:' + c + '" aria-label="Color ' + c + '"></button>').join('');
    const marcarCol = () => pc.querySelectorAll('.c').forEach(b => b.classList.toggle('on', b.dataset.c === col));
    pc.onclick = e => { const b = e.target.closest('.c'); if (!b) return; col = b.dataset.c; ponerColor(col); marcarCol(); try { window.sonido && sonido('tick'); } catch (er) {} };
    marcarCol();
    const hoy = new Date().toISOString().slice(0, 10); cum.max = hoy; cum.min = '1900-01-01';
    const cumOk = () => /^\d{4}-\d{2}-\d{2}$/.test(cum.value) && cum.value <= hoy && cum.value >= '1900-01-01';
    // Sin "ella/él", nombre y cumpleaños no deja avanzar
    const pintar = () => { d.querySelectorAll('.g').forEach(b => b.classList.toggle('on', b.dataset.g === gen)); ok.disabled = !gen || !inp.value.trim() || !cumOk();
      nota.classList.toggle('err', !!cum.value && !cumOk()); nota.textContent = cum.value && !cumOk() ? 'Revisá la fecha de tu cumpleaños' : ''; nota.hidden = !nota.textContent; };
    d.querySelectorAll('.g').forEach(b => b.onclick = () => { gen = b.dataset.g; pintar(); try { window.sonido && sonido('aceptar'); } catch (e) {} });
    inp.oninput = pintar; cum.oninput = pintar; cum.onchange = pintar; inp.onkeydown = e => { if (e.key === 'Enter' && !ok.disabled) ok.click(); };
    ok.onclick = () => {
      window.guardarPerfilYo({ genero: gen, apodo: inp.value.trim(), cumple: cum.value });
      // guardar el color (si está la página de inicio, por su propio cfg para que Ajustes no lo pise)
      try {
        const o = (typeof cfg === 'object' && cfg) ? cfg : JSON.parse(localStorage.getItem('cfg_v2') || '{}');
        o.accent = col; o.accentD = mix(col, 0, .4); o.accentL = mix(col, 255, .87);
        if (typeof saveCfg === 'function' && typeof cfg === 'object' && o === cfg) saveCfg(); else { localStorage.setItem('cfg_v2', JSON.stringify(o)); if (window.barraDeColor) barraDeColor(); }
        ponerColor(col); if (typeof markColor === 'function') markColor();
      } catch (e) {}
      d.remove(); try { window.sonido && sonido('agregar'); } catch (e) {}
      try { window.dispatchEvent(new Event('juntos')); } catch (e) {}
    };
    pintar();
  };
  // La primera vez (en el inicio): si todavía no eligió, se pregunta.
  function revisarBienvenida() {
    const J = window.JUNTOS;
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', revisarBienvenida, { once: true }); return; }
    if (!(J && J.perfilListo && J.miSlot && (!J.miGenero || !J.miCumple) && document.getElementById('grid'))) return;
    if (document.getElementById('intro')) { setTimeout(revisarBienvenida, 700); return; }   // después de la animación de inicio
    window.abrirPerfil(true);
  }
  window.addEventListener('juntos', revisarBienvenida);
})();
