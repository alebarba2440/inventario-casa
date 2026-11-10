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
    // Caso especial (Alejandro y Julieta): en Default, la foto se asigna por mail y no por el lugar en la pareja.
    if (J && J.emails && s) {
      const ale = 'alejandrobarba021@', es = x => String(x || '').toLowerCase().indexOf(ale) === 0;
      if (es(J.emails.j) || es(J.emails.a)) return window.personaje(es(J.emails[s]) ? 'alejandro' : 'julieta');
    }
    return s === 'j' ? window.personaje('julieta') : s === 'a' ? window.personaje('alejandro') : null;
  };
  // Imagen para una sección (si el personaje tiene una propia para esa sección, se usa esa)
  window.imagenPersonaje = (p, seccion) => p ? (p[seccion] || p.img) : null;
})();
