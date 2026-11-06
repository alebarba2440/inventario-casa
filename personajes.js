/* Personajes de JuntOS dibujados en SVG (estilo chibi).
   svgPersonaje('f'|'m', opciones) devuelve el dibujo como texto SVG.
   Opciones: pelo, ojos, outfit, barba (solo él). */
(function () {
  const OUT = '#2b211d', SW = 3.2;
  const PIEL = '#F6C9A6', PIEL_S = '#E9AE88', MEJ = '#F29A9A';
  const OJOS = { marron: '#7a4a2a', celeste: '#4fa6dc', verde: '#4d9a52' };
  const PELO_F = '#4a3427', PELO_F2 = '#33231a', PELO_M = '#3b2b23', PELO_M2 = '#271b15';

  // extremidad con contorno: trazo grueso oscuro + trazo de color encima
  const limb = (d, w, col) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + SW * 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const shp = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`;

  /* ---------- cabeza y cara ---------- */
  function cara(t, o) {
    const m = t === 'm';
    const face = m
      ? 'M44,148 C44,82 196,82 196,148 C196,196 178,228 152,238 C138,243 102,243 88,238 C62,228 44,196 44,148Z'
      : 'M48,146 C48,84 192,84 192,146 C192,200 160,236 120,236 C80,236 48,200 48,146Z';
    const orejas = m
      ? shp('M47,150 C30,146 28,176 46,180', PIEL) + shp('M193,150 C210,146 212,176 194,180', PIEL)
      : '';
    const iris = OJOS[o.ojos] || OJOS.marron;
    const ey = m ? 166 : 168, ex1 = m ? 90 : 88, ex2 = m ? 150 : 152;
    const rx = m ? 15 : 17, ry = m ? 17 : 20;
    const ojo = (x) => `
      <ellipse cx="${x}" cy="${ey}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${OUT}" stroke-width="2"/>
      <circle cx="${x + 1}" cy="${ey + 2}" r="${rx - 3}" fill="${iris}"/>
      <circle cx="${x + 1}" cy="${ey + 3}" r="${rx - 9}" fill="#1d1410"/>
      <circle cx="${x - 4}" cy="${ey - 4}" r="${m ? 4.5 : 5.5}" fill="#fff"/>
      <circle cx="${x + 5}" cy="${ey + 7}" r="2.2" fill="#fff" opacity=".9"/>
      <path d="M${x - rx - 2},${ey - ry + 6} Q${x},${ey - ry - 6} ${x + rx + 2},${ey - ry + 6}" fill="none" stroke="${OUT}" stroke-width="${m ? 3.4 : 4.4}" stroke-linecap="round"/>
      ${m ? '' : `<path d="M${x + rx - 1},${ey - ry + 6} l7,-5 M${x + rx - 4},${ey - ry + 1} l6,-7" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>`}`;
    const ceja = (x, flip) => `<path d="M${x - 15},${ey - ry - 12 + (flip ? 2 : 0)} Q${x},${ey - ry - 22} ${x + 15},${ey - ry - 12 + (flip ? 0 : 2)}" fill="none" stroke="${m ? PELO_M : PELO_F}" stroke-width="${m ? 6.5 : 4.5}" stroke-linecap="round"/>`;
    const boca = m
      ? `<path d="M108,214 Q120,222 132,214" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M104,206 Q120,203 136,206 Q134,226 120,227 Q106,226 104,206Z" fill="#7a2b2b" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>
         <path d="M107,207 Q120,205 133,207 L132,211 Q120,209 108,211Z" fill="#fff"/>
         <path d="M112,221 Q120,215 128,221 Q120,226 112,221Z" fill="#e8707a"/>`;
    const nariz = `<path d="M117,${m ? 196 : 192} Q121,${m ? 199 : 195} 124,${m ? 196 : 192}" fill="none" stroke="${PIEL_S}" stroke-width="3" stroke-linecap="round"/>`;
    const mejillas = `<ellipse cx="${m ? 70 : 72}" cy="${m ? 192 : 196}" rx="13" ry="8" fill="${MEJ}" opacity=".45"/><ellipse cx="${m ? 170 : 168}" cy="${m ? 192 : 196}" rx="13" ry="8" fill="${MEJ}" opacity=".45"/>`;
    const pecas = m ? '' : [[64, 188], [70, 184], [76, 189], [164, 188], [170, 184], [176, 189]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#c98a6a" opacity=".7"/>`).join('');
    return { face: orejas + shp(face, PIEL), rasgos: ojo(ex1) + ojo(ex2) + ceja(ex1, 0) + ceja(ex2, 1) + nariz + mejillas + pecas + boca };
  }

  /* ---------- pelo de ella ---------- */
  function rulos(cx, cy, rx, ry, n, r, col) {
    // silueta de rulos: círculos sobre el borde de una elipse
    let out = '', fill = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r + SW}" fill="${OUT}"/>`;
      fill += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}"/>`;
    }
    return out + `<ellipse cx="${cx}" cy="${cy}" rx="${rx + SW}" ry="${ry + SW}" fill="${OUT}"/>` + fill + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}"/>`;
  }
  function onditas(x, y, h, col) {
    let d = `M${x},${y}`;
    for (let i = 0; i < h / 22; i++) d += ` q${i % 2 ? -8 : 8},11 0,22`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity=".85"/>`;
  }
  function peloF(estilo) {
    if (estilo === 'lacio') {
      const atras = shp('M30,150 C30,64 210,64 210,150 L214,330 C190,344 50,344 26,330Z', PELO_F);
      const frente = shp('M48,150 C42,92 82,66 120,66 C158,66 198,92 192,150 C186,118 160,98 122,96 L120,104 C108,110 82,112 60,128 C54,136 50,142 48,150Z', PELO_F)
        + `<path d="M120,72 L120,100" stroke="${PELO_F2}" stroke-width="2.5"/>`
        + `<path d="M60,150 L58,300 M180,150 L182,300 M44,170 L42,320 M196,170 L198,320" stroke="${PELO_F2}" stroke-width="2.4" opacity=".6"/>`;
      return { atras, frente };
    }
    if (estilo === 'rodete') {
      const atras = rulos(120, 52, 30, 26, 12, 9, PELO_F) + shp('M50,150 C44,74 196,74 190,150 C188,170 52,170 50,150Z', PELO_F);
      const frente = shp('M50,146 C46,90 86,70 120,70 C154,70 194,90 190,146 C184,116 156,100 120,100 C84,100 56,116 50,146Z', PELO_F)
        + `<path d="M84,80 Q100,90 118,74 M156,80 Q140,90 122,74" fill="none" stroke="${PELO_F2}" stroke-width="2.4"/>`
        + `<path d="M52,150 q-6,18 2,36 M188,150 q6,18 -2,36" fill="none" stroke="${PELO_F}" stroke-width="4" stroke-linecap="round"/>`;
      return { atras, frente };
    }
    // rulos (el de la foto)
    const atras = rulos(120, 190, 96, 132, 30, 20, PELO_F)
      + [48, 66, 174, 192].map((x, i) => onditas(x, 120 + (i % 2) * 14, 160, PELO_F2)).join('');
    const frente = shp('M52,214 C34,190 34,120 56,92 C76,68 100,62 120,62 C140,62 164,68 184,92 C206,120 206,190 188,214 C186,190 182,160 176,138 C166,112 148,102 126,98 L120,108 L114,98 C92,102 74,112 64,138 C58,160 54,190 52,214Z', PELO_F)
      + onditas(92, 74, 44, PELO_F2) + onditas(148, 74, 44, PELO_F2) + onditas(48, 120, 88, PELO_F2) + onditas(192, 120, 88, PELO_F2);
    return { atras, frente };
  }

  /* ---------- pelo y barba de él ---------- */
  function peloM(estilo) {
    if (estilo === 'pelado') return { frente: `<path d="M78,112 Q94,98 114,96" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>` };
    if (estilo === 'jopo') return {
      frente: shp('M44,152 C40,112 50,88 66,76 C70,52 112,40 150,48 C178,54 196,74 198,104 C200,120 198,136 196,152 C192,130 186,116 178,108 C150,98 92,98 62,108 C54,116 48,130 44,152Z', PELO_M)
        + `<path d="M74,72 Q112,52 160,60 M70,88 Q116,66 176,80" fill="none" stroke="${PELO_M2}" stroke-width="2.6" stroke-linecap="round"/>`
        + `<path d="M46,140 L46,170 M194,140 L194,170" stroke="${PELO_M}" stroke-width="6"/>`
    };
    return {
      frente: shp('M44,152 C38,96 76,62 120,62 C164,62 202,96 196,152 C192,130 186,116 178,108 C150,100 92,100 62,108 C54,116 48,130 44,152Z', PELO_M)
        + `<path d="M92,70 Q120,62 150,70 M80,84 Q120,72 162,84" fill="none" stroke="${PELO_M2}" stroke-width="2.4" stroke-linecap="round"/>`
        + `<path d="M46,140 L46,170 M194,140 L194,170" stroke="${PELO_M}" stroke-width="6"/>`
    };
  }
  function barba(tipo) {
    if (tipo === 'poca') return `<path d="M50,176 C54,214 84,240 120,242 C156,240 186,214 190,176 C184,200 170,216 152,222 C140,212 100,212 88,222 C70,216 56,200 50,176Z" fill="${PELO_M}" opacity=".32"/>
      <path d="M100,206 Q120,198 140,206" fill="none" stroke="${PELO_M}" stroke-width="5" stroke-linecap="round" opacity=".75"/>`;
    if (tipo === 'espartano') return shp('M46,162 C44,220 70,286 120,298 C170,286 196,220 194,162 C190,190 176,206 160,208 C150,202 136,200 120,200 C104,200 90,202 80,208 C64,206 50,190 46,162Z', PELO_M)
      + `<path d="M102,212 Q120,206 138,212 Q132,224 120,224 Q108,224 102,212Z" fill="#c9786f" stroke="${OUT}" stroke-width="2"/>`
      + `<path d="M96,204 Q120,192 144,204" fill="none" stroke="${PELO_M}" stroke-width="9" stroke-linecap="round"/>`
      + `<path d="M84,240 q4,16 0,30 M120,250 q4,16 0,32 M156,240 q-4,16 0,30" fill="none" stroke="${PELO_M2}" stroke-width="2.4" stroke-linecap="round"/>`;
    return '';
  }

  /* ---------- ropa ---------- */
  function cuerpoF(outfit) {
    let s = '';
    const brazoI = 'M90,262 Q76,300 74,352', brazoD = 'M150,262 Q164,300 166,352';
    const piernas = limb('M106,380 L106,470', 26, PIEL) + limb('M134,380 L134,470', 26, PIEL);
    const torsoPiel = shp('M98,250 L142,250 C150,262 152,300 146,340 L94,340 C88,300 90,262 98,250Z', PIEL);
    const cuello = shp('M110,226 L130,226 L132,254 L108,254Z', PIEL);
    if (outfit === 'empresaria') {
      s += piernas;
      s += shp('M94,404 Q106,412 116,404 L118,470 Q106,476 94,470Z', 'none', 'stroke-width="0"');
      s += shp('M92,466 L118,466 L120,484 L88,486Z', '#1b1b1f') + shp('M122,466 L148,466 L152,486 L120,484Z', '#1b1b1f');
      s += limb(brazoI, 22, '#2f3a56') + limb(brazoD, 22, '#2f3a56');
      s += shp('M74,350 a8,8 0 1,0 0.1,0Z', PIEL) + shp('M166,350 a8,8 0 1,0 0.1,0Z', PIEL);
      s += cuello;
      s += shp('M90,336 L150,336 L146,416 L94,416Z', '#3a4152');
      s += shp('M96,250 L144,250 C154,264 154,300 150,342 L90,342 C86,300 86,264 96,250Z', '#2f3a56');
      s += shp('M108,250 L120,286 L132,250Z', '#fff') + `<path d="M120,286 L120,340" stroke="${OUT}" stroke-width="2"/>`
        + `<path d="M108,250 L100,290 L120,286 M132,250 L140,290 L120,286" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>`
        + `<circle cx="126" cy="306" r="2.5" fill="#cbd2e0"/><circle cx="126" cy="322" r="2.5" fill="#cbd2e0"/>`;
      return s;
    }
    if (outfit === 'gym') {
      s += limb('M106,380 L106,466', 26, '#26262b') + limb('M134,380 L134,466', 26, '#26262b');
      s += `<path d="M95,384 L95,462 M145,384 L145,462" stroke="#ee5d86" stroke-width="3"/>`;
      s += shp('M90,466 L120,466 L122,484 Q106,490 88,484Z', '#fff') + shp('M120,466 L150,466 L152,484 Q134,490 118,484Z', '#fff');
      s += `<path d="M92,476 L118,476 M122,476 L148,476" stroke="#ee5d86" stroke-width="3"/>`;
      s += limb(brazoI, 20, PIEL) + limb(brazoD, 20, PIEL);
      s += torsoPiel + cuello;
      s += shp('M92,336 L148,336 L150,392 L122,392 L120,374 L118,392 L90,392Z', '#26262b');
      s += shp('M98,254 C106,262 134,262 142,254 C150,270 150,288 146,300 L94,300 C90,288 90,270 98,254Z', '#ee5d86');
      s += `<path d="M100,252 L104,236 M140,252 L136,236" stroke="#ee5d86" stroke-width="5" stroke-linecap="round"/>`;
      s += `<path d="M112,320 Q120,324 128,320" fill="none" stroke="${PIEL_S}" stroke-width="2"/>`;
      return s;
    }
    // el de la foto: musculosa negra cuello alto + short beige
    s += piernas;
    s += shp('M92,466 L118,466 L120,482 Q106,488 88,482Z', '#1b1b1f') + shp('M122,466 L148,466 L152,482 Q134,488 120,482Z', '#1b1b1f');
    s += limb(brazoI, 20, PIEL) + limb(brazoD, 20, PIEL);
    s += `<rect x="66" y="336" width="16" height="9" rx="3" fill="#d76f9e" stroke="${OUT}" stroke-width="2"/>`;
    s += cuello;
    s += shp('M90,334 L150,334 L154,394 L124,394 L120,376 L116,394 L86,394Z', '#d9c7a7')
      + `<path d="M96,346 Q102,356 98,368 M144,346 Q138,356 142,368" fill="none" stroke="${OUT}" stroke-width="1.8"/>`;
    s += shp('M106,236 L134,236 L136,252 C148,266 150,300 148,340 L92,340 C90,300 92,266 104,252Z', '#1d1d20');
    return s;
  }
  function cuerpoM(outfit) {
    let s = '';
    const brazoI = 'M80,270 Q66,310 66,370', brazoD = 'M160,270 Q174,310 174,370';
    const cuello = shp('M106,232 L134,232 L136,262 L104,262Z', PIEL);
    const manos = shp('M66,370 a10,10 0 1,0 0.1,0Z', PIEL) + shp('M174,370 a10,10 0 1,0 0.1,0Z', PIEL);
    if (outfit === 'empresario') {
      s += limb('M104,390 L104,486', 32, '#26304a') + limb('M136,390 L136,486', 32, '#26304a');
      s += shp('M84,486 L118,486 L120,504 L80,504Z', '#141414') + shp('M122,486 L156,486 L160,504 L120,504Z', '#141414');
      s += limb(brazoI, 26, '#26304a') + limb(brazoD, 26, '#26304a') + manos;
      s += cuello;
      s += shp('M84,258 L156,258 C170,272 170,330 162,392 L78,392 C70,330 70,272 84,258Z', '#26304a');
      s += shp('M104,258 L120,300 L136,258Z', '#fff');
      s += shp('M116,268 L124,268 L127,316 L120,326 L113,316Z', '#9b2c3a');
      s += `<path d="M104,258 L94,300 L120,300 M136,258 L146,300 L120,300" fill="none" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>`
        + `<path d="M120,326 L120,392" stroke="${OUT}" stroke-width="2"/><circle cx="128" cy="344" r="2.6" fill="#9aa6c0"/><circle cx="128" cy="364" r="2.6" fill="#9aa6c0"/>`;
      return s;
    }
    if (outfit === 'gym') {
      s += limb('M104,430 L104,482', 28, PIEL) + limb('M136,430 L136,482', 28, PIEL);
      s += shp('M82,482 L120,482 L122,502 Q100,508 80,502Z', '#fff') + shp('M120,482 L158,482 L160,502 Q140,508 118,502Z', '#fff');
      s += `<path d="M84,492 L118,492 M122,492 L156,492" stroke="#2e86de" stroke-width="3"/>`;
      s += limb(brazoI, 26, PIEL) + limb(brazoD, 26, PIEL) + manos;
      s += `<rect x="58" y="350" width="17" height="9" rx="3" fill="#2e86de" stroke="${OUT}" stroke-width="2"/>`;
      s += cuello;
      s += shp('M78,384 L162,384 L164,434 L124,434 L120,412 L116,434 L76,434Z', '#1f2328');
      s += shp('M98,256 C104,276 136,276 142,256 L156,262 C164,300 164,350 162,390 L78,390 C76,350 76,300 84,262Z', '#6b7280');
      return s;
    }
    // el de la foto: remera blanca + pantalón negro + cadena
    s += limb('M104,390 L104,486', 32, '#1d1d20') + limb('M136,390 L136,486', 32, '#1d1d20');
    s += shp('M84,486 L118,486 L120,504 L80,504Z', '#141414') + shp('M122,486 L156,486 L160,504 L120,504Z', '#141414');
    s += limb(brazoI, 24, PIEL) + limb(brazoD, 24, PIEL) + manos;
    s += cuello;
    s += shp('M80,258 L160,258 C174,266 182,290 184,306 L164,312 C166,340 166,370 164,394 L76,394 C74,370 74,340 76,312 L56,306 C58,290 66,266 80,258Z', '#f7f7f5');
    s += `<path d="M104,258 Q120,276 136,258" fill="none" stroke="${OUT}" stroke-width="2.4"/>`
      + `<path d="M104,262 Q120,292 136,262" fill="none" stroke="#a9adb3" stroke-width="3.2" stroke-dasharray="4 2.5"/>`
      + `<path d="M94,370 Q120,378 150,368" fill="none" stroke="#d4d4d0" stroke-width="2"/>`;
    return s;
  }
  function lentes() {
    return `<g fill="rgba(255,255,255,.15)" stroke="#1f1f24" stroke-width="3.2"><rect x="66" y="150" width="44" height="34" rx="10"/><rect x="130" y="150" width="44" height="34" rx="10"/></g>
      <path d="M110,164 Q120,158 130,164 M66,160 L52,156 M174,160 L188,156" fill="none" stroke="#1f1f24" stroke-width="3"/>`;
  }

  window.svgPersonaje = function (t, o = {}) {
    const c = cara(t, o);
    let s = '';
    if (t === 'f') {
      const p = peloF(o.pelo);
      s = `<g transform="translate(0,22)">${p.atras}${cuerpoF(o.outfit)}${c.face}${c.rasgos}${p.frente}${o.outfit === 'empresaria' ? lentes() : ''}</g>`;
    } else {
      const p = peloM(o.pelo);
      s = `${cuerpoM(o.outfit)}${c.face}${barba(o.barba)}${c.rasgos}${p.frente}`;
    }
    return `<svg viewBox="0 0 240 520" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  };
  window.PERSONAJE_OPC = {
    f: { pelo: [['rulos', 'Rulos'], ['lacio', 'Lacio'], ['rodete', 'Rodete']], ojos: [['marron', 'Marrones'], ['celeste', 'Celestes'], ['verde', 'Verdes']], outfit: [['casual', 'Casual'], ['empresaria', 'Empresaria'], ['gym', 'Gym']] },
    m: { pelo: [['corto', 'Corto'], ['pelado', 'Pelado'], ['jopo', 'Jopo']], ojos: [['marron', 'Marrones'], ['celeste', 'Celestes'], ['verde', 'Verdes']], barba: [['nada', 'Sin barba'], ['poca', 'Poca'], ['espartano', 'Espartano']], outfit: [['casual', 'Casual'], ['empresario', 'Empresario'], ['gym', 'Gym']] }
  };
  window.PERSONAJE_DEF = { f: { pelo: 'rulos', ojos: 'verde', outfit: 'casual' }, m: { pelo: 'corto', ojos: 'marron', barba: 'espartano', outfit: 'casual' } };
})();
