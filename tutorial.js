/* Tutorial de bienvenida para profesorado nuevo en Benchi.
   - Se abre solo la primera vez que entra un profesor que aún no tiene aulas.
   - Botón «Saltar tutorial» en todos los pasos (y tecla Esc). Al saltarlo o terminarlo
     se guarda en la cuenta (user_metadata de Supabase) y en el navegador, así no vuelve a salir.
   - Se puede repetir desde Configuración → «Ver tutorial».
   Uso: BenchiTour.maybeStart()  /  BenchiTour.start() */
(function(){
'use strict';

const LS_KEY = uid => 'benchi_tour_done_' + uid;

/* ---------- Textos (es / en) ---------- */
const TXT = {
  es: {
    skip:'Saltar tutorial', next:'Siguiente', prev:'Atrás', start:'Empezar', finish:'Crear mi primera aula', later:'Ir al inicio',
    step:'Paso {n} de {t}', close:'Cerrar tutorial',
    s0_t:'¡Hola, {name}! Bienvenido a Benchi', s0_p:'En menos de un minuto te enseñamos lo básico: crear un aula, dar puntos, montar el mercado de recompensas y lanzar minijuegos.',
    s1_t:'1. Crea tu primera aula', s1_p:'Pulsa «Crear aula», ponle un nombre (por ejemplo «4.º ESO B»), el curso y elige un color. Puedes tener tantas aulas como grupos.',
    s2_t:'2. Comparte el código', s2_p:'Cada aula tiene un código propio. Tu alumnado se crea su cuenta de alumno, pulsa «Unirme a una clase» y escribe el código. Como en Classroom.',
    s2_code:'Código',
    s3_t:'3. Define los comportamientos', s3_p:'En la pestaña «Comportamientos» decides qué suma y qué resta puntos. Tienes sugerencias listas para añadir con un clic.',
    s3_a:'Participa en clase', s3_b:'Ayuda a un compañero', s3_c:'Olvida el material',
    s4_t:'4. Da puntos en segundos', s4_p:'En «Alumnado» eliges el comportamiento y pulsas «Aplicar». Marca varios alumnos para dar puntos a todo el grupo de una vez.',
    s4_apply:'Aplicar',
    s5_t:'5. Monta el mercado', s5_p:'En «Recompensas» creas lo que el alumnado puede canjear con sus puntos. En «Avatares» añades objetos para personalizar su personaje.',
    s5_a:'Elegir sitio un día', s5_b:'5 min extra de recreo', s5_c:'Sombrero épico',
    s6_t:'6. Minijuegos para toda la clase', s6_p:'Desde la pestaña «Minijuegos» del aula tienes juegos en directo. El alumnado juega desde su dispositivo y los puntos se reparten solos al terminar.',
    g_horses:'Carrera de caballos', g_horses_d:'Apuestan o votan por un caballo',
    g_cruise:'Crucero al límite', g_cruise_d:'Estimación numérica sin pasarse',
    g_mystery:'¡Encuentra el misterio!', g_mystery_d:'Resuelven un caso con pistas',
    g_super:'El Súper de Clase', g_super_d:'Juegos adaptados para alumnado NEE',
    s7_t:'7. Cómo lanzar un juego', s7_p:'Así se inicia cualquier minijuego:',
    s7_1:'Entra en tu aula y abre la pestaña <b>Minijuegos</b>.',
    s7_2:'Elige el juego arriba y <b>activa el interruptor</b> para que lo vea el alumnado.',
    s7_3:'Ajusta las reglas (tiempo, modo…) y pulsa <b>Comenzar ronda</b> o <b>Lanzar</b>.',
    s7_4:'Proyecta tu pantalla: verás en directo quién juega y los resultados.',
    s8_t:'¡Todo listo!', s8_p:'Empieza creando tu primera aula. Si quieres repasar esto más adelante, lo tienes en Configuración → «Ver tutorial».',
    replay_label:'Tutorial de bienvenida', replay_btn:'Ver tutorial', replay_hint:'Vuelve a ver la guía rápida de Benchi.'
  },
  en: {
    skip:'Skip tutorial', next:'Next', prev:'Back', start:'Start', finish:'Create my first class', later:'Go to home',
    step:'Step {n} of {t}', close:'Close tutorial',
    s0_t:'Hi {name}! Welcome to Benchi', s0_p:'In under a minute we\'ll show you the basics: creating a class, giving points, setting up the rewards market and launching minigames.',
    s1_t:'1. Create your first class', s1_p:'Click «Create class», give it a name (e.g. «Year 10 B»), the course and pick a colour. You can have as many classes as groups.',
    s2_t:'2. Share the code', s2_p:'Every class has its own code. Students create a student account, click «Join a class» and type the code. Just like Classroom.',
    s2_code:'Code',
    s3_t:'3. Define behaviours', s3_p:'In the «Behaviours» tab you decide what adds and what takes away points. There are ready-made suggestions you can add in one click.',
    s3_a:'Participates in class', s3_b:'Helps a classmate', s3_c:'Forgets materials',
    s4_t:'4. Give points in seconds', s4_p:'In «Students» pick a behaviour and click «Apply». Tick several students to give points to the whole group at once.',
    s4_apply:'Apply',
    s5_t:'5. Set up the market', s5_p:'In «Rewards» you create what students can buy with their points. In «Avatars» you add items to customise their character.',
    s5_a:'Choose your seat for a day', s5_b:'5 extra minutes of break', s5_c:'Epic hat',
    s6_t:'6. Minigames for the whole class', s6_p:'The class «Minigames» tab has live games. Students play from their own device and points are shared out automatically at the end.',
    g_horses:'Horse race', g_horses_d:'Bet or vote for a horse',
    g_cruise:'Crucero al límite', g_cruise_d:'Number estimation without going over',
    g_mystery:'¡Encuentra el misterio!', g_mystery_d:'Solve a case with clues',
    g_super:'El Súper de Clase', g_super_d:'Adapted games for SEN students',
    s7_t:'7. How to launch a game', s7_p:'This is how you start any minigame:',
    s7_1:'Open your class and go to the <b>Minigames</b> tab.',
    s7_2:'Pick the game at the top and <b>turn on the switch</b> so students can see it.',
    s7_3:'Adjust the rules (time, mode…) and click <b>Start round</b> or <b>Launch</b>.',
    s7_4:'Project your screen: you\'ll see live who is playing and the results.',
    s8_t:'All set!', s8_p:'Start by creating your first class. To go over this again later, find it in Settings → «View tutorial».',
    replay_label:'Welcome tutorial', replay_btn:'View tutorial', replay_hint:'See the Benchi quick guide again.'
  }
};
const ST = () => (typeof state !== 'undefined' ? state : null);
const lang = () => (ST() && ST().lang === 'en') ? 'en' : 'es';
const T = (k, vars) => {
  let s = (TXT[lang()][k] != null ? TXT[lang()][k] : TXT.es[k]) || k;
  if (vars) Object.keys(vars).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
  return s;
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Ilustraciones (mini maquetas con el estilo de la app) ---------- */
const ART = {
  welcome: () => `<div class="bt-art bt-art-welcome"><div class="bt-burst">🎉</div><div class="bt-coins"><span>+5</span><span>+10</span><span>+3</span></div></div>`,
  create: () => `<div class="bt-art"><div class="bt-mock">
      <div class="bt-field"><i>${T('s1_t').replace(/^1\.\s*/,'')}</i><span class="bt-input">4.º ESO B</span></div>
      <div class="bt-swatches"><b style="background:linear-gradient(135deg,#635bff,#a162ff)"></b><b style="background:linear-gradient(135deg,#28c6e8,#635bff)"></b><b style="background:linear-gradient(135deg,#ff5a9d,#ffc857)"></b><b style="background:linear-gradient(135deg,#35c77f,#28c6e8)"></b></div>
    </div></div>`,
  code: () => `<div class="bt-art"><div class="bt-hero"><div class="bt-hero-name">4.º ESO B</div><span class="bt-chip">${T('s2_code')} <b>BEN-7K2Q</b></span></div>
      <div class="bt-arrow">⬇</div><div class="bt-mock bt-join"><span class="bt-input">BEN-7K2Q</span><span class="bt-btn">✓</span></div></div>`,
  behaviors: () => `<div class="bt-art"><div class="bt-mock bt-list">
      <div class="bt-row"><span class="bt-ic pos">+</span>${T('s3_a')}<em>+5</em></div>
      <div class="bt-row"><span class="bt-ic pos">+</span>${T('s3_b')}<em>+3</em></div>
      <div class="bt-row"><span class="bt-ic neg">−</span>${T('s3_c')}<em class="neg">−2</em></div>
    </div></div>`,
  points: () => `<div class="bt-art"><div class="bt-mock bt-list">
      <div class="bt-row"><span class="bt-check on">✓</span><span class="bt-av">🦊</span>Lucía<span class="bt-sel">+5 · ${T('s3_a')}</span><span class="bt-btn sm">${T('s4_apply')}</span></div>
      <div class="bt-row"><span class="bt-check on">✓</span><span class="bt-av">🐼</span>Hugo<span class="bt-pts bt-pop">+5</span></div>
      <div class="bt-row"><span class="bt-check"></span><span class="bt-av">🦉</span>Sara</div>
    </div></div>`,
  market: () => `<div class="bt-art"><div class="bt-shop">
      <div class="bt-item"><div class="bt-item-ic">🪑</div><div>${T('s5_a')}</div><span class="bt-chip">40 pts</span></div>
      <div class="bt-item"><div class="bt-item-ic">⏰</div><div>${T('s5_b')}</div><span class="bt-chip">60 pts</span></div>
      <div class="bt-item"><div class="bt-item-ic">🎩</div><div>${T('s5_c')}</div><span class="bt-chip epic">✦</span></div>
    </div></div>`,
  games: () => `<div class="bt-art"><div class="bt-games">
      ${[['🏇','g_horses'],['🚢','g_cruise'],['🕵️','g_mystery'],['🛒','g_super']].map(([e,k])=>`<div class="bt-game"><span>${e}</span><div><b>${T(k)}</b><small>${T(k+'_d')}</small></div></div>`).join('')}
    </div></div>`,
  launch: () => `<div class="bt-art bt-art-steps"><ol class="bt-steps">
      <li><span>1</span><p>${T('s7_1')}</p></li>
      <li><span>2</span><p>${T('s7_2')} <i class="bt-switch"></i></p></li>
      <li><span>3</span><p>${T('s7_3')}</p></li>
      <li><span>4</span><p>${T('s7_4')}</p></li>
    </ol></div>`,
  done: () => `<div class="bt-art bt-art-welcome"><div class="bt-burst">🚀</div></div>`
};

/* target: selectores del elemento real que se ilumina (el primero visible); si no hay, la tarjeta va centrada */
const STEPS = [
  { t:'s0_t', p:'s0_p', art:'welcome', first:true },
  { t:'s1_t', p:'s1_p', art:'create', target:['#teacher .head-actions .btn-primary','#teacher .nav-item[data-route="teacher-create"]'] },
  { t:'s2_t', p:'s2_p', art:'code' },
  { t:'s3_t', p:'s3_p', art:'behaviors' },
  { t:'s4_t', p:'s4_p', art:'points' },
  { t:'s5_t', p:'s5_p', art:'market' },
  { t:'s6_t', p:'s6_p', art:'games' },
  { t:'s7_t', p:'s7_p', art:'launch' },
  { t:'s8_t', p:'s8_p', art:'done', last:true }
];

/* ---------- Estado ---------- */
let idx = 0, root = null, lastFocus = null, onResize = null;

function uid(){ return ST() && ST().profile ? ST().profile.id : null; }
function isDone(){
  const id = uid(); if (!id) return true;
  try { if (localStorage.getItem(LS_KEY(id))) return true; } catch(e) {}
  const meta = state.session && state.session.user && state.session.user.user_metadata;
  return !!(meta && meta.benchi_tour_done);
}
function markDone(){
  const id = uid(); if (!id) return;
  try { localStorage.setItem(LS_KEY(id), '1'); } catch(e) {}
  // Se guarda también en la cuenta para que no vuelva a salir en otro dispositivo
  try {
    if (typeof sb !== 'undefined' && sb.auth && sb.auth.updateUser) {
      sb.auth.updateUser({ data: { benchi_tour_done: true } }).then(r => {
        if (r && r.data && r.data.user && state.session) state.session.user = r.data.user;
      }).catch(() => {});
    }
  } catch(e) {}
}

/* Solo profesorado nuevo: rol profesor, sin aulas todavía y sin haberlo visto/saltado antes */
function maybeStart(){
  if (!ST() || !ST().profile || ST().profile.role !== 'profesor') return;
  if (isDone()) return;
  if ((state.myClasses || []).length) { markDone(); return; }
  setTimeout(start, 350);
}

function start(){
  close(true);
  idx = 0; position.scrolled = -1;
  lastFocus = document.activeElement;
  root = document.createElement('div');
  root.className = 'bt-root';
  root.innerHTML = `<div class="bt-shade"></div><div class="bt-spot" aria-hidden="true"></div>
    <div class="bt-card" role="dialog" aria-modal="true" aria-labelledby="bt-title" aria-describedby="bt-desc" tabindex="-1"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('bt-open');
  document.addEventListener('keydown', onKey, true);
  onResize = () => position();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  requestAnimationFrame(() => { root.classList.add('show'); render(); });
}

function close(silent){
  document.removeEventListener('keydown', onKey, true);
  if (onResize) { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); onResize = null; }
  document.body.classList.remove('bt-open');
  if (root) { const r = root; root = null; r.classList.remove('show'); setTimeout(() => r.remove(), silent ? 0 : 220); }
  if (!silent && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch(e) {} }
}

function skip(){ markDone(); close(); }
function finish(goCreate){
  markDone(); close();
  if (goCreate && typeof showDashboard === 'function') showDashboard('teacher', 'create');
}
function go(i){ if (!root) return; idx = Math.max(0, Math.min(STEPS.length - 1, i)); render(); }

function render(){
  const s = STEPS[idx], card = root.querySelector('.bt-card');
  const name = state.profile && state.profile.name ? state.profile.name.split(' ')[0] : '';
  const total = STEPS.length - 2; // los pasos numerados (sin bienvenida ni final)
  const counter = (!s.first && !s.last) ? `<span class="bt-count">${T('step', { n: idx, t: total })}</span>` : '';
  const dots = STEPS.map((_, j) => `<button type="button" class="bt-dot ${j === idx ? 'on' : ''} ${j < idx ? 'past' : ''}" aria-label="${j + 1}" ${j === idx ? 'aria-current="step"' : ''} onclick="BenchiTour.go(${j})"></button>`).join('');
  let actions;
  if (s.first) actions = `<button type="button" class="btn btn-ghost bt-skip" onclick="BenchiTour.skip()">${T('skip')}</button>
      <button type="button" class="btn btn-primary bt-main" onclick="BenchiTour.go(1)">${T('start')} <svg class="icon"><use href="#i-arrow"/></svg></button>`;
  else if (s.last) actions = `<button type="button" class="btn btn-light" onclick="BenchiTour.finish(false)">${T('later')}</button>
      <button type="button" class="btn btn-primary bt-main" onclick="BenchiTour.finish(true)"><svg class="icon"><use href="#i-plus"/></svg> ${T('finish')}</button>`;
  else actions = `<button type="button" class="btn btn-ghost bt-skip" onclick="BenchiTour.skip()">${T('skip')}</button>
      <span class="bt-grow"></span>
      <button type="button" class="btn btn-light" onclick="BenchiTour.go(${idx - 1})"><svg class="icon"><use href="#i-back"/></svg><span class="bt-hide-xs">${T('prev')}</span></button>
      <button type="button" class="btn btn-primary bt-main" onclick="BenchiTour.go(${idx + 1})">${T('next')} <svg class="icon"><use href="#i-arrow"/></svg></button>`;
  card.innerHTML = `
    <button type="button" class="bt-x" onclick="BenchiTour.skip()" aria-label="${T('close')}" title="${T('skip')}"><svg class="icon"><use href="#i-close"/></svg></button>
    ${ART[s.art]()}
    <div class="bt-body">
      ${counter}
      <h2 id="bt-title">${esc(T(s.t, { name }))}</h2>
      <p id="bt-desc">${T(s.p)}</p>
    </div>
    <div class="bt-dots" role="group">${dots}</div>
    <div class="bt-actions">${actions}</div>`;
  card.classList.remove('bt-anim'); void card.offsetWidth; card.classList.add('bt-anim');
  position();
  const main = card.querySelector('.bt-main');
  (main || card).focus({ preventScroll: true });
}

function findTarget(sel){
  if (!sel) return null;
  for (const q of sel) {
    const el = document.querySelector(q);
    if (el && el.offsetParent !== null) { const r = el.getBoundingClientRect(); if (r.width && r.height) return el; }
  }
  return null;
}

function position(){
  if (!root) return;
  const s = STEPS[idx], card = root.querySelector('.bt-card'), spot = root.querySelector('.bt-spot');
  const el = findTarget(s.target);
  const mobile = window.innerWidth <= 640;
  const wasSpot = root.classList.contains('has-spot');
  spot.style.transition = wasSpot ? '' : 'none';
  root.classList.toggle('has-spot', !!el);
  card.classList.remove('bt-anchored');
  card.style.left = card.style.top = '';
  if (!el) return;
  if (position.scrolled !== idx) { // solo desplazar si el elemento no se ve (en móvil, por encima de la hoja)
    position.scrolled = idx;
    const r0 = el.getBoundingClientRect(), limit = mobile ? window.innerHeight * 0.45 : window.innerHeight - 20;
    if (r0.top < 70 || r0.bottom > limit) window.scrollBy(0, r0.top - (mobile ? 90 : window.innerHeight / 2 - r0.height / 2));
  }
  const r = el.getBoundingClientRect(), pad = 8;
  spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
  spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
  if (mobile) return; // en móvil la tarjeta va abajo como hoja
  card.classList.add('bt-anchored');
  const cw = card.offsetWidth, ch = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 18;
  let left, top;
  if (r.right + gap + cw < vw - 12) { left = r.right + gap; top = r.top + r.height / 2 - ch / 2; }      // a la derecha
  else if (r.bottom + gap + ch < vh - 12) { top = r.bottom + gap; left = r.left + r.width / 2 - cw / 2; } // debajo
  else { top = r.top - gap - ch; left = r.left + r.width / 2 - cw / 2; }                                // encima
  // si queda a la derecha del todo (botón de cabecera), mejor debajo y alineada a la derecha
  if (r.left > vw * 0.55 && r.bottom + gap + ch < vh - 12) { top = r.bottom + gap; left = r.right - cw; }
  card.style.left = Math.max(12, Math.min(vw - cw - 12, left)) + 'px';
  card.style.top = Math.max(12, Math.min(vh - ch - 12, top)) + 'px';
}

function onKey(e){
  if (!root) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); return; }
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight' && idx < STEPS.length - 1) { e.preventDefault(); go(idx + 1); }
  else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); go(idx - 1); }
  else if (e.key === 'Tab') { // mantener el foco dentro de la tarjeta
    const f = [...root.querySelectorAll('.bt-card button')];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
}

/* Repetir el tutorial desde Configuración */
async function replay(){
  if (typeof showDashboard === 'function') await showDashboard('teacher', 'home');
  start();
}
function settingsHTML(){
  return `<div class="field bt-replay" style="margin-top:15px"><label>${T('replay_label')}</label>
    <div class="bt-replay-row"><span class="small-muted">${T('replay_hint')}</span>
    <button type="button" class="btn btn-light" onclick="BenchiTour.replay()">▶ ${T('replay_btn')}</button></div></div>`;
}

window.BenchiTour = { maybeStart, start, skip, finish, go, replay, settingsHTML };
})();
