/* ¡Encuentra el misterio! · catálogo de temas.
   Cada tema es una lista de categorías; de cada categoría se eligen al azar tantos elementos como posiciones tenga el caso.
   Para añadir un tema: copia un bloque, cambia id/title/emoji/desc/rec y rellena las categorías (mínimo 4 categorías
   para poder jugar en Difícil/Experto, y 8 elementos en cada una para que los casos no se repitan).
   rec = nivel recomendado ('facil'|'medio'|'dificil'|'experto'). Elemento = [nombre, emoji]. Nombres cortos (caben en un móvil). */
window.PP_THEMES=[
 /* ---------- Cotidianos y divertidos (más fáciles) ---------- */
 {id:'ejemplo',title:'Detectives de clase',emoji:'🕵️',rec:'facil',
  desc:'Compañeros, mascotas, frutas y deportes. El más sencillo para estrenar el juego.',
  categories:[
   {key:'nombre',label:'Nombre',icon:'🧒',items:[['Ana','👧'],['Luis','👦'],['Marta','👩'],['Pablo','🧑'],['Lucía','👱‍♀️'],['Hugo','🧔'],['Sara','👩‍🦰'],['Leo','👨‍🦱']]},
   {key:'mascota',label:'Mascota',icon:'🐾',items:[['Perro','🐶'],['Gato','🐱'],['Conejo','🐰'],['Pez','🐟'],['Loro','🦜'],['Tortuga','🐢'],['Hámster','🐹'],['Caballo','🐴']]},
   {key:'fruta',label:'Fruta',icon:'🍎',items:[['Manzana','🍎'],['Plátano','🍌'],['Fresa','🍓'],['Uva','🍇'],['Naranja','🍊'],['Sandía','🍉'],['Pera','🍐'],['Cereza','🍒']]},
   {key:'deporte',label:'Deporte',icon:'🏅',items:[['Fútbol','⚽'],['Baloncesto','🏀'],['Tenis','🎾'],['Natación','🏊'],['Ciclismo','🚴'],['Judo','🥋'],['Atletismo','🏃'],['Voleibol','🏐']]}
  ]},
 {id:'festival',title:'El festival de música',emoji:'🎤',rec:'medio',
  desc:'Quién toca qué, de dónde viene y a qué hora actúa en el festival del instituto.',
  categories:[
   {key:'artista',label:'Artista',icon:'🎤',items:[['Nova','🌟'],['Los Lobos','🐺'],['DJ Pixel','🎧'],['Valeria','👩‍🎤'],['Trueno','⚡'],['Marea','🌊'],['Kiko','🧑‍🎤'],['Eclipse','🌙']]},
   {key:'instr',label:'Instrumento',icon:'🎸',items:[['Guitarra','🎸'],['Batería','🥁'],['Piano','🎹'],['Violín','🎻'],['Trompeta','🎺'],['Saxofón','🎷'],['Micrófono','🎤'],['Bajo','🪕']]},
   {key:'estilo',label:'Estilo',icon:'🎶',items:[['Rock','🤘'],['Pop','🎀'],['Rap','🧢'],['Jazz','🎷'],['Flamenco','💃'],['Electrónica','🔊'],['Reggae','🌴'],['Folk','🍂']]},
   {key:'color',label:'Camiseta',icon:'👕',items:[['Roja','🟥'],['Azul','🟦'],['Verde','🟩'],['Amarilla','🟨'],['Morada','🟪'],['Naranja','🟧'],['Negra','⬛'],['Blanca','⬜']]}
  ]},
 {id:'profesiones',title:'Profesiones y herramientas',emoji:'🧑‍🔧',rec:'medio',
  desc:'Quién trabaja dónde, con qué herramienta y cómo va al trabajo.',
  categories:[
   {key:'prof',label:'Profesión',icon:'💼',items:[['Médica','🧑‍⚕️'],['Cocinero','🧑‍🍳'],['Piloto','🧑‍✈️'],['Bombera','🧑‍🚒'],['Artista','🧑‍🎨'],['Granjero','🧑‍🌾'],['Científica','🧑‍🔬'],['Mecánico','🧑‍🔧']]},
   {key:'herr',label:'Herramienta',icon:'🛠️',items:[['Estetoscopio','🩺'],['Sartén','🍳'],['Mapa','🗺️'],['Manguera','🧯'],['Pincel','🖌️'],['Azada','🌱'],['Microscopio','🔬'],['Llave inglesa','🔧']]},
   {key:'trans',label:'Transporte',icon:'🚌',items:[['Bici','🚲'],['Moto','🛵'],['Autobús','🚌'],['Metro','🚇'],['Coche','🚗'],['Tren','🚆'],['Patinete','🛴'],['A pie','🚶']]},
   {key:'lugar',label:'Lugar',icon:'🏢',items:[['Hospital','🏥'],['Restaurante','🍽️'],['Aeropuerto','🛫'],['Parque','🌳'],['Taller','🏭'],['Laboratorio','🧪'],['Colegio','🏫'],['Museo','🏛️']]}
  ]},
 /* ---------- Cultura de España ---------- */
 {id:'comunidades',title:'Viaje por España',emoji:'🇪🇸',rec:'medio',
  desc:'Comunidades, platos típicos, monumentos y fiestas. Geografía y cultura de España.',
  categories:[
   {key:'ccaa',label:'Comunidad',icon:'🗺️',items:[['Andalucía','☀️'],['Cataluña','🏖️'],['Galicia','🌧️'],['Madrid','🏙️'],['Valencia','🍊'],['Aragón','⛰️'],['Canarias','🌋'],['Asturias','🍏']]},
   {key:'plato',label:'Plato típico',icon:'🍽️',items:[['Gazpacho','🍅'],['Paella','🥘'],['Pulpo','🐙'],['Tortilla','🍳'],['Fabada','🫘'],['Cocido','🍲'],['Churros','🍩'],['Papas arrugadas','🥔']]},
   {key:'monum',label:'Monumento',icon:'🏰',items:[['Alhambra','🕌'],['Sagrada Familia','⛪'],['Catedral de Santiago','⛪'],['Palacio Real','🏛️'],['Teide','🌋'],['Acueducto','🌉'],['Torre de Hércules','🗼'],['Ciudad de las Artes','🏟️']]},
   {key:'fiesta',label:'Fiesta',icon:'🎉',items:[['Fallas','🔥'],['Feria de Abril','💃'],['San Fermín','🐂'],['Tomatina','🍅'],['Carnaval','🎭'],['Semana Santa','🕯️'],['San Juan','🎆'],['Romería','🌼']]}
  ]},
 {id:'historia',title:'Personajes de la Historia',emoji:'📜',rec:'dificil',
  desc:'Personajes, épocas, inventos y lugares. Para repasar Historia de ESO.',
  categories:[
   {key:'pers',label:'Personaje',icon:'👤',items:[['Cleopatra','👑'],['Julio César','🏛️'],['Colón','⛵'],['Isabel la Católica','👸'],['Napoleón','🎩'],['Leonardo da Vinci','🎨'],['Gutenberg','📖'],['Marie Curie','⚛️']]},
   {key:'epoca',label:'Época',icon:'⏳',items:[['Prehistoria','🦴'],['Egipto','🔺'],['Roma','⚔️'],['Edad Media','🏰'],['Renacimiento','🖼️'],['Descubrimiento','🧭'],['Revolución Industrial','🏭'],['Siglo XX','✈️']]},
   {key:'invento',label:'Invento o hito',icon:'💡',items:[['Imprenta','📖'],['Brújula','🧭'],['Máquina de vapor','🚂'],['Penicilina','💊'],['Pirámides','🔺'],['Acueductos','🌉'],['Pólvora','💥'],['Bombilla','💡']]},
   {key:'lugar',label:'Lugar',icon:'📍',items:[['Giza','🐪'],['Roma','🇮🇹'],['Florencia','🌷'],['París','🗼'],['Sevilla','⛪'],['Londres','🎡'],['Atenas','🏺'],['Toledo','🗡️']]}
  ]},
 /* ---------- Curriculares (ESO) ---------- */
 {id:'ciencias',title:'Laboratorio de ciencias',emoji:'🧪',rec:'dificil',
  desc:'Científicos, descubrimientos, ramas de la ciencia y material de laboratorio.',
  categories:[
   {key:'cient',label:'Científico',icon:'🧑‍🔬',items:[['Newton','🍎'],['Marie Curie','⚛️'],['Darwin','🐢'],['Einstein','🧠'],['Galileo','🔭'],['Pasteur','🧫'],['Ramón y Cajal','🔬'],['Mendel','🌱']]},
   {key:'desc',label:'Descubrimiento',icon:'💡',items:[['Gravedad','🍎'],['Radiactividad','☢️'],['Evolución','🦎'],['Relatividad','⏱️'],['Satélites de Júpiter','🪐'],['Vacunas','💉'],['Neuronas','🧠'],['Herencia','🧬']]},
   {key:'rama',label:'Rama',icon:'📚',items:[['Física','⚡'],['Química','🧪'],['Biología','🌿'],['Astronomía','🌌'],['Geología','🪨'],['Medicina','🩺'],['Genética','🧬'],['Ecología','🌍']]},
   {key:'mat',label:'Material',icon:'🥼',items:[['Probeta','🧪'],['Microscopio','🔬'],['Mechero','🔥'],['Balanza','⚖️'],['Telescopio','🔭'],['Matraz','⚗️'],['Termómetro','🌡️'],['Imán','🧲']]}
  ]},
 {id:'geografia',title:'Vuelta al mundo',emoji:'🌍',rec:'dificil',
  desc:'Países, capitales, continentes e idiomas. Geografía mundial.',
  categories:[
   {key:'pais',label:'País',icon:'🏳️',items:[['Japón','🇯🇵'],['Brasil','🇧🇷'],['Egipto','🇪🇬'],['Italia','🇮🇹'],['México','🇲🇽'],['Australia','🇦🇺'],['Francia','🇫🇷'],['India','🇮🇳']]},
   {key:'cap',label:'Capital',icon:'🏙️',items:[['Tokio','🗼'],['Brasilia','🏛️'],['El Cairo','🕌'],['Roma','⛲'],['Ciudad de México','🌮'],['Canberra','🦘'],['París','🥐'],['Nueva Delhi','🛕']]},
   {key:'cont',label:'Continente',icon:'🌐',items:[['Asia','🐼'],['América','🦅'],['África','🦁'],['Europa','🏰'],['Oceanía','🦘']]},
   {key:'idioma',label:'Idioma',icon:'🗣️',items:[['Japonés','あ'],['Portugués','🇵🇹'],['Árabe','ع'],['Italiano','🍝'],['Español','ñ'],['Inglés','🇬🇧'],['Francés','🥖'],['Hindi','ह']]}
  ]},
 {id:'lengua',title:'Biblioteca de Lengua',emoji:'📚',rec:'dificil',
  desc:'Autores, obras, géneros y personajes de la literatura española.',
  categories:[
   {key:'autor',label:'Autor',icon:'✍️',items:[['Cervantes','🛡️'],['Lorca','🌙'],['Bécquer','🌹'],['Machado','🌳'],['Lope de Vega','🎭'],['Quevedo','🧐'],['Rosalía de Castro','🌧️'],['Gloria Fuertes','⭐']]},
   {key:'obra',label:'Obra',icon:'📖',items:[['El Quijote','⚔️'],['Romancero gitano','🐎'],['Rimas y leyendas','🌹'],['Campos de Castilla','🌾'],['Fuenteovejuna','🏘️'],['Los sueños','💭'],['Cantares gallegos','🎶'],['Poeta de guardia','🧸']]},
   {key:'genero',label:'Género',icon:'🎭',items:[['Novela','📕'],['Poesía','🪶'],['Teatro','🎭'],['Leyenda','🐉'],['Ensayo','🧾'],['Cuento','🧚'],['Sátira','🃏'],['Fábula','🦊']]},
   {key:'epoca',label:'Época',icon:'⌛',items:[['Siglo de Oro','🥇'],['Romanticismo','🌹'],['Generación del 27','🖋️'],['Barroco','🎻'],['Generación del 98','📰'],['Edad Media','🏰'],['Posguerra','🕊️'],['Actual','📱']]}
  ]},
 {id:'mates',title:'El club de las Mates',emoji:'📐',rec:'medio',
  desc:'Figuras, números, unidades y herramientas de matemáticas.',
  categories:[
   {key:'fig',label:'Figura',icon:'🔷',items:[['Círculo','⚪'],['Triángulo','🔺'],['Cuadrado','🟦'],['Rombo','🔶'],['Pentágono','⬟'],['Hexágono','⬡'],['Estrella','⭐'],['Óvalo','🥚']]},
   {key:'num',label:'Número',icon:'🔢',items:[['Pi','π'],['Cero','0️⃣'],['Uno','1️⃣'],['Siete','7️⃣'],['Diez','🔟'],['Cien','💯'],['Mil','🔠'],['Un medio','½']]},
   {key:'unidad',label:'Unidad',icon:'📏',items:[['Metro','📏'],['Litro','🥛'],['Kilo','⚖️'],['Hora','⏰'],['Grado','🌡️'],['Euro','💶'],['Segundo','⏱️'],['Hectárea','🌾']]},
   {key:'herr',label:'Herramienta',icon:'📐',items:[['Regla','📏'],['Compás','🧭'],['Escuadra','📐'],['Calculadora','🧮'],['Transportador','📐'],['Ábaco','🧮'],['Lápiz','✏️'],['Cuaderno','📓']]}
  ]},
 /* ---------- Misterio / detectives (los más duros) ---------- */
 {id:'museo',title:'El robo del museo',emoji:'🖼️',rec:'experto',
  desc:'Sospechosos, objetos robados, coartadas y salas. Caso de misterio para expertos.',
  categories:[
   {key:'sosp',label:'Sospechoso',icon:'🕵️',items:[['La guía','👩‍🏫'],['El vigilante','💂'],['La restauradora','👩‍🎨'],['El director','🤵'],['La turista','🧳'],['El conserje','🧹'],['El periodista','📰'],['La estudiante','🎓']]},
   {key:'obj',label:'Objeto robado',icon:'💎',items:[['Diamante','💎'],['Cuadro','🖼️'],['Corona','👑'],['Estatua','🗿'],['Espada','🗡️'],['Vasija','🏺'],['Collar','📿'],['Mapa antiguo','🗺️']]},
   {key:'sala',label:'Sala',icon:'🚪',items:[['Egipto','🔺'],['Pintura','🎨'],['Armas','🛡️'],['Joyas','💍'],['Escultura','🗿'],['Sótano','🔦'],['Tienda','🛍️'],['Terraza','🌇']]},
   {key:'coart',label:'Coartada',icon:'⏰',items:[['Tomaba café','☕'],['Dormía','😴'],['Hacía fotos','📸'],['Llamaba','📞'],['Leía','📖'],['Comía','🥪'],['Paseaba','🚶'],['Limpiaba','🧽']]}
  ]},
 {id:'crucero',title:'Misterio en el crucero',emoji:'🚢',rec:'experto',
  desc:'Pasajeros, camarotes, destinos y pistas a bordo. Para detectives con experiencia.',
  categories:[
   {key:'pasaj',label:'Pasajero',icon:'🧳',items:[['La condesa','👑'],['El capitán','⚓'],['La cantante','🎤'],['El chef','👨‍🍳'],['La doctora','🩺'],['El mago','🎩'],['La escritora','✒️'],['El marinero','🧑‍✈️']]},
   {key:'cam',label:'Camarote',icon:'🚪',items:[['Rojo','🟥'],['Azul','🟦'],['Verde','🟩'],['Dorado','🟨'],['Plata','⬜'],['Morado','🟪'],['Naranja','🟧'],['Negro','⬛']]},
   {key:'dest',label:'Destino',icon:'🏝️',items:[['Barcelona','🏖️'],['Lisboa','🚋'],['Nápoles','🍕'],['Atenas','🏺'],['Estambul','🕌'],['Dubrovnik','🏰'],['Marsella','⚓'],['Mallorca','🌴']]},
   {key:'obj',label:'Objeto',icon:'🔍',items:[['Llave','🗝️'],['Carta','✉️'],['Prismáticos','🔭'],['Anillo','💍'],['Reloj','⌚'],['Maleta','🧳'],['Pañuelo','🧣'],['Brújula','🧭']]}
  ]}
];
