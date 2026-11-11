/* Contenido de Intimidad (+18). Se puede editar libremente. Niveles: suave, medio, picante.
   Cada ítem tiene un id fijo (no lo cambies si ya lo usaron: deseos y cupones lo guardan). */
window.INTIM = {
  niveles: [
    { id: 'suave', nombre: 'Suave', emoji: '🌸' },
    { id: 'medio', nombre: 'Medio', emoji: '🌶️' },
    { id: 'picante', nombre: 'Picante', emoji: '🔥' }
  ],
  // Lo que le toca hacer al que gana en los dados
  acciones: {
    suave: ['Dar un abrazo largo de 30 segundos', 'Un masaje en los hombros de 3 minutos', 'Decir tres cosas que te gustan del otro', 'Un beso en la frente y otro en la mano',
      'Bailar lento una canción', 'Elegir la próxima película y preparar el mate o los snacks', 'Hacerle cosquillas suaves en la espalda', 'Un beso de 10 segundos'],
    medio: ['Masaje con crema donde el otro elija', 'Besar el cuello durante 20 segundos', 'Susurrar al oído lo que te gustaría hacer más tarde', 'Sacarle una prenda al otro',
      'Besos con los ojos vendados', 'Elegir la música y bailar muy cerca', 'Un beso en un lugar que el otro elija', 'Masaje en los pies de 5 minutos'],
    picante: ['El ganador decide el próximo juego', 'Dos minutos de besos sin usar las manos', 'Elegir una prenda que el otro se tenga que sacar', 'Cumplir un deseo de la lista de coincidencias',
      'Vendarle los ojos al otro por 5 minutos', 'El ganador manda por 10 minutos', 'Masaje completo con aceite', 'Elegir la habitación y la luz para lo que sigue']
  },
  verdades: {
    suave: ['¿Qué fue lo primero que te gustó de mí?', '¿Cuál es tu recuerdo más romántico de nosotros?', '¿Qué prenda mía te encanta?', '¿Qué beso nuestro no te olvidás?', '¿Qué te pone de buen humor al instante?'],
    medio: ['¿Qué parte de mi cuerpo te gusta más?', '¿Cuál es tu momento favorito para estar juntos?', '¿Qué te gustaría que te haga más seguido?', '¿Tuviste algún sueño conmigo que no me contaste?', '¿Qué te parece más atractivo cuando me arreglo?'],
    picante: ['¿Cuál es tu fantasía que todavía no me contaste?', '¿Cuál fue nuestro mejor encuentro?', '¿Qué lugar te gustaría probar?', '¿Qué te gustaría que yo tome la iniciativa?', '¿Qué palabra mía te enciende?']
  },
  retos: {
    suave: ['Mirarse a los ojos un minuto sin reírse', 'Dar un beso de película', 'Mandarle un mensaje romántico aunque esté al lado', 'Cantarle una canción al oído', 'Elegir juntos un plan para el finde'],
    medio: ['Hacer un baile sensual de 30 segundos', 'Dar un masaje de 3 minutos sin usar las manos', 'Besarse sin tocarse con las manos', 'Elegir una prenda del otro para que se ponga', 'Contar en voz baja qué te gustaría hacer esta noche'],
    picante: ['Quitarse una prenda', 'Dejar que el otro te vende los ojos 3 minutos', 'Elegir dónde besar al otro durante 1 minuto', 'Proponer un juego nuevo para esta noche', 'Cumplir la próxima tirada sin poder decir que no (dentro de los límites acordados)']
  },
  // Reto de la semana: el mismo para los dos, cambia cada semana
  semanales: ['Una cita sin celulares', 'Una noche con velas y música', 'Despertar al otro con un desayuno en la cama', 'Escribirse un mensaje picante por día',
    'Probar algo de la lista de coincidencias', 'Un baño juntos', 'Una noche de masajes', 'Organizar una sorpresa para el otro', 'Una noche de juegos (usen los dados)',
    'Ver juntos una película romántica', 'Ponerse algo especial para el otro', 'Una escapada aunque sea de una noche'],
  // Lista de deseos: cada uno marca en privado sí / tal vez / no. Solo se ven las coincidencias.
  deseos: [
    { id: 'd1', t: 'Masajes con aceite' }, { id: 'd2', t: 'Ducha o baño juntos' }, { id: 'd3', t: 'Vendar los ojos' }, { id: 'd4', t: 'Lencería o ropa especial' },
    { id: 'd5', t: 'Juegos de rol' }, { id: 'd6', t: 'Hacerlo en otro lugar de la casa' }, { id: 'd7', t: 'Una escapada romántica' }, { id: 'd8', t: 'Juguetes para pareja' },
    { id: 'd9', t: 'Velas y música de ambiente' }, { id: 'd10', t: 'Mensajes picantes durante el día' }, { id: 'd11', t: 'Que el otro tome la iniciativa' }, { id: 'd12', t: 'Probar a la mañana' },
    { id: 'd13', t: 'Juegos con hielo o temperatura' }, { id: 'd14', t: 'Bailar algo sensual' }, { id: 'd15', t: 'Fotos privadas solo para nosotros' }, { id: 'd16', t: 'Una noche sin apuro, sin horarios' },
    { id: 'd17', t: 'Algo improvisado en una salida' }, { id: 'd18', t: 'Comida o postre como parte del juego' }, { id: 'd19', t: 'Atar suavemente las manos' }, { id: 'd20', t: 'Ver algo juntos para inspirarse' }
  ],
  // Modelos de cupones para regalar (también se pueden escribir a mano)
  cupones: [
    { e: '💆', t: 'Vale por un masaje' }, { e: '🛁', t: 'Vale por un baño juntos' }, { e: '🍳', t: 'Vale por un desayuno en la cama' }, { e: '🎬', t: 'Vale por elegir la película' },
    { e: '😘', t: 'Vale por 10 besos cuando quieras' }, { e: '🌙', t: 'Vale por una noche especial' }, { e: '🙋', t: 'Vale por un "sí" a lo que pidas (dentro de los límites)' }, { e: '💃', t: 'Vale por un baile privado' }
  ]
};
