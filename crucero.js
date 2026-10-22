/* Minijuegos de Benchi · "Crucero al límite" + selector de minijuegos.
   Juego de estimación por turnos: todas las respuestas son números. Cada alumno sube la cifra,
   sigue a bordo o dice «¡Por aquí no paso!». Gana quien se acerca sin pasarse.
   El alumnado no apuesta nada: solo puede ganar puntos.
   Todo lo que toca puntos pasa por funciones de Supabase (supabase/crucero.sql).
   Uso: MG.mountTeacher(classId, el) / MG.mountStudent(classId, el). */
(function(){
'use strict';

const NAME='Crucero al límite';
const STOP='¡Por aquí no paso!';
const POLL_MS=1500;
const KEEP=['cr-num','cr-q-text','cr-q-ans','cr-q-unit'];
const BOARD_TIMES=[20,30,45,60,90], TURN_TIMES=[10,15,20,30,45], VALUES=[1,2,3,5];
// En el juego se ganan MILLAS (× valor de la ronda); cada RATE millas = 1 punto de Benchi.
// Debe coincidir con cr_reveal en supabase/crucero_millas.sql
const PTS={captain:[4,0],crew:[2,0],stopped:[0,2],exact:6};
const RATE=5;
const mi=n=>`${n} ${n===1?'milla':'millas'}`;

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n==null?'—':Number(n).toLocaleString('es-ES',{maximumFractionDigits:2});
const withUnit=(n,u)=>num(n)+(u?' '+u:'');
const signed=n=>(n>0?'+':n<0?'−':'')+Math.abs(n);
const mmss=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
const first=n=>String(n||'').trim().split(/\s+/)[0]||'?';
// "3.715" → 3.715 ; "1.234,5" → 1234.5 ; "42,195" → 42.195
function parseNum(s){
  s=String(s||'').trim().replace(/\s/g,'');
  if(!s)return null;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  if(!/^\d+(\.\d+)?$/.test(s))return null;
  const n=Math.round(parseFloat(s)*100)/100;
  return isFinite(n)?n:null;
}

/* ---------- Dibujos ---------- */
function shipSVG(size,sail){
  size=size||64;
  return `<svg class="cr-ship ${sail?'sail':''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  ${sail?'<path class="cr-smoke" d="M45 9 q3-4 7-3 q3-4 7 0" fill="none" stroke="#c9cde0" stroke-width="2.6" stroke-linecap="round"/>':''}
  <path d="M42 22 L44 11 L51 11 L51 22Z" fill="#ff5a9d" stroke="#172033" stroke-width="2" stroke-linejoin="round"/>
  <path d="M43.2 15 L51 15" stroke="#172033" stroke-width="2"/>
  <path d="M14 30 L18 22 L54 22 L54 30Z" fill="#fff" stroke="#172033" stroke-width="2" stroke-linejoin="round"/>
  <path d="M9 38 L12 30 L57 30 L57 38Z" fill="#fff" stroke="#172033" stroke-width="2" stroke-linejoin="round"/>
  <g fill="#28c6e8">${[22,28,34,40,46].map(x=>`<rect x="${x}" y="24.5" width="3.6" height="3" rx="1"/>`).join('')}${[16,22,28,34,40,46,52].map(x=>`<circle cx="${x}" cy="34" r="1.7"/>`).join('')}</g>
  <path d="M3 38 L61 38 L55 50 L10 50Z" fill="#635bff" stroke="#172033" stroke-width="2" stroke-linejoin="round"/>
  <path d="M7 44 L58 44" stroke="#fff" stroke-width="1.6" opacity=".7"/>
  <path class="cr-wave" d="M0 55 q4-3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" fill="none" stroke="#28c6e8" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;
}
const helpIcon=()=>`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.2" fill="currentColor"/></svg>`;
const clock=()=>`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const coin=()=>`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c27a0a" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>`;
const onChip=t=>`<span class="hg-chip green hg-live"><span class="hg-dot"></span>${t}</span>`;

/* ---------- Estado del módulo ---------- */
let M=null;
const now=()=>Date.now()+M.offset;

function mount(role,classId,root,opts){
  unmount();
  opts=opts||{};
  M={role,classId,root,st:null,err:null,offset:0,key:'',busy:false,help:false,bank:null,bankOpen:false,
     onBack:opts.onBack||null,dirty:false,draft:'',draftRound:null,
     cfg:{value:1,board:30,turn:20,question:'',newMatch:false,source:'benchi',level:'',newLevel:'intermedio'},polling:false};
  root.classList.add('hg','cr');
  root.innerHTML='<div class="hg-card hg-muted">Cargando…</div>';
  M.pollT=setInterval(poll,POLL_MS);
  if(role==='teacher')loadBank();
  M.tickT=setInterval(tick,250);
  poll();
}
function unmount(){
  if(!M)return;
  clearInterval(M.pollT);clearInterval(M.tickT);
  M=null;
}
async function poll(){
  const m=M;if(!m||m.polling)return;
  m.polling=true;
  const t0=Date.now();
  try{
    const{data,error}=await sb.rpc('cr_state',{p_class:m.classId});
    if(M!==m)return;
    if(error)throw error;
    m.st=data;m.err=null;m.offset=data.now-(t0+Date.now())/2;
  }catch(e){
    if(M!==m)return;
    m.err=e.message||String(e);
  }finally{m.polling=false}
  refresh();
}
function tick(){
  if(!M)return;
  if(!document.body.contains(M.root)){unmount();return}
  live();
}

/* ---------- Fases ---------- */
function derive(){
  const st=M.st;
  if(!st)return{ph:'loading'};
  if(!st.enabled)return{ph:'off',r:st.round};
  const r=st.round;
  if(!r||r.status==='cancelled')return{ph:'lobby',r};
  const me=r.players.find(p=>p.id===st.me)||null;
  return{ph:r.status,r,me,myTurn:r.status==='playing'&&r.current===st.me};
}
const secsLeft=t=>Math.max(0,Math.ceil((t-now())/1000));

function refresh(){
  if(!M)return;
  if(!M.st){if(M.err)M.root.innerHTML=`<div class="hg-card"><div class="hg-notice">${esc(M.err)}</div><button class="hg-btn ghost" onclick="CR.act('retry')">Reintentar</button></div>`;return}
  const d=derive(),r=d.r;
  // Solo se repinta cuando cambia algo visible; los relojes se actualizan en live()
  const key=JSON.stringify([d.ph,r&&r.id,r&&r.turn,r&&r.bid,r&&r.players.map(p=>p.status+(p.delta==null?'':p.delta)).join(),r&&r.events.length&&r.events[0].id,
    M.st.enabled,M.st.board,M.help,M.bankOpen,M.bank&&M.bank.length,M.busy,M.role==='teacher'?M.cfg:0,M.st.my_points,M.st.my_millas]);
  if(key!==M.key){
    // No perder lo que se está escribiendo al repintar
    const keep={};KEEP.forEach(id=>{const e=M.root.querySelector('#'+id);if(e)keep[id]=e.value});
    const focused=document.activeElement&&KEEP.includes(document.activeElement.id)?document.activeElement.id:null;
    if(keep['cr-num']!=null)M.draft=keep['cr-num'];
    M.key=key;M.root.innerHTML=M.role==='teacher'?teacherHTML(d):studentHTML(d);
    KEEP.forEach(id=>{const e=M.root.querySelector('#'+id);if(e&&keep[id]!=null)e.value=keep[id]});
    const ni=M.root.querySelector('#cr-num');if(ni){ni.value=M.draft;if(!focused&&d.myTurn&&!M.help)ni.focus();updateRaise()}
    if(focused){const f=M.root.querySelector('#'+focused);if(f){f.focus();try{f.setSelectionRange(f.value.length,f.value.length)}catch(e){}}}
    if(M.role==='student'&&d.ph==='revealed')syncPoints(d);
  }
  live();
  tabAlert(d);
}
function tabAlert(d){
  if(M.role!=='student')return;
  const el=document.querySelector('.teacher-tab[data-tab="minigames"]');
  if(el)el.classList.toggle('hg-tab-live',(d.ph==='boarding'&&!d.me)||!!d.myTurn);
}
function live(){
  if(!M||!M.st)return;
  const d=derive(),r=d.r;
  M.root.querySelectorAll('[data-cr-board]').forEach(e=>e.textContent=mmss(secsLeft(r.boarding_closes_at)));
  M.root.querySelectorAll('[data-cr-turn]').forEach(e=>{
    const s=r&&r.turn_deadline?secsLeft(r.turn_deadline):0;
    e.textContent=s;
    const ring=e.closest('.cr-timer');if(ring){ring.style.setProperty('--p',Math.max(0,Math.min(1,s/r.turn_secs)));ring.classList.toggle('low',s<=5)}
  });
}

/* ---------- Textos de reglas ---------- */
function outcomeLine(role,v){
  const[a,b]=PTS[role];
  return `si no se pasa <b class="${a>0?'hg-pos':''}">${a?'+'+mi(a*v):'0'}</b> · si se pasa <b class="${b>0?'hg-pos':''}">${b?'+'+mi(b*v):'0'}</b>`;
}
function scoreTable(v){
  const u='';
  const c=n=>`<td class="n ${n>0?'hg-pos':n<0?'hg-neg':''}">${signed(n*v)}${n?u:''}</td>`;
  return `<table class="hg-t cr-score"><thead><tr><th>Millas</th><th class="n">No se pasa</th><th class="n">Se pasa</th></tr></thead><tbody>
    <tr><td><b>Capitán</b><div class="hg-meta">dijo la cifra final</div></td>${c(PTS.captain[0])}${c(PTS.captain[1])}</tr>
    <tr><td><b>A bordo</b><div class="hg-meta">siguió en el crucero</div></td>${c(PTS.crew[0])}${c(PTS.crew[1])}</tr>
    <tr><td><b>${STOP}</b><div class="hg-meta">dijo que ya se había pasado</div></td>${c(PTS.stopped[0])}${c(PTS.stopped[1])}</tr>
  </tbody></table>
  <div class="hg-meta">¡Diana! Si el capitán clava la cifra exacta gana <b class="hg-pos">${signed(PTS.exact*v)} millas</b> en vez de ${signed(PTS.captain[0]*v)}.</div>
  ${rateBox()}`;
}
function rateBox(){
  return `<div class="cr-rate"><span class="cr-rate-a">${RATE} millas</span><span class="cr-rate-eq">=</span><span class="cr-rate-b">1 punto de Benchi</span></div>`;
}
function helpHTML(){
  const r=M.st.round,live=r&&['boarding','playing','closed'].includes(r.status);
  const v=live?r.value:1;
  return `<div class="cr-help" role="dialog" aria-modal="true" aria-labelledby="cr-help-t" onclick="if(event.target===this)CR.act('help')">
  <div class="cr-help-box">
    <div class="hg-between"><h2 id="cr-help-t">Cómo se juega</h2><button class="hg-btn ghost small" onclick="CR.act('help')" aria-label="Cerrar">Cerrar</button></div>
    <p class="cr-lead">Todas las respuestas son <b>números</b>. No hace falta saberla exacta: gana quien se acerca <b>sin pasarse</b>.</p>
    <ol class="cr-steps">
      <li><b>Sube a bordo.</b> El profesor lanza una pregunta y tienes unos segundos para subir al crucero. Si no subes, esa ronda solo miras.</li>
      <li><b>Turnos al azar.</b> Se sortea el orden. El primero <b>tiene que decir una cifra</b> y se convierte en el <b>capitán</b>.</li>
      <li><b>En tu turno eliges una de tres:</b>
        <ul>
          <li><b>⬆️ Subir la cifra:</b> dices un número <b>mayor</b> que el actual y pasas a ser el capitán. El capitán anterior sigue a bordo.</li>
          <li><b>🚢 Seguir a bordo:</b> crees que la cifra actual no se pasa y no quieres subirla más.</li>
          <li><b>✋ ${STOP}</b> crees que la cifra <b>ya se ha pasado</b> de la respuesta. Ya no vuelves a jugar en esa ronda.</li>
        </ul></li>
      <li><b>Si se te acaba el tiempo:</b> si ya hay cifra, te quedas a bordo; si eras el primero y no dijiste nada, te quedas fuera de la ronda.</li>
      <li><b>Al final</b> el profesor revela la respuesta y se reparten las <b>millas</b> con la última cifra (la del capitán).</li>
    </ol>
    <h3>Cómo se puntúa ${v>1?`<span class="hg-chip tint">esta ronda vale ×${v}</span>`:''}</h3>
    ${scoreTable(v)}
    <div class="cr-note">En el crucero se juega con <b>millas</b>. Cada vez que juntas <b>${RATE} millas</b>, se convierten solas en <b>1 punto de Benchi</b>;
      las que sobran se guardan para la próxima ronda (por ejemplo, con 7 millas ganas 1 punto y te quedan 2).
      <b>Aquí no se apuesta: nunca pierdes nada</b>, como mucho ganas 0 millas esa ronda.</div>
    <h3>Trucos</h3>
    <ul class="cr-tips">
      <li>Si eres el primero, empieza con una cifra <b>baja y segura</b>: el riesgo lo correrán los demás.</li>
      <li>Subir da el premio más grande (capitán), pero si te pasas te quedas sin nada.</li>
      <li>«${STOP}» es tu jugada cuando la cifra parece exagerada: si de verdad se pasa, ganas.</li>
    </ul>
  </div></div>`;
}

/* ===================================================== ALUMNO ===================================================== */
function balChip(d){
  const m=M.st.my_millas||0;
  return `<div class="hg-balance cr-mchip" title="Millas guardadas: al llegar a ${RATE} se convierten en 1 punto">⚓<span>${m}/${RATE}</span></div>
    <div class="hg-balance">${coin()}<span>${num(M.st.my_points||0)}</span> pts</div>`;
}
function studentHTML(d){
  const help=`<button class="cr-help-btn" onclick="CR.act('help')" aria-label="Normas y puntuación" title="Normas y puntuación">${helpIcon()}</button>`;
  const back=M.onBack?`<button class="hg-btn ghost small" onclick="CR.act('back')">← Minijuegos</button>`:'<span></span>';
  const head=`<div class="hg-between">${back}<div class="hg-row">${d.ph==='off'?'':balChip(d)}${help}</div></div>`;
  let body;
  if(d.ph==='off')body=`<div class="hg-card"><h3>${NAME}</h3><div class="hg-muted">Tu profesor no tiene activado este minijuego ahora mismo.</div></div>`;
  else if(d.ph==='lobby')body=lobbyStudent(d);
  else if(d.ph==='boarding')body=boardingStudent(d);
  else if(d.ph==='playing'||d.ph==='closed')body=playStudent(d);
  else body=revealStudent(d);
  return `<div class="hg-phone">${head}${body}</div>${M.help?helpHTML():''}`;
}
function heroHTML(title,sub,flame){
  return `<div class="cr-hero">${shipSVG(78,flame)}<div><h2 class="hg-title">${title}</h2>${sub?`<div class="cr-hero-sub">${sub}</div>`:''}</div></div>`;
}
function boardHTML(title){
  const b=M.st.board||[];
  if(!b.length)return '';
  return `<div class="hg-card"><div class="hg-between"><div class="hg-eyebrow">${title||'Marcador de la partida'}</div><div class="hg-meta">${M.st.match_rounds} ${M.st.match_rounds===1?'ronda':'rondas'}</div></div>
    <div class="hg-plist">${b.map((x,k)=>`<div class="hg-prow ${x.id===M.st.me?'me':''}"><b style="width:18px">${k+1}</b><div class="nm">${esc(x.name)}${x.id===M.st.me?' (tú)':''}</div><b class="${x.score>0?'hg-pos':''}">${mi(x.score||0)}</b></div>`).join('')}</div></div>`;
}
function lobbyStudent(d){
  return `${heroHTML(NAME,'Adivina la cifra… ¡sin pasarte!')}
    <div class="hg-card"><div class="hg-eyebrow">En pocas palabras</div>
      <div class="cr-mini"><span>⬆️</span><div><b>Sube</b> la cifra y serás el capitán.</div></div>
      <div class="cr-mini"><span>🚢</span><div><b>Sigue a bordo</b> si crees que no se pasa.</div></div>
      <div class="cr-mini"><span>✋</span><div>Di <b>«${STOP}»</b> si crees que ya se ha pasado.</div></div>
      <div class="cr-mini"><span>⚓</span><div>Ganas <b>millas</b>: cada <b>${RATE} millas = 1 punto</b> de Benchi. Nunca pierdes nada.</div></div>
      <button class="hg-btn ghost small" style="align-self:flex-start" onclick="CR.act('help')">${helpIcon()} Ver normas y puntuación</button></div>
    ${d.r&&d.r.status==='cancelled'?'<div class="hg-notice">La última ronda se canceló. No se ha movido ningún punto.</div>':''}
    <div class="hg-card" style="align-items:center;text-align:center">${onChip('Esperando al profesor')}<div class="hg-muted">En cuanto lance una pregunta podrás subir a bordo.</div></div>
    ${boardHTML()}`;
}
function questionCard(r,big){
  return `<div class="cr-q ${big?'big':''}"><div class="cr-q-k">Pregunta · ronda ${r.no}${r.value>1?` · vale ×${r.value}`:''}</div><div class="cr-q-t">${esc(r.question)}</div>${r.unit?`<div class="cr-q-u">Respuesta en: <b>${esc(r.unit)}</b></div>`:''}</div>`;
}
function boardingStudent(d){
  const r=d.r,aboard=r.players.length;
  return `${heroHTML('¡Sube a bordo!','')}
    ${questionCard(r)}
    <div class="hg-row hg-wrap"><span class="hg-chip amber">${clock()}Zarpa en <span data-cr-board>${mmss(secsLeft(r.boarding_closes_at))}</span></span>${onChip(`${aboard} de ${M.st.members} a bordo`)}</div>
    ${d.me?`<div class="hg-card cr-ok"><div class="hg-row">${shipSVG(36)}<div><b>¡Estás a bordo!</b><div class="hg-meta">Cuando zarpe se sorteará el orden de los turnos. Ve pensando tu cifra.</div></div></div></div>`
      :`<button class="hg-btn primary block cr-big-btn" ${M.busy?'disabled':''} onclick="CR.act('board')">🚢 Subir a bordo</button>
        <div class="hg-meta" style="text-align:center">Si no subes, esta ronda solo podrás mirar.</div>`}
    ${crewChips(r)}`;
}
function crewChips(r){
  if(!r.players.length)return '';
  return `<div class="cr-crew">${r.players.map(p=>`<span class="cr-pchip ${p.id===M.st.me?'me':''}">${esc(first(p.name))}</span>`).join('')}</div>`;
}
function statusChip(p,r){
  if(r.status==='playing'&&r.current===p.id)return '<span class="hg-chip amber">⏳ Su turno</span>';
  if(p.status==='waiting')return '<span class="hg-chip white">Espera</span>';
  if(p.status==='out')return '<span class="hg-chip white">Fuera</span>';
  if(p.status==='stopped')return '<span class="hg-chip red">✋ No pasa</span>';
  if(p.captain)return '<span class="hg-chip tint">⚓ Capitán</span>';
  return '<span class="hg-chip green">🚢 A bordo</span>';
}
function seatsHTML(r,big){
  return `<div class="cr-seats ${big?'big':''}">${r.players.map(p=>`<div class="cr-seat ${r.current===p.id&&r.status==='playing'?'now':''} ${p.id===M.st.me?'me':''} ${p.status}">
    <span class="cr-seat-n">${p.seat||'·'}</span><span class="cr-seat-nm">${esc(p.name)}${p.id===M.st.me?' (tú)':''}${p.auto?' <span class="hg-meta">· sin responder</span>':''}</span>${statusChip(p,r)}</div>`).join('')}</div>`;
}
function eventText(e,r){
  const n=esc(e.name||'');
  switch(e.kind){
    case 'start':return `¡Zarpamos! ${e.value} ${e.value==1?'pasajero':'pasajeros'} a bordo`;
    case 'raise':return `<b>${n}</b> sube a <b>${withUnit(e.value,esc(r.unit))}</b> y es el nuevo capitán`;
    case 'stay':return `<b>${n}</b> se queda a bordo`;
    case 'stop':return `<b>${n}</b>: «${STOP}» ✋`;
    case 'timeout':{const p=r.players.find(x=>x.id===e.who);return `A <b>${n}</b> se le acabó el tiempo${p&&p.status==='out'?' y se queda fuera':' y sigue a bordo'}`}
    case 'reveal':return `La respuesta era <b>${withUnit(e.value,esc(r.unit))}</b>`;
  }
  return '';
}
function feedHTML(r,n){
  const ev=r.events.slice(0,n);
  if(!ev.length)return '';
  return `<div class="hg-feed">${ev.map(e=>`<div class="hg-ev"><div class="msg">${eventText(e,r)}</div></div>`).join('')}</div>`;
}
function bidBox(r,big){
  if(r.bid==null)return `<div class="cr-bid empty ${big?'big':''}"><div class="cr-bid-k">Cifra actual</div><div class="cr-bid-v">—</div><div class="cr-bid-c">Aún nadie ha dicho una cifra</div></div>`;
  return `<div class="cr-bid ${big?'big':''}">${shipSVG(big?84:56,true)}<div><div class="cr-bid-k">Cifra actual</div><div class="cr-bid-v">${withUnit(r.bid,esc(r.unit))}</div>
    <div class="cr-bid-c">Capitán: <b>${esc(r.captain_name||'—')}</b>${r.captain===M.st.me?' (tú)':''}</div></div></div>`;
}
function myRole(d){
  const me=d.me,r=d.r;if(!me)return null;
  if(me.status==='stopped')return 'stopped';
  if(me.status==='crew')return r.captain===M.st.me?'captain':'crew';
  return null;
}
function playStudent(d){
  const r=d.r,v=r.value,closed=d.ph==='closed';
  let action='';
  if(d.myTurn){
    const firstBid=r.bid==null;
    const sug=firstBid?[]:[r.bid+1,Math.ceil(r.bid*1.1),Math.ceil(r.bid*1.25),Math.ceil(r.bid*1.5)].filter((x,i,a)=>x>r.bid&&a.indexOf(x)===i);
    action=`<div class="cr-turn">
      <div class="hg-between"><h3>¡Te toca!</h3><div class="cr-timer" style="--p:1"><span data-cr-turn>${secsLeft(r.turn_deadline)}</span></div></div>
      ${firstBid?'<div class="hg-muted">Eres el primero: <b>tienes que decir una cifra</b>. Empieza con algo seguro.</div>':''}
      <div class="cr-opt raise">
        <div class="cr-opt-h">⬆️ ${firstBid?'Di tu cifra':'Subir la cifra'} <span class="hg-meta">→ serás capitán: ${outcomeLine('captain',v)}</span></div>
        <div class="cr-raise"><input id="cr-num" type="text" inputmode="decimal" autocomplete="off" placeholder="${firstBid?'Tu cifra':'Más de '+num(r.bid)}" aria-label="Tu cifra" oninput="CR.act('typing')" onkeydown="if(event.key==='Enter')CR.act('raise')">${r.unit?`<span class="cr-unit">${esc(r.unit)}</span>`:''}</div>
        ${sug.length?`<div class="hg-stakes">${sug.map(x=>`<button type="button" class="hg-stake" onclick="CR.act('sug',${x})">${num(x)}</button>`).join('')}</div>`:''}
        <div class="hg-meta" id="cr-preview">Usa coma para los decimales.</div>
        <button class="hg-btn primary block" id="cr-raise-btn" disabled onclick="CR.act('raise')">Escribe una cifra</button>
      </div>
      ${firstBid?'':`<div class="cr-two">
        <button class="cr-opt stay" ${M.busy?'disabled':''} onclick="CR.act('stay')"><div class="cr-opt-h">🚢 Sigo a bordo</div><div class="hg-meta">${outcomeLine('crew',v)}</div></button>
        <button class="cr-opt stop" ${M.busy?'disabled':''} onclick="CR.act('stop')"><div class="cr-opt-h">✋ ${STOP}</div><div class="hg-meta">${outcomeLine('stopped',v)}</div></button>
      </div>`}
    </div>`;
  }else if(!d.me){
    action=`<div class="hg-card hg-muted">No subiste a bordo en esta ronda. ¡Mira cómo juegan los demás!</div>`;
  }else{
    const role=myRole(d);
    const txt=d.me.status==='out'?'Te quedaste fuera de esta ronda (no diste cifra a tiempo).'
      :d.me.status==='waiting'?`Te toca en el turno ${d.me.seat}. ${r.bid==null?'':'Ve pensando: ¿subir, seguir a bordo o «${STOP}»?'}`
      :role==='captain'?`Eres el capitán: ${outcomeLine('captain',v)}. Si alguien sube, sigues a bordo.`
      :role==='crew'?`Vas a bordo: ${outcomeLine('crew',v)}.`
      :`Dijiste «${STOP}»: ${outcomeLine('stopped',v)}.`;
    action=`<div class="hg-card ${d.me.status==='stopped'?'':'cr-ok'}"><div class="hg-eyebrow">Tu situación</div><div style="font-size:15px">${txt}</div></div>`;
  }
  const turnLine=closed?`<div class="hg-notice">Todos han jugado. El profesor va a revelar la respuesta…</div>`
    :d.myTurn?'':`<div class="hg-row hg-wrap"><span class="hg-chip amber">${clock()}Turno de ${esc(r.current_name||'')} · <span data-cr-turn>${secsLeft(r.turn_deadline)}</span> s</span><span class="hg-chip white">Turno ${r.turn} de ${r.seats_total}</span></div>`;
  return `${questionCard(r)}${bidBox(r)}${turnLine}${action}
    <div class="hg-card"><div class="hg-eyebrow">Tripulación</div>${seatsHTML(r)}</div>
    ${r.events.length?`<div class="hg-card"><div class="hg-eyebrow">Bitácora</div>${feedHTML(r,5)}</div>`:''}`;
}
function verdict(r){
  if(r.bid==null)return{t:'Nadie dijo una cifra',ok:null};
  const exact=Number(r.bid)===Number(r.answer),ok=Number(r.bid)<=Number(r.answer);
  return{ok,exact,t:exact?'¡Diana! Cifra exacta':ok?'¡No se pasó!':'¡Se pasó!'};
}
function revealStudent(d){
  const r=d.r,vd=verdict(r),me=d.me;
  let mine;
  if(!me)mine=`<div class="hg-muted">No subiste a bordo en esta ronda.</div>`;
  else{
    const role=me.status==='out'?'Te quedaste fuera':me.status==='stopped'?'Dijiste «'+STOP+'»':r.captain===M.st.me?'Eras el capitán':'Ibas a bordo';
    const left=M.st.my_millas||0,need=RATE-left;
    mine=`<div class="hg-between"><div><div class="hg-meta">${role}</div><div class="cr-delta ${me.delta>0?'hg-pos':''}">+${me.delta||0} <span style="font-size:22px">${me.delta===1?'milla':'millas'}</span></div></div>
      <div style="text-align:right"><div class="hg-meta">Saldo</div><b style="font-size:20px">${num(M.st.my_points)} pts</b></div></div>
      ${me.points>0?`<div class="cr-conv">🎉 Se han convertido <b>${me.points*RATE} millas</b> en <b>+${me.points} ${me.points===1?'punto':'puntos'}</b> de Benchi</div>`:''}
      <div class="cr-milebar"><div class="hg-between hg-meta"><span>Millas guardadas: <b>${left} de ${RATE}</b></span><span>${need===RATE?'':'te '+(need===1?'falta 1 milla':'faltan '+need+' millas')+' para el próximo punto'}</span></div>
        <div class="hg-bar" style="height:10px"><div style="width:${left/RATE*100}%;background:var(--hg-grad)"></div></div></div>`;
  }
  return `<div class="hg-banner ${vd.ok===false?'lose':'win'}">
      <div class="hg-meta" style="${vd.ok===false?'':'color:rgba(255,255,255,.85)'}">${esc(r.question)}</div>
      <div class="cr-answer"><div><div class="cr-bid-k">Respuesta</div><div class="big">${withUnit(r.answer,esc(r.unit))}</div></div>
        <div><div class="cr-bid-k">Cifra final${r.captain_name?' · '+esc(r.captain_name):''}</div><div class="cr-final">${withUnit(r.bid,esc(r.unit))}</div></div></div>
      <h2>${vd.t}</h2></div>
    <div class="hg-card">${mine}</div>
    <div class="hg-card"><div class="hg-eyebrow">Resultados de la ronda</div>${resultRows(r)}</div>
    ${boardHTML()}
    <div class="hg-card hg-muted" style="font-size:14px">Cuando el profesor lance otra pregunta aparecerá aquí.</div>`;
}
function resultRows(r){
  if(!r.players.length)return '<div class="hg-muted">Nadie subió a bordo.</div>';
  const role=p=>p.status==='out'?'Fuera':p.status==='stopped'?'No pasó':p.captain?'Capitán':'A bordo';
  const rows=r.players.slice().sort((a,b)=>(b.delta||0)-(a.delta||0));
  return `<div class="hg-plist">${rows.map(p=>`<div class="hg-prow ${p.id===M.st.me?'me':''}"><div class="nm">${esc(p.name)}${p.id===M.st.me?' (tú)':''}</div><span class="hg-meta">${role(p)}</span><b class="${p.delta>0?'hg-pos':''}" style="width:84px;text-align:right">+${mi(p.delta||0)}</b></div>`).join('')}</div>`;
}

/* ===================================================== PROFESOR ===================================================== */
function teacherHTML(d){
  const on=M.st.enabled;
  const head=`<div class="hg-card"><div class="hg-between"><div class="hg-row" style="gap:14px"><div class="cr-logo">${shipSVG(44)}</div>
    <div><h3 style="font-size:20px">${NAME}</h3><div class="hg-muted" style="font-size:14px">Preguntas con respuesta numérica: suben la cifra, siguen a bordo o dicen «¡Por aquí no paso!». Se ganan millas: ${RATE} millas = 1 punto.</div></div></div>
    <div class="hg-row"><button class="cr-help-btn" onclick="CR.act('help')" aria-label="Normas y puntuación" title="Normas y puntuación">${helpIcon()}</button><span class="hg-chip ${on?'green':'white'}">${on?'Activado':'Desactivado'}</span><button type="button" class="hg-switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="Activar ${NAME} para los alumnos" onclick="CR.act('toggle')"></button></div></div></div>`;
  if(!on)return `<div class="hg-col">${head}<div class="hg-card hg-muted">Los alumnos no ven este minijuego. Actívalo para que aparezca en su pestaña «Minijuegos».</div></div>${M.help?helpHTML():''}`;
  const r=d.r,active=['boarding','playing','closed'].includes(d.ph);
  let main;
  if(d.ph==='boarding')main=boardingTeacher(d);
  else if(d.ph==='playing'||d.ph==='closed')main=playTeacher(d);
  else main=readyTeacher(d);
  return `<div class="hg-col">${head}<div class="hg-desk">${rulesTeacher(d,active)}<div style="min-width:0" class="hg-col">${main}${M.bankOpen?bankHTML():''}</div></div></div>${M.help?helpHTML():''}`;
}
function rulesTeacher(d,locked){
  const r=d.r,c=M.cfg;
  const val=locked?r.value:c.value;
  const sel=(k,opts,cur,f)=>`<select ${locked?'disabled':''} onchange="CR.act('cfg','${k}',this.value)">${opts.map(o=>`<option value="${o}" ${o==cur?'selected':''}>${f(o)}</option>`).join('')}</select>`;
  return `<div class="hg-card" style="gap:2px"><h3 style="font-size:18px;margin-bottom:6px">Reglas</h3>
    <div class="hg-kv"><span class="hg-muted">Valor de la ronda</span>${sel('value',VALUES,val,o=>'×'+o)}</div>
    ${locked?'':`<div class="hg-kv"><span class="hg-muted">Tiempo para subir</span>${sel('board',BOARD_TIMES,c.board,o=>o+' s')}</div>`}
    <div class="hg-kv"><span class="hg-muted">Tiempo por turno</span>${sel('turn',TURN_TIMES,locked?r.turn_secs:c.turn,o=>o+' s')}</div>
    <div style="margin-top:10px">${scoreTable(val)}</div>
    <div class="hg-meta" style="padding:10px 12px;border-radius:12px;background:#f6f7fb;margin-top:8px">Al revelar, cada alumno suma sus millas; cada ${RATE} se convierten solas en 1 punto de Benchi y lo que sobra se guarda. Nadie apuesta ni pierde puntos.</div></div>`;
}
const LEVELS=[['principiante','Principiante'],['intermedio','Intermedio'],['avanzado','Avanzado']];
const levelName=l=>(LEVELS.find(x=>x[0]===l)||[,''])[1];
// Preguntas que cumplen el filtro elegido por el profesor (banco + nivel)
function pool(){
  const c=M.cfg;
  return (M.bank||[]).filter(q=>(c.source==='todas'||(c.source==='mias')===q.mine)&&(!c.level||q.level===c.level));
}
function seg(k,cur,opts){
  return `<div class="hg-seg" role="group">${opts.map(([v,t])=>`<button type="button" aria-pressed="${cur===v}" onclick="CR.act('cfg','${k}','${v}')">${t}</button>`).join('')}</div>`;
}
function readyTeacher(d){
  const r=d.r,c=M.cfg;
  let res='';
  if(d.ph==='revealed')res=revealTeacher(d);
  else if(r&&r.status==='cancelled')res='<div class="hg-notice">La última ronda se canceló. No se dio ningún punto.</div>';
  const next=r?r.no+1:1,list=pool(),mineN=(M.bank||[]).filter(q=>q.mine).length;
  if(c.question&&!list.some(q=>q.id===c.question))c.question='';
  const cats=[...new Set(list.map(q=>q.category))];
  const opts=`<option value="">🎲 Al azar entre ${list.length} ${list.length===1?'pregunta':'preguntas'}</option>`+
    cats.map(cat=>`<optgroup label="${esc(cat)}">${list.filter(q=>q.category===cat).map(q=>`<option value="${q.id}" ${q.id===c.question?'selected':''}>${c.level?'':'['+levelName(q.level).slice(0,5)+'.] '}${esc(q.text.length>80?q.text.slice(0,78)+'…':q.text)}</option>`).join('')}</optgroup>`).join('');
  const empty=M.bank&&!list.length;
  return `${res}<div class="hg-card">
    <div class="hg-between"><div class="hg-eyebrow">${r?'Ronda '+next+' preparada':'Primera ronda'}</div><span class="hg-chip white">Solo lo ves tú</span></div>
    <div class="cr-qsel">
      <div><div class="hg-muted cr-lbl">Banco de preguntas</div>${seg('source',c.source,[['benchi','Banco de Benchi'],['mias',`Mis preguntas (${mineN})`],['todas','Los dos']])}</div>
      <div><div class="hg-muted cr-lbl">Nivel</div>${seg('level',c.level,[['','Todos']].concat(LEVELS))}</div>
    </div>
    ${empty?`<div class="hg-notice">${c.source==='mias'?`Todavía no tienes preguntas${c.level?' de nivel '+levelName(c.level).toLowerCase():''}. Añádelas en «Mis preguntas» aquí debajo.`:'No hay preguntas con este filtro.'}</div>`
      :`<label class="cr-field"><span class="hg-muted">Pregunta</span><select onchange="CR.act('cfg','question',this.value)" ${M.bank?'':'disabled'}>${M.bank?opts:'<option>Cargando…</option>'}</select></label>`}
    <div class="hg-meta">El alumnado tendrá ${c.board} s para subir a bordo y ${c.turn} s en cada turno. La respuesta no sale en esta pantalla hasta que la reveles: puedes proyectarla.</div>
    <div class="hg-row hg-wrap">
      <button class="hg-btn primary" ${M.busy||empty||!M.bank?'disabled':''} onclick="CR.act('open')">${M.busy?'Preparando…':'🚢 Lanzar pregunta · ronda '+next}</button>
      <button class="hg-btn ghost" onclick="CR.act('bank')">${M.bankOpen?'Ocultar preguntas':'✏️ Mis preguntas y banco'}</button>
      ${r?`<label class="cr-check"><input type="checkbox" ${c.newMatch?'checked':''} onchange="CR.act('cfg','newMatch',this.checked)"> Empezar partida nueva (marcador a 0)</label>`:''}
    </div></div>
    ${d.ph!=='revealed'?boardHTML():''}`;
}
function boardingTeacher(d){
  const r=d.r;
  return `<div class="hg-card cr-stage">
    <div class="hg-between"><span class="hg-chip amber">${clock()}Embarque · zarpa en <span data-cr-board>${mmss(secsLeft(r.boarding_closes_at))}</span></span>${onChip(`${r.players.length} de ${M.st.members} a bordo`)}</div>
    ${questionCard(r,true)}
    <div class="cr-crew big">${r.players.length?r.players.map(p=>`<span class="cr-pchip">${esc(p.name)}</span>`).join(''):'<span class="hg-muted">Esperando a que suban los primeros pasajeros…</span>'}</div>
    <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
      <button class="hg-btn primary" ${!r.players.length||M.busy?'disabled':''} onclick="CR.act('start')">Zarpar ya</button>
      <button class="hg-btn danger" style="margin-left:auto" onclick="CR.act('cancel')">Cancelar ronda</button></div></div>`;
}
function playTeacher(d){
  const r=d.r,closed=d.ph==='closed';
  return `<div class="hg-card cr-stage">
    <div class="hg-between">${closed?'<span class="hg-chip tint">Todos han jugado</span>':`<span class="hg-chip amber">${clock()}Turno de <b>${esc(r.current_name||'')}</b> · <span data-cr-turn>${secsLeft(r.turn_deadline)}</span> s</span>`}<span class="hg-chip white">Turno ${Math.min(r.turn,r.seats_total)} de ${r.seats_total}</span></div>
    ${questionCard(r,true)}
    ${bidBox(r,true)}
    <div class="cr-cols"><div><div class="hg-eyebrow" style="margin-bottom:8px">Tripulación</div>${seatsHTML(r,true)}</div>
      <div><div class="hg-eyebrow" style="margin-bottom:8px">Bitácora</div>${feedHTML(r,7)||'<div class="hg-muted">Aún no ha jugado nadie.</div>'}</div></div>
    <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
      ${closed?`<button class="hg-btn primary cr-big-btn" ${M.busy?'disabled':''} onclick="CR.act('reveal')">🔭 Revelar la respuesta</button>`
        :`<button class="hg-btn ghost" onclick="CR.act('skip')">Pasar el turno de ${esc(first(r.current_name))}</button>`}
      <button class="hg-btn danger" style="margin-left:auto" onclick="CR.act('cancel')">Cancelar ronda</button></div></div>`;
}
function revealTeacher(d){
  const r=d.r,vd=verdict(r);
  return `<div class="hg-card cr-stage">
    <div class="hg-between"><h3 style="font-size:22px">Ronda ${r.no} · ${vd.t}</h3><span class="hg-chip tint">${RATE} millas = 1 punto</span></div>
    <div class="cr-q-t" style="font-size:18px">${esc(r.question)}</div>
    <div class="cr-reveal"><div><div class="cr-bid-k">Respuesta</div><div class="cr-answer-big">${withUnit(r.answer,esc(r.unit))}</div></div>
      <div><div class="cr-bid-k">Cifra final${r.captain_name?' · '+esc(r.captain_name):''}</div><div class="cr-answer-big ${vd.ok===false?'hg-neg':vd.ok?'hg-pos':''}">${withUnit(r.bid,esc(r.unit))}</div></div></div>
    ${r.players.length?`<div style="overflow-x:auto"><table class="hg-t"><thead><tr><th>Alumno</th><th>Papel</th><th class="n">Millas</th><th class="n">Puntos Benchi</th></tr></thead><tbody>
      ${r.players.slice().sort((a,b)=>(b.delta||0)-(a.delta||0)).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.status==='out'?'Fuera':p.status==='stopped'?'No pasó':p.captain?'Capitán':'A bordo'}</td><td class="n ${p.delta>0?'hg-pos':''}">+${p.delta||0}</td><td class="n ${p.points>0?'hg-pos':''}">${p.points>0?'+'+p.points:'—'}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    </div>${boardHTML()}`;
}
function bankHTML(){
  const b=M.bank,c=M.cfg;
  if(!b)return `<div class="hg-card hg-muted">Cargando el banco de preguntas…</div>`;
  const mine=b.filter(q=>q.mine),common=b.filter(q=>!q.mine);
  const row=q=>`<div class="hg-prow"><span class="cr-lv ${q.level}">${levelName(q.level)}</span><div class="nm" style="white-space:normal">${esc(q.text)}</div><b style="white-space:nowrap">${withUnit(q.answer,esc(q.unit))}</b>${q.mine?`<button class="hg-btn danger small" onclick="CR.act('delq','${q.id}')" aria-label="Borrar pregunta">Borrar</button>`:''}</div>`;
  return `<div class="hg-card"><div class="hg-between"><h3 style="font-size:18px">Mis preguntas y banco</h3><span class="hg-chip amber">Con respuestas: no lo proyectes</span></div>
    <div class="cr-addbox"><div class="hg-eyebrow">Añadir una pregunta mía</div>
      <input id="cr-q-text" type="text" maxlength="200" placeholder="Pregunta con respuesta numérica (ej.: ¿Cuántos alumnos tiene el centro?)">
      <div class="cr-addq">
        <input id="cr-q-ans" type="text" inputmode="decimal" placeholder="Respuesta (número)">
        <input id="cr-q-unit" type="text" maxlength="30" placeholder="Unidad (opcional)">
        <select id="cr-q-level" aria-label="Nivel" onchange="CR.act('cfg','newLevel',this.value)">${LEVELS.map(([v,t])=>`<option value="${v}" ${c.newLevel===v?'selected':''}>${t}</option>`).join('')}</select>
        <button class="hg-btn primary small" onclick="CR.act('addq')">Añadir</button></div></div>
    <div class="hg-eyebrow">Mis preguntas (${mine.length})</div>
    ${mine.length?`<div class="hg-plist">${mine.map(row).join('')}</div>`:'<div class="hg-muted" style="font-size:14px">Aún no has añadido ninguna. Las que añadas solo las verás tú y podrás lanzarlas eligiendo «Mis preguntas».</div>'}
    ${LEVELS.map(([v,t])=>{const l=common.filter(q=>q.level===v);return `<details><summary class="hg-eyebrow" style="cursor:pointer">Banco de Benchi · ${t} (${l.length})</summary><div class="hg-plist">${l.map(row).join('')}</div></details>`}).join('')}
  </div>`;
}

/* ---------- Alumno: puntos de la cabecera ---------- */
function syncPoints(d){
  if(!M.st||M.st.my_points==null)return;
  if(d.me&&d.me.points>0)M.dirty=true;
  const p=M.st.my_points;
  try{
    const c=state.myClasses.find(x=>x.id===M.classId);
    if(c&&c.points!==p){c.points=p;const b=document.querySelector('.page-head .points-badge');if(b)b.outerHTML=pointsBadgeHTML(p)}
  }catch(e){}
}

/* ---------- Acciones ---------- */
async function rpc(name,args){
  const{data,error}=await sb.rpc(name,args);
  if(error){say(error.message);return{ok:false}}
  if(M)M.dirty=true;
  return{ok:true,data};
}
function updateRaise(){
  const inp=M.root.querySelector('#cr-num'),btn=M.root.querySelector('#cr-raise-btn'),pv=M.root.querySelector('#cr-preview');
  if(!inp||!btn)return;
  const r=M.st.round,v=parseNum(inp.value);
  let ok=false,msg='Usa coma para los decimales.';
  if(inp.value.trim()&&v==null)msg='Escribe solo un número (por ejemplo 1500 o 42,5).';
  else if(v!=null&&r.bid!=null&&v<=r.bid)msg=`Tiene que ser mayor que ${num(r.bid)}.`;
  else if(v!=null){ok=true;msg=`Vas a decir: <b>${withUnit(v,esc(r.unit))}</b>`}
  pv.innerHTML=msg;
  btn.disabled=!ok||M.busy;
  btn.textContent=ok?(r.bid==null?'Decir '+num(v):'Subir a '+num(v)):'Escribe una cifra';
}
async function act(a,x,y){
  if(!M)return;
  const r=M.st&&M.st.round;
  switch(a){
    case 'retry':poll();break;
    case 'help':M.help=!M.help;refresh();break;
    case 'back':{const f=M.onBack,dirty=M.dirty;unmount();if(f)f(dirty);break}
    case 'typing':updateRaise();break;
    case 'sug':{const i=M.root.querySelector('#cr-num');if(i){i.value=String(x).replace('.',',');M.draft=i.value;updateRaise();i.focus()}break}
    case 'board':{
      if(M.busy||!r)break;
      M.busy=true;refresh();
      const res=await rpc('cr_board',{p_round:r.id});
      if(!M)return;M.busy=false;if(res.ok)say('¡A bordo!');await poll();break;
    }
    case 'raise':case 'stay':case 'stop':{
      if(M.busy||!r)break;
      let v=null;
      if(a==='raise'){
        const inp=M.root.querySelector('#cr-num');v=parseNum(inp&&inp.value);
        if(v==null||(r.bid!=null&&v<=r.bid)){updateRaise();break}
      }
      M.busy=true;refresh();
      const res=await rpc('cr_act',{p_round:r.id,p_action:a,p_value:v});
      if(!M)return;M.busy=false;
      if(res.ok){M.draft='';say(a==='raise'?'¡Eres el capitán!':a==='stay'?'Sigues a bordo':'¡Por aquí no pasas!')}
      await poll();break;
    }
    case 'cfg':
      if(['question','source','level','newLevel'].includes(x))M.cfg[x]=y;else if(x==='newMatch')M.cfg.newMatch=!!y;else M.cfg[x]=+y;
      if(x==='source'||x==='level')M.cfg.question='';
      refresh();break;
    case 'toggle':{
      const on=M.st.enabled;
      if(on&&r&&['boarding','playing','closed'].includes(r.status)&&!confirm('Hay una ronda en marcha. Si desactivas el minijuego se cancelará (no se mueve ningún punto). ¿Continuar?'))break;
      if((await rpc('set_minigame',{p_class:M.classId,p_game:'crucero',p_enabled:!on})).ok)say(on?'Minijuego desactivado':'Minijuego activado para el aula');
      await poll();break;
    }
    case 'bank':M.bankOpen=!M.bankOpen;if(M.bankOpen&&!M.bank)loadBank();refresh();break;
    case 'addq':{
      const t=M.root.querySelector('#cr-q-text').value.trim(),ans=parseNum(M.root.querySelector('#cr-q-ans').value),u=M.root.querySelector('#cr-q-unit').value.trim();
      if(t.length<5){say('Escribe la pregunta (mínimo 5 caracteres)');break}
      if(ans==null){say('La respuesta tiene que ser un número');break}
      const lv=M.root.querySelector('#cr-q-level').value;
      if((await rpc('cr_add_question',{p_text:t,p_answer:ans,p_unit:u,p_level:lv})).ok){
        say('Pregunta añadida');['cr-q-text','cr-q-ans','cr-q-unit'].forEach(id=>{const e=M.root.querySelector('#'+id);if(e)e.value=''});
        M.bank=null;await loadBank()}
      break;
    }
    case 'delq':
      if(confirm('¿Borrar esta pregunta?')&&(await rpc('cr_delete_question',{p_id:x})).ok){if(M.cfg.question===x)M.cfg.question='';M.bank=null;await loadBank()}
      break;
    case 'open':{
      if(M.busy)break;
      M.busy=true;refresh();
      const c=M.cfg;
      const res=await rpc('cr_open_round',{p_class:M.classId,p_question:c.question||null,p_mode:'millas',p_value:c.value,
        p_board_secs:c.board,p_turn_secs:c.turn,p_new_match:!!c.newMatch,p_source:c.source,p_level:c.level||null});
      if(!M)return;
      M.busy=false;if(res.ok){c.newMatch=false;c.question='';M.bankOpen=false}
      await poll();break;
    }
    case 'start':if(r&&(await rpc('cr_start_now',{p_round:r.id})).ok)await poll();break;
    case 'skip':if(r&&(await rpc('cr_skip_turn',{p_round:r.id})).ok)await poll();break;
    case 'reveal':{
      if(M.busy||!r)break;
      M.busy=true;refresh();
      await rpc('cr_reveal',{p_round:r.id});
      if(!M)return;M.busy=false;await poll();break;
    }
    case 'cancel':
      if(r&&confirm('¿Cancelar la ronda? No se moverá ningún punto.')&&(await rpc('cr_cancel_round',{p_round:r.id})).ok)await poll();
      break;
  }
}
async function loadBank(){
  const m=M;
  const{data,error}=await sb.rpc('cr_list_questions');
  if(M!==m)return;
  if(error){say(error.message);return}
  m.bank=data||[];m.key='';refresh();
}

window.CR={mount,unmount,act,ship:shipSVG,NAME,takeDirty(){const d=!!(M&&M.dirty);if(M)M.dirty=false;return d}};

/* ===================================================== SELECTOR DE MINIJUEGOS =====================================================
   Une la carrera de caballos (HG) y el crucero (CR) en la pestaña «Minijuegos». */
let H=null;   // estado del selector
function hubStop(){if(H){clearInterval(H.t);H=null}}
function mountStudent(classId,root){
  hubStop();HG.unmount();CR.unmount();
  H={role:'student',classId,root,dirty:false,data:null,t:null};
  root.classList.add('hg');
  hubList();
}
async function hubPoll(){
  const h=H;if(!h||h.view!=='list')return;
  if(!document.body.contains(h.root)){hubStop();return}
  const[a,b]=await Promise.all([sb.rpc('horse_state',{p_class:h.classId}),sb.rpc('cr_state',{p_class:h.classId})]);
  if(H!==h||h.view!=='list')return;
  h.data={horses:a.error?null:a.data,crucero:b.error?null:b.data};
  hubRender();
}
function hubList(dirty){
  const h=H;if(!h)return;
  if(dirty)h.dirty=true;
  h.view='list';
  h.root.innerHTML='<div class="hg-card hg-muted">Cargando minijuegos…</div>';
  hubPoll();clearInterval(h.t);h.t=setInterval(hubPoll,3000);
}
function hubRender(){
  const h=H,dt=h.data,cards=[];
  const hs=dt.horses,cs=dt.crucero;
  if(hs&&hs.enabled){
    const r=hs.round,n=hs.now;
    const open=r&&r.status==='open'&&n<r.closes_at,live=r&&r.status==='racing'&&n<r.started_at+60000;
    cards.push(cardHTML('horses',HG.art?HG.art():'','Carrera de caballos',
      'Predice qué caballo ganará y reparte el bote con quien acierte.',
      open?onChip('Ronda abierta'):live?'<span class="hg-chip red">Carrera</span>':'<span class="hg-chip tint">Activo</span>',
      open?(r.mine?'Ya has hecho tu predicción.':'¡Haz tu predicción antes de que se cierre!'):'Esperando a que el profesor abra una ronda.'));
  }
  if(cs&&cs.enabled){
    const r=cs.round,st=r&&r.status;
    const me=r&&r.players.find(p=>p.id===cs.me);
    const chip=st==='boarding'?onChip('¡Embarque abierto!'):st==='playing'?'<span class="hg-chip red hg-live"><span class="hg-dot"></span>En juego</span>':'<span class="hg-chip tint">Activo</span>';
    const hint=st==='boarding'?(me?'Ya estás a bordo.':'¡Sube a bordo antes de que zarpe!'):st==='playing'?(r.current===cs.me?'¡Te toca jugar!':me?'Estás en la partida.':'Puedes mirar la partida.'):'Esperando a que el profesor lance una pregunta.';
    cards.push(cardHTML('crucero',shipSVG(72),NAME,'Adivina la cifra sin pasarte: sube, sigue a bordo o di «¡Por aquí no paso!».',chip,hint));
  }
  const alert=(cs&&cs.enabled&&cs.round&&((cs.round.status==='boarding'&&!cs.round.players.some(p=>p.id===cs.me))||(cs.round.status==='playing'&&cs.round.current===cs.me)))
    ||(hs&&hs.enabled&&hs.round&&hs.round.status==='open'&&!hs.round.mine&&hs.now<hs.round.closes_at);
  const el=document.querySelector('.teacher-tab[data-tab="minigames"]');if(el)el.classList.toggle('hg-tab-live',!!alert);
  h.root.innerHTML=cards.length?`<div class="hg-games">${cards.join('')}</div>`
    :`<div class="hg-card"><h3>Minijuegos</h3><div class="hg-muted">Tu profesor aún no ha activado ningún minijuego en esta aula.</div></div>`;
}
function cardHTML(game,art,title,desc,chip,hint){
  return `<div class="hg-game"><div class="hg-game-art ${game==='crucero'?'cr-art':''}">${art}</div>
    <div class="hg-game-body"><div class="hg-between"><h3>${title}</h3>${chip}</div>
    <div class="hg-muted" style="font-size:14px">${desc}</div><div class="hg-meta">${hint}</div>
    <button class="hg-btn primary block" onclick="MG.play('${game}')">Jugar</button></div></div>`;
}
function play(game){
  const h=H;if(!h)return;
  h.view=game;clearInterval(h.t);
  const back=dirty=>{if(H===h)hubList(dirty)};
  if(game==='horses')HG.mount('student',h.classId,h.root,{start:'game',onBack:back});
  else CR.mount('student',h.classId,h.root,{onBack:back});
}
/* Profesor: pestañas para elegir qué minijuego configurar */
function mountTeacher(classId,root){
  // Al volver a la misma aula se recuerda la última pestaña elegida
  const last=H&&H.classId===classId&&H.lastGame||'horses',dirty=!!(H&&H.dirty);
  hubStop();HG.unmount();CR.unmount();
  H={role:'teacher',classId,root,dirty,view:null,lastGame:last};
  teacherTab(last);
}
function teacherTab(game){
  const h=H;if(!h)return;
  if(HG.takeDirty())h.dirty=true;
  if(CR.takeDirty())h.dirty=true;
  HG.unmount();CR.unmount();
  h.view=game;h.lastGame=game;
  h.root.innerHTML=`<div class="mg-tabs hg" role="tablist">
      <button role="tab" aria-selected="${game==='horses'}" onclick="MG.teacherTab('horses')">🏇 Carrera de caballos</button>
      <button role="tab" aria-selected="${game==='crucero'}" onclick="MG.teacherTab('crucero')">🚢 ${NAME}</button></div>
    <div id="mg-game"></div>`;
  const el=h.root.querySelector('#mg-game');
  if(game==='horses')HG.mount('teacher',h.classId,el);else CR.mount('teacher',h.classId,el);
}
window.MG={mountStudent,mountTeacher,play,teacherTab,
  takeDirty(){const d=HG.takeDirty()|CR.takeDirty()|!!(H&&H.dirty);if(H)H.dirty=false;return !!d}};
})();
