/* Contenido de Coaching de pareja. Se puede editar libremente: agregar, sacar o cambiar textos.
   Cada carta tiene un id fijo (no lo cambies si ya la marcaron como favorita). */
window.COACH = {
  niveles: [
    { id: 'liviano', nombre: 'Liviano', emoji: '☀️' },
    { id: 'profundo', nombre: 'Profundo', emoji: '🌊' },
    { id: 'futuro', nombre: 'Futuro', emoji: '🚀' },
    { id: 'recuerdos', nombre: 'Recuerdos', emoji: '📸' }
  ],
  cartas: [
    // liviano
    { id: 'l1', n: 'liviano', t: '¿Cuál fue el mejor momento de tu semana?' },
    { id: 'l2', n: 'liviano', t: 'Si mañana tuviéramos el día libre, ¿qué haríamos?' },
    { id: 'l3', n: 'liviano', t: '¿Qué comida te recuerda a mí?' },
    { id: 'l4', n: 'liviano', t: '¿Qué canción pondrías para describir nuestra relación?' },
    { id: 'l5', n: 'liviano', t: '¿Qué cosa chiquita que hago te alegra el día?' },
    { id: 'l6', n: 'liviano', t: 'Si fuéramos personajes de una serie, ¿cuál sería?' },
    { id: 'l7', n: 'liviano', t: '¿Qué te gustaría aprender a hacer juntos?' },
    { id: 'l8', n: 'liviano', t: '¿Cuál es tu plan ideal de domingo?' },
    { id: 'l9', n: 'liviano', t: '¿Qué manía mía te causa gracia?' },
    { id: 'l10', n: 'liviano', t: 'Si pudiéramos viajar mañana a cualquier lugar, ¿adónde iríamos?' },
    // profundo
    { id: 'p1', n: 'profundo', t: '¿Cuándo te sentiste más acompañado/a por mí este último tiempo?' },
    { id: 'p2', n: 'profundo', t: '¿Hay algo que te cueste pedirme? ¿Por qué?' },
    { id: 'p3', n: 'profundo', t: '¿Qué necesitás de mí cuando tenés un mal día?' },
    { id: 'p4', n: 'profundo', t: '¿Qué aprendiste de nuestra última discusión?' },
    { id: 'p5', n: 'profundo', t: '¿Qué te hace sentir querido/a de verdad?' },
    { id: 'p6', n: 'profundo', t: '¿Hay algo que te preocupe de nosotros y no me hayas dicho?' },
    { id: 'p7', n: 'profundo', t: '¿En qué sentís que crecimos como pareja?' },
    { id: 'p8', n: 'profundo', t: '¿Qué te gustaría que hiciéramos distinto cuando estamos estresados?' },
    { id: 'p9', n: 'profundo', t: '¿Qué parte de tu historia todavía no te animaste a contarme?' },
    { id: 'p10', n: 'profundo', t: '¿Qué significa para vos sentirte en casa conmigo?' },
    // futuro
    { id: 'f1', n: 'futuro', t: '¿Cómo te imaginás nuestra vida dentro de 5 años?' },
    { id: 'f2', n: 'futuro', t: '¿Qué sueño te gustaría que cumplamos juntos?' },
    { id: 'f3', n: 'futuro', t: '¿Qué tradición nos gustaría crear como pareja?' },
    { id: 'f4', n: 'futuro', t: '¿Para qué te gustaría que ahorremos?' },
    { id: 'f5', n: 'futuro', t: '¿Dónde te gustaría vivir algún día?' },
    { id: 'f6', n: 'futuro', t: '¿Qué te gustaría cambiar de nuestra rutina este año?' },
    { id: 'f7', n: 'futuro', t: '¿Qué viaje no puede faltar antes de que pasen 10 años?' },
    { id: 'f8', n: 'futuro', t: '¿Cómo te imaginás nuestra vejez juntos?' },
    // recuerdos
    { id: 'r1', n: 'recuerdos', t: '¿Qué te acordás de la primera vez que nos vimos?' },
    { id: 'r2', n: 'recuerdos', t: '¿Cuál es tu recuerdo favorito de nosotros?' },
    { id: 'r3', n: 'recuerdos', t: '¿En qué momento supiste que esto iba en serio?' },
    { id: 'r4', n: 'recuerdos', t: '¿Qué momento difícil superamos que te enorgullece?' },
    { id: 'r5', n: 'recuerdos', t: '¿Cuál fue nuestra cita más divertida?' },
    { id: 'r6', n: 'recuerdos', t: '¿Qué foto nuestra elegirías para un cuadro?' },
    { id: 'r7', n: 'recuerdos', t: '¿Qué cosa que hice te enamoró al principio?' },
    { id: 'r8', n: 'recuerdos', t: '¿Qué aniversario o fecha no te vas a olvidar nunca?' }
  ],
  // Chequeo semanal: áreas que puntúa cada uno del 1 al 5
  areas: [
    { id: 'comunicacion', nombre: 'Comunicación', emoji: '💬' },
    { id: 'tiempo', nombre: 'Tiempo juntos', emoji: '⏳' },
    { id: 'intimidad', nombre: 'Intimidad', emoji: '❤️' },
    { id: 'plata', nombre: 'Plata', emoji: '💰' },
    { id: 'tareas', nombre: 'Tareas de la casa', emoji: '🧹' }
  ],
  // Ideas de citas: lugar casa/afuera, costo gratis/plata
  citas: [
    { id: 'c1', l: 'casa', c: 'gratis', t: 'Noche de cine con almohadones en el piso y pochoclos', e: '🎬' },
    { id: 'c2', l: 'casa', c: 'plata', t: 'Cocinar juntos una receta que nunca probaron', e: '🍝' },
    { id: 'c3', l: 'casa', c: 'gratis', t: 'Picnic en el living con mantel y velas', e: '🧺' },
    { id: 'c4', l: 'casa', c: 'gratis', t: 'Noche de juegos de mesa o cartas', e: '🃏' },
    { id: 'c5', l: 'casa', c: 'gratis', t: 'Armar juntos una playlist de canciones de su historia', e: '🎶' },
    { id: 'c6', l: 'casa', c: 'plata', t: 'Cata de vinos o cervezas con algo para picar', e: '🍷' },
    { id: 'c7', l: 'casa', c: 'gratis', t: 'Mirar fotos viejas y contarse recuerdos', e: '📸' },
    { id: 'c8', l: 'casa', c: 'gratis', t: 'Spa casero: masajes, cremas y música tranquila', e: '🛁' },
    { id: 'c9', l: 'casa', c: 'plata', t: 'Pedir comida de un país que nunca probaron', e: '🌮' },
    { id: 'c10', l: 'casa', c: 'gratis', t: 'Escribirse una carta y leerla en voz alta', e: '💌' },
    { id: 'c11', l: 'afuera', c: 'gratis', t: 'Caminata al atardecer por un lugar nuevo de la ciudad', e: '🌅' },
    { id: 'c12', l: 'afuera', c: 'gratis', t: 'Mate en la costanera o en una plaza', e: '🧉' },
    { id: 'c13', l: 'afuera', c: 'plata', t: 'Cena en un lugar que siempre quisieron probar', e: '🍽️' },
    { id: 'c14', l: 'afuera', c: 'plata', t: 'Ir al cine y después por un helado', e: '🍦' },
    { id: 'c15', l: 'afuera', c: 'gratis', t: 'Paseo en bici sin rumbo fijo', e: '🚲' },
    { id: 'c16', l: 'afuera', c: 'plata', t: 'Escapada de un día a un pueblo cercano', e: '🚗' },
    { id: 'c17', l: 'afuera', c: 'gratis', t: 'Mirar las estrellas lejos de las luces de la ciudad', e: '✨' },
    { id: 'c18', l: 'afuera', c: 'plata', t: 'Clase de algo nuevo juntos: baile, cocina, cerámica', e: '💃' },
    { id: 'c19', l: 'afuera', c: 'gratis', t: 'Feria o mercado de fin de semana', e: '🛍️' },
    { id: 'c20', l: 'afuera', c: 'plata', t: 'Desayuno o brunch en un café lindo', e: '🥐' }
  ]
};
