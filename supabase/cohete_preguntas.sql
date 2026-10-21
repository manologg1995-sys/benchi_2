-- Banco común de preguntas para "Cohete al límite" (teacher_id = null, visibles para todo el profesorado).
-- Solo datos estables que no cambian con el tiempo. Se puede ejecutar varias veces: no duplica.
insert into public.cg_questions (teacher_id, text, answer, unit, category)
select null, q.text, q.answer, q.unit, q.category
from (values
  -- Economía y empresa
  ('¿En qué año empezaron a circular los billetes y monedas de euro en España?', 2002, '', 'Economía'),
  ('¿Cuántas monedas distintas de euro existen?', 8, 'monedas', 'Economía'),
  ('¿Cuántos valores distintos de billetes de euro se han emitido?', 7, 'billetes', 'Economía'),
  ('¿Cuál es el tipo general de IVA en España?', 21, '%', 'Economía'),
  ('¿En qué año se creó la peseta?', 1868, '', 'Economía'),
  ('¿Cuántos años estuvo en circulación la peseta (de 1868 a 2002)?', 134, 'años', 'Economía'),
  ('¿En qué año fue el crac de la Bolsa de Wall Street que inició la Gran Depresión?', 1929, '', 'Economía'),
  ('¿En qué año quebró el banco Lehman Brothers?', 2008, '', 'Economía'),
  ('¿En qué año se creó el Banco Central Europeo?', 1998, '', 'Economía'),
  ('¿En qué año se fundó el Banco de San Carlos, antecedente del Banco de España?', 1782, '', 'Economía'),
  ('¿En qué año se aprobó el primer Estatuto de los Trabajadores?', 1980, '', 'Economía'),
  ('¿Cuál es la edad mínima para trabajar en España?', 16, 'años', 'Economía'),
  ('¿Cuántos días naturales de vacaciones al año como mínimo marca la ley en España?', 30, 'días', 'Economía'),
  ('¿Cuántas pagas extraordinarias al año como mínimo marca el Estatuto de los Trabajadores?', 2, 'pagas', 'Economía'),
  ('¿En qué año se instaló el primer cajero automático del mundo?', 1967, '', 'Economía'),
  ('¿En qué año entró España en la Comunidad Económica Europea?', 1986, '', 'Economía'),
  ('¿Cuántos Estados miembros tiene la Unión Europea?', 27, 'países', 'Economía'),
  ('¿Cuántos países son miembros de la ONU?', 193, 'países', 'Economía'),
  -- Empresas y emprendimiento
  ('¿En qué año se fundó Apple?', 1976, '', 'Empresas'),
  ('¿En qué año se fundó Google?', 1998, '', 'Empresas'),
  ('¿En qué año se fundó Amazon?', 1994, '', 'Empresas'),
  ('¿En qué año se fundó Facebook?', 2004, '', 'Empresas'),
  ('¿En qué año se creó WhatsApp?', 2009, '', 'Empresas'),
  ('¿En qué año se creó YouTube?', 2005, '', 'Empresas'),
  ('¿En qué año se presentó el primer iPhone?', 2007, '', 'Empresas'),
  ('¿En qué año nació Wikipedia?', 2001, '', 'Empresas'),
  ('¿En qué año se inventó la Coca-Cola?', 1886, '', 'Empresas'),
  ('¿En qué año abrió la primera tienda de Zara, en A Coruña?', 1975, '', 'Empresas'),
  ('¿En qué año se fundó Mercadona?', 1977, '', 'Empresas'),
  ('¿En qué año abrieron los hermanos McDonald su primer restaurante?', 1940, '', 'Empresas'),
  ('¿Cuántos caracteres podía tener como máximo un tuit cuando nació Twitter?', 140, 'caracteres', 'Empresas'),
  ('¿Cuántas casillas tiene el tablero del Monopoly?', 40, 'casillas', 'Empresas'),
  -- Cultura general
  ('¿En qué año se aprobó la Constitución española?', 1978, '', 'Cultura general'),
  ('¿Cuántos artículos tiene la Constitución española?', 169, 'artículos', 'Cultura general'),
  ('¿Cuántas comunidades autónomas tiene España?', 17, 'comunidades', 'Cultura general'),
  ('¿Cuántos diputados tiene el Congreso de los Diputados?', 350, 'diputados', 'Cultura general'),
  ('¿Cuántos metros de altura tiene el Mulhacén?', 3479, 'm', 'Cultura general'),
  ('¿Cuántos metros de altura tiene el Teide?', 3715, 'm', 'Cultura general'),
  ('¿A cuántos kilómetros está de media la Luna de la Tierra?', 384400, 'km', 'Cultura general'),
  ('¿Cuántos kilómetros recorre la luz en un segundo?', 299792, 'km', 'Cultura general'),
  ('¿Cuántos huesos tiene el cuerpo humano adulto?', 206, 'huesos', 'Cultura general'),
  ('¿Cuántas teclas tiene un piano estándar?', 88, 'teclas', 'Cultura general'),
  ('¿Cuántos años duró la Guerra de los Cien Años?', 116, 'años', 'Cultura general'),
  ('¿A cuántos grados Fahrenheit hierve el agua?', 212, '°F', 'Cultura general'),
  ('¿En qué año se inauguró el Metro de Madrid?', 1919, '', 'Cultura general'),
  ('¿En qué año cayó el Muro de Berlín?', 1989, '', 'Cultura general'),
  ('¿Cuántos kilómetros mide una maratón?', 42.195, 'km', 'Cultura general'),
  ('¿Cuántos segundos tiene una hora?', 3600, 'segundos', 'Cultura general')
) as q(text, answer, unit, category)
where not exists (select 1 from public.cg_questions c where c.teacher_id is null and c.text = q.text);
