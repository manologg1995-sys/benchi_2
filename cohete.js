/* Minijuegos de Benchi · "Cohete al límite" + selector de minijuegos.
   Juego de estimación por turnos: todas las respuestas son números. Cada alumno sube la cifra,
   se queda a bordo o salta del cohete. Gana quien se acerca sin pasarse.
   Todo lo que toca puntos pasa por funciones de Supabase (supabase/cohete.sql).
   Uso: MG.mountTeacher(classId, el) / MG.mountStudent(classId, el). */
(function(){
'use strict';

const NAME='Cohete al límite';
const POLL_MS=1500;
const KEEP=['cg-num','cg-q-text','cg-q-ans','cg-q-unit'];
const BOARD_TIMES=[20,30,45,60,90], TURN_TIMES=[10,15,20,30,45], VALUES=[1,2,3,5];
// Tabla de puntos (× valor de la ronda). Debe coincidir con cg_reveal en supabase/cohete.sql
const PTS={captain:[4,-2],crew:[2,-1],jumped:[0,2],exact:6};

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
function rocketSVG(size,flame){
  size=size||64;
  return `<svg class="cg-rocket ${flame?'fly':''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  ${flame?'<path class="cg-flame" d="M26 50 Q32 66 38 50 Z" fill="#ffc857"/><path class="cg-flame b" d="M28.5 50 Q32 60 35.5 50 Z" fill="#ff5a9d"/>':''}
  <path d="M22 38 L12 48 L14 52 L24 46Z" fill="#ff5a9d"/>
  <path d="M42 38 L52 48 L50 52 L40 46Z" fill="#ff5a9d"/>
  <path d="M32 4 C44 12 46 30 42 48 L22 48 C18 30 20 12 32 4Z" fill="#fff" stroke="#172033" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M32 4 C37 7.5 40.5 12 42.3 17 L21.7 17 C23.5 12 27 7.5 32 4Z" fill="#635bff"/>
  <circle cx="32" cy="28" r="6.5" fill="#28c6e8" stroke="#172033" stroke-width="2.4"/>
  <path d="M27 48 L37 48 L35.5 53 L28.5 53Z" fill="#172033"/>
</svg>`;
}
const chuteSVG=()=>`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 11a9 7 0 0 1 18 0Z" fill="#ff5a9d"/><path d="M3 11l9 8 9-8M9 11l3 8 3-8" fill="none" stroke="#172033" stroke-width="1.4"/><circle cx="12" cy="20" r="1.8" fill="#172033"/></svg>`;
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
     cfg:{mode:'puntos',value:1,board:30,turn:20,question:'',newMatch:false},polling:false};
  root.classList.add('hg','cg');
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
    const{data,error}=await sb.rpc('cg_state',{p_class:m.classId});
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
  if(!M.st){if(M.err)M.root.innerHTML=`<div class="hg-card"><div class="hg-notice">${esc(M.err)}</div><button class="hg-btn ghost" onclick="CG.act('retry')">Reintentar</button></div>`;return}
  const d=derive(),r=d.r;
  // Solo se repinta cuando cambia algo visible; los relojes se actualizan en live()
  const key=JSON.stringify([d.ph,r&&r.id,r&&r.turn,r&&r.bid,r&&r.players.map(p=>p.status+(p.delta==null?'':p.delta)).join(),r&&r.events.length&&r.events[0].id,
    M.st.enabled,M.st.board,M.help,M.bankOpen,M.bank&&M.bank.length,M.busy,M.role==='teacher'?M.cfg:0,M.st.my_points]);
  if(key!==M.key){
    // No perder lo que se está escribiendo al repintar
    const keep={};KEEP.forEach(id=>{const e=M.root.querySelector('#'+id);if(e)keep[id]=e.value});
    const focused=document.activeElement&&KEEP.includes(document.activeElement.id)?document.activeElement.id:null;
    if(keep['cg-num']!=null)M.draft=keep['cg-num'];
    M.key=key;M.root.innerHTML=M.role==='teacher'?teacherHTML(d):studentHTML(d);
    KEEP.forEach(id=>{const e=M.root.querySelector('#'+id);if(e&&keep[id]!=null)e.value=keep[id]});
    const ni=M.root.querySelector('#cg-num');if(ni){ni.value=M.draft;if(!focused&&d.myTurn&&!M.help)ni.focus();updateRaise()}
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
  M.root.querySelectorAll('[data-cg-board]').forEach(e=>e.textContent=mmss(secsLeft(r.boarding_closes_at)));
  M.root.querySelectorAll('[data-cg-turn]').forEach(e=>{
    const s=r&&r.turn_deadline?secsLeft(r.turn_deadline):0;
    e.textContent=s;
    const ring=e.closest('.cg-timer');if(ring){ring.style.setProperty('--p',Math.max(0,Math.min(1,s/r.turn_secs)));ring.classList.toggle('low',s<=5)}
  });
}

/* ---------- Textos de reglas ---------- */
function outcomeLine(role,v){
  const[a,b]=PTS[role];
  return `si no se pasa <b class="${a>0?'hg-pos':''}">${signed(a*v)}</b> · si se pasa <b class="${b<0?'hg-neg':'hg-pos'}">${signed(b*v)}</b>`;
}
function scoreTable(v,mode){
  const u=mode==='marcador'?'':' pts';
  const c=n=>`<td class="n ${n>0?'hg-pos':n<0?'hg-neg':''}">${signed(n*v)}${n?u:''}</td>`;
  return `<table class="hg-t cg-score"><thead><tr><th></th><th class="n">No se pasa</th><th class="n">Se pasa</th></tr></thead><tbody>
    <tr><td><b>Capitán</b><div class="hg-meta">dijo la cifra final</div></td>${c(PTS.captain[0])}${c(PTS.captain[1])}</tr>
    <tr><td><b>A bordo</b><div class="hg-meta">se quedó en el cohete</div></td>${c(PTS.crew[0])}${c(PTS.crew[1])}</tr>
    <tr><td><b>Saltó</b><div class="hg-meta">se bajó en paracaídas</div></td>${c(PTS.jumped[0])}${c(PTS.jumped[1])}</tr>
  </tbody></table>
  <div class="hg-meta">¡Diana! Si el capitán clava la cifra exacta gana <b class="hg-pos">${signed(PTS.exact*v)}${u}</b> en vez de ${signed(PTS.captain[0]*v)}.</div>`;
}
function helpHTML(){
  const r=M.st.round,live=r&&['boarding','playing','closed'].includes(r.status);
  const v=live?r.value:1,mode=live?r.mode:'puntos';
  return `<div class="cg-help" role="dialog" aria-modal="true" aria-labelledby="cg-help-t" onclick="if(event.target===this)CG.act('help')">
  <div class="cg-help-box">
    <div class="hg-between"><h2 id="cg-help-t">Cómo se juega</h2><button class="hg-btn ghost small" onclick="CG.act('help')" aria-label="Cerrar">Cerrar</button></div>
    <p class="cg-lead">Todas las respuestas son <b>números</b>. No hace falta saberla exacta: gana quien se acerca <b>sin pasarse</b>.</p>
    <ol class="cg-steps">
      <li><b>Sube a bordo.</b> El profesor lanza una pregunta y tienes unos segundos para subir al cohete. Si no subes, esa ronda solo miras.</li>
      <li><b>Turnos al azar.</b> Se sortea el orden. El primero <b>tiene que decir una cifra</b> y se convierte en el <b>capitán</b>.</li>
      <li><b>En tu turno eliges una de tres:</b>
        <ul>
          <li><b>⬆️ Subir la cifra:</b> dices un número <b>mayor</b> que el actual y pasas a ser el capitán. El capitán anterior sigue a bordo.</li>
          <li><b>🚀 Quedarte a bordo:</b> crees que la cifra actual no se pasa y no quieres arriesgar más.</li>
          <li><b>🪂 Saltar:</b> crees que la cifra <b>ya se ha pasado</b> de la respuesta. Una vez saltas, ya no vuelves.</li>
        </ul></li>
      <li><b>Si se te acaba el tiempo:</b> si ya hay cifra, te quedas a bordo; si eras el primero y no dijiste nada, te quedas fuera de la ronda.</li>
      <li><b>Al final</b> el profesor revela la respuesta y se reparten los puntos con la última cifra (la del capitán).</li>
    </ol>
    <h3>Cómo se puntúa ${v>1?`<span class="hg-chip tint">esta ronda vale ×${v}</span>`:''}</h3>
    ${scoreTable(v,mode)}
    <div class="cg-note">${mode==='marcador'
      ?'<b>Solo marcador:</b> esta ronda no toca tus puntos de Benchi; solo cuenta para el marcador de la partida.'
      :'<b>Con puntos:</b> se juega con tus puntos reales de Benchi. Si pierdes, nunca bajas de 0.'}
      El marcador de la partida suma lo que ganas o pierdes en cada ronda.</div>
    <h3>Trucos</h3>
    <ul class="cg-tips">
      <li>Si eres el primero, empieza con una cifra <b>baja y segura</b>: el riesgo lo correrán los demás.</li>
      <li>Subir da más premio (capitán), pero también más castigo si se pasa.</li>
      <li>Saltar es la jugada segura cuando la cifra parece exagerada: si se pasa, ganas.</li>
    </ul>
  </div></div>`;
}

/* ===================================================== ALUMNO ===================================================== */
function balChip(d){
  const r=d.r,marc=r&&r.mode==='marcador'&&d.ph!=='lobby';
  if(marc)return `<div class="hg-balance">${rocketSVG(18)}<span>${signed(M.st.my_score)||0}</span> partida</div>`;
  return `<div class="hg-balance">${coin()}<span>${num(M.st.my_points||0)}</span> pts</div>`;
}
function studentHTML(d){
  const help=`<button class="cg-help-btn" onclick="CG.act('help')" aria-label="Normas y puntuación" title="Normas y puntuación">${helpIcon()}</button>`;
  const back=M.onBack?`<button class="hg-btn ghost small" onclick="CG.act('back')">← Minijuegos</button>`:'<span></span>';
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
  return `<div class="cg-hero">${rocketSVG(78,flame)}<div><h2 class="hg-title">${title}</h2>${sub?`<div class="cg-hero-sub">${sub}</div>`:''}</div></div>`;
}
function boardHTML(title){
  const b=M.st.board||[];
  if(!b.length)return '';
  return `<div class="hg-card"><div class="hg-between"><div class="hg-eyebrow">${title||'Marcador de la partida'}</div><div class="hg-meta">${M.st.match_rounds} ${M.st.match_rounds===1?'ronda':'rondas'}</div></div>
    <div class="hg-plist">${b.map((x,k)=>`<div class="hg-prow ${x.id===M.st.me?'me':''}"><b style="width:18px">${k+1}</b><div class="nm">${esc(x.name)}${x.id===M.st.me?' (tú)':''}</div><b class="${x.score>0?'hg-pos':x.score<0?'hg-neg':''}">${signed(x.score)||0}</b></div>`).join('')}</div></div>`;
}
function lobbyStudent(d){
  return `${heroHTML(NAME,'Adivina la cifra… ¡sin pasarte!')}
    <div class="hg-card"><div class="hg-eyebrow">En pocas palabras</div>
      <div class="cg-mini"><span>⬆️</span><div><b>Sube</b> la cifra y serás el capitán.</div></div>
      <div class="cg-mini"><span>🚀</span><div><b>Quédate</b> a bordo si crees que no se pasa.</div></div>
      <div class="cg-mini"><span>🪂</span><div><b>Salta</b> si crees que ya se ha pasado.</div></div>
      <button class="hg-btn ghost small" style="align-self:flex-start" onclick="CG.act('help')">${helpIcon()} Ver normas y puntuación</button></div>
    ${d.r&&d.r.status==='cancelled'?'<div class="hg-notice">La última ronda se canceló. No se ha movido ningún punto.</div>':''}
    <div class="hg-card" style="align-items:center;text-align:center">${onChip('Esperando al profesor')}<div class="hg-muted">En cuanto lance una pregunta podrás subir a bordo.</div></div>
    ${boardHTML()}`;
}
function questionCard(r,big){
  return `<div class="cg-q ${big?'big':''}"><div class="cg-q-k">Pregunta · ronda ${r.no}${r.value>1?` · vale ×${r.value}`:''}${r.mode==='marcador'?' · solo marcador':''}</div><div class="cg-q-t">${esc(r.question)}</div>${r.unit?`<div class="cg-q-u">Respuesta en: <b>${esc(r.unit)}</b></div>`:''}</div>`;
}
function boardingStudent(d){
  const r=d.r,aboard=r.players.length;
  return `${heroHTML('¡Sube a bordo!','')}
    ${questionCard(r)}
    <div class="hg-row hg-wrap"><span class="hg-chip amber">${clock()}Despega en <span data-cg-board>${mmss(secsLeft(r.boarding_closes_at))}</span></span>${onChip(`${aboard} de ${M.st.members} a bordo`)}</div>
    ${d.me?`<div class="hg-card cg-ok"><div class="hg-row">${rocketSVG(36)}<div><b>¡Estás a bordo!</b><div class="hg-meta">Cuando despegue se sorteará el orden de los turnos. Ve pensando tu cifra.</div></div></div></div>`
      :`<button class="hg-btn primary block cg-big-btn" ${M.busy?'disabled':''} onclick="CG.act('board')">🚀 Subir a bordo</button>
        <div class="hg-meta" style="text-align:center">Si no subes, esta ronda solo podrás mirar.</div>`}
    ${crewChips(r)}`;
}
function crewChips(r){
  if(!r.players.length)return '';
  return `<div class="cg-crew">${r.players.map(p=>`<span class="cg-pchip ${p.id===M.st.me?'me':''}">${esc(first(p.name))}</span>`).join('')}</div>`;
}
function statusChip(p,r){
  if(r.status==='playing'&&r.current===p.id)return '<span class="hg-chip amber">⏳ Su turno</span>';
  if(p.status==='waiting')return '<span class="hg-chip white">Espera</span>';
  if(p.status==='out')return '<span class="hg-chip white">Fuera</span>';
  if(p.status==='jumped')return `<span class="hg-chip red">${chuteSVG()} Saltó</span>`;
  if(p.captain)return '<span class="hg-chip tint">👨‍🚀 Capitán</span>';
  return '<span class="hg-chip green">🚀 A bordo</span>';
}
function seatsHTML(r,big){
  return `<div class="cg-seats ${big?'big':''}">${r.players.map(p=>`<div class="cg-seat ${r.current===p.id&&r.status==='playing'?'now':''} ${p.id===M.st.me?'me':''} ${p.status}">
    <span class="cg-seat-n">${p.seat||'·'}</span><span class="cg-seat-nm">${esc(p.name)}${p.id===M.st.me?' (tú)':''}${p.auto?' <span class="hg-meta">· sin responder</span>':''}</span>${statusChip(p,r)}</div>`).join('')}</div>`;
}
function eventText(e,r){
  const n=esc(e.name||'');
  switch(e.kind){
    case 'start':return `¡Despegue! ${e.value} ${e.value==1?'tripulante':'tripulantes'} a bordo`;
    case 'raise':return `<b>${n}</b> sube a <b>${withUnit(e.value,esc(r.unit))}</b> y es el nuevo capitán`;
    case 'stay':return `<b>${n}</b> se queda a bordo`;
    case 'jump':return `<b>${n}</b> salta en paracaídas 🪂`;
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
  if(r.bid==null)return `<div class="cg-bid empty ${big?'big':''}"><div class="cg-bid-k">Cifra actual</div><div class="cg-bid-v">—</div><div class="cg-bid-c">Aún nadie ha dicho una cifra</div></div>`;
  return `<div class="cg-bid ${big?'big':''}">${rocketSVG(big?84:56,true)}<div><div class="cg-bid-k">Cifra actual</div><div class="cg-bid-v">${withUnit(r.bid,esc(r.unit))}</div>
    <div class="cg-bid-c">Capitán: <b>${esc(r.captain_name||'—')}</b>${r.captain===M.st.me?' (tú)':''}</div></div></div>`;
}
function myRole(d){
  const me=d.me,r=d.r;if(!me)return null;
  if(me.status==='jumped')return 'jumped';
  if(me.status==='crew')return r.captain===M.st.me?'captain':'crew';
  return null;
}
function playStudent(d){
  const r=d.r,v=r.value,closed=d.ph==='closed';
  let action='';
  if(d.myTurn){
    const firstBid=r.bid==null;
    const sug=firstBid?[]:[r.bid+1,Math.ceil(r.bid*1.1),Math.ceil(r.bid*1.25),Math.ceil(r.bid*1.5)].filter((x,i,a)=>x>r.bid&&a.indexOf(x)===i);
    action=`<div class="cg-turn">
      <div class="hg-between"><h3>¡Te toca!</h3><div class="cg-timer" style="--p:1"><span data-cg-turn>${secsLeft(r.turn_deadline)}</span></div></div>
      ${firstBid?'<div class="hg-muted">Eres el primero: <b>tienes que decir una cifra</b>. Empieza con algo seguro.</div>':''}
      <div class="cg-opt raise">
        <div class="cg-opt-h">⬆️ ${firstBid?'Di tu cifra':'Subir la cifra'} <span class="hg-meta">→ serás capitán: ${outcomeLine('captain',v)}</span></div>
        <div class="cg-raise"><input id="cg-num" type="text" inputmode="decimal" autocomplete="off" placeholder="${firstBid?'Tu cifra':'Más de '+num(r.bid)}" aria-label="Tu cifra" oninput="CG.act('typing')" onkeydown="if(event.key==='Enter')CG.act('raise')">${r.unit?`<span class="cg-unit">${esc(r.unit)}</span>`:''}</div>
        ${sug.length?`<div class="hg-stakes">${sug.map(x=>`<button type="button" class="hg-stake" onclick="CG.act('sug',${x})">${num(x)}</button>`).join('')}</div>`:''}
        <div class="hg-meta" id="cg-preview">Usa coma para los decimales.</div>
        <button class="hg-btn primary block" id="cg-raise-btn" disabled onclick="CG.act('raise')">Escribe una cifra</button>
      </div>
      ${firstBid?'':`<div class="cg-two">
        <button class="cg-opt stay" ${M.busy?'disabled':''} onclick="CG.act('stay')"><div class="cg-opt-h">🚀 Me quedo a bordo</div><div class="hg-meta">${outcomeLine('crew',v)}</div></button>
        <button class="cg-opt jump" ${M.busy?'disabled':''} onclick="CG.act('jump')"><div class="cg-opt-h">🪂 ¡Salto!</div><div class="hg-meta">${outcomeLine('jumped',v)}</div></button>
      </div>`}
    </div>`;
  }else if(!d.me){
    action=`<div class="hg-card hg-muted">No subiste a bordo en esta ronda. ¡Mira cómo juegan los demás!</div>`;
  }else{
    const role=myRole(d);
    const txt=d.me.status==='out'?'Te quedaste fuera de esta ronda (no diste cifra a tiempo).'
      :d.me.status==='waiting'?`Te toca en el turno ${d.me.seat}. ${r.bid==null?'':'Ve pensando: ¿subir, quedarte o saltar?'}`
      :role==='captain'?`Eres el capitán: ${outcomeLine('captain',v)}. Si alguien sube, sigues a bordo.`
      :role==='crew'?`Vas a bordo: ${outcomeLine('crew',v)}.`
      :`Saltaste: ${outcomeLine('jumped',v)}.`;
    action=`<div class="hg-card ${d.me.status==='jumped'?'':'cg-ok'}"><div class="hg-eyebrow">Tu situación</div><div style="font-size:15px">${txt}</div></div>`;
  }
  const turnLine=closed?`<div class="hg-notice">Todos han jugado. El profesor va a revelar la respuesta…</div>`
    :d.myTurn?'':`<div class="hg-row hg-wrap"><span class="hg-chip amber">${clock()}Turno de ${esc(r.current_name||'')} · <span data-cg-turn>${secsLeft(r.turn_deadline)}</span> s</span><span class="hg-chip white">Turno ${r.turn} de ${r.seats_total}</span></div>`;
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
  const r=d.r,vd=verdict(r),me=d.me,u=r.mode==='marcador'?'':' pts';
  let mine;
  if(!me)mine=`<div class="hg-muted">No subiste a bordo en esta ronda.</div>`;
  else{
    const role=me.status==='out'?'Te quedaste fuera':me.status==='jumped'?'Saltaste':r.captain===M.st.me?'Eras el capitán':'Ibas a bordo';
    mine=`<div class="hg-between"><div><div class="hg-meta">${role}</div><div class="cg-delta ${me.delta>0?'hg-pos':me.delta<0?'hg-neg':''}">${signed(me.delta)||0}${u}</div></div>
      ${r.mode==='puntos'?`<div style="text-align:right"><div class="hg-meta">Saldo</div><b style="font-size:20px">${num(M.st.my_points)}</b></div>`:''}</div>`;
  }
  return `<div class="hg-banner ${vd.ok===false?'lose':'win'}">
      <div class="hg-meta" style="${vd.ok===false?'':'color:rgba(255,255,255,.85)'}">${esc(r.question)}</div>
      <div class="cg-answer"><div><div class="cg-bid-k">Respuesta</div><div class="big">${withUnit(r.answer,esc(r.unit))}</div></div>
        <div><div class="cg-bid-k">Cifra final${r.captain_name?' · '+esc(r.captain_name):''}</div><div class="cg-final">${withUnit(r.bid,esc(r.unit))}</div></div></div>
      <h2>${vd.t}</h2></div>
    <div class="hg-card">${mine}</div>
    <div class="hg-card"><div class="hg-eyebrow">Resultados de la ronda</div>${resultRows(r)}</div>
    ${boardHTML()}
    <div class="hg-card hg-muted" style="font-size:14px">Cuando el profesor lance otra pregunta aparecerá aquí.</div>`;
}
function resultRows(r){
  if(!r.players.length)return '<div class="hg-muted">Nadie subió a bordo.</div>';
  const role=p=>p.status==='out'?'Fuera':p.status==='jumped'?'Saltó':p.captain?'Capitán':'A bordo';
  const rows=r.players.slice().sort((a,b)=>(b.delta||0)-(a.delta||0));
  return `<div class="hg-plist">${rows.map(p=>`<div class="hg-prow ${p.id===M.st.me?'me':''}"><div class="nm">${esc(p.name)}${p.id===M.st.me?' (tú)':''}</div><span class="hg-meta">${role(p)}</span><b class="${p.delta>0?'hg-pos':p.delta<0?'hg-neg':''}" style="width:44px;text-align:right">${signed(p.delta)||0}</b></div>`).join('')}</div>`;
}

/* ===================================================== PROFESOR ===================================================== */
function teacherHTML(d){
  const on=M.st.enabled;
  const head=`<div class="hg-card"><div class="hg-between"><div class="hg-row" style="gap:14px"><div class="cg-logo">${rocketSVG(44)}</div>
    <div><h3 style="font-size:20px">${NAME}</h3><div class="hg-muted" style="font-size:14px">Preguntas con respuesta numérica: suben la cifra, se quedan o saltan. Gana quien no se pasa.</div></div></div>
    <div class="hg-row"><button class="cg-help-btn" onclick="CG.act('help')" aria-label="Normas y puntuación" title="Normas y puntuación">${helpIcon()}</button><span class="hg-chip ${on?'green':'white'}">${on?'Activado':'Desactivado'}</span><button type="button" class="hg-switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="Activar ${NAME} para los alumnos" onclick="CG.act('toggle')"></button></div></div></div>`;
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
  const mode=locked?r.mode:c.mode,val=locked?r.value:c.value;
  const sel=(k,opts,cur,f)=>`<select ${locked?'disabled':''} onchange="CG.act('cfg','${k}',this.value)">${opts.map(o=>`<option value="${o}" ${o==cur?'selected':''}>${f(o)}</option>`).join('')}</select>`;
  return `<div class="hg-card" style="gap:2px"><h3 style="font-size:18px;margin-bottom:6px">Reglas</h3>
    <div class="hg-kv" style="flex-direction:column;align-items:stretch"><span class="hg-muted">Modo de juego</span>
      <div class="hg-seg" role="group" aria-label="Modo de juego">
        <button type="button" ${locked?'disabled':''} aria-pressed="${mode==='puntos'}" onclick="CG.act('cfg','mode','puntos')">Con puntos</button>
        <button type="button" ${locked?'disabled':''} aria-pressed="${mode==='marcador'}" onclick="CG.act('cfg','mode','marcador')">Solo marcador</button>
      </div></div>
    <div class="hg-kv"><span class="hg-muted">Valor de la ronda</span>${sel('value',VALUES,val,o=>'×'+o)}</div>
    ${locked?'':`<div class="hg-kv"><span class="hg-muted">Tiempo para subir</span>${sel('board',BOARD_TIMES,c.board,o=>o+' s')}</div>`}
    <div class="hg-kv"><span class="hg-muted">Tiempo por turno</span>${sel('turn',TURN_TIMES,locked?r.turn_secs:c.turn,o=>o+' s')}</div>
    <div style="margin-top:10px">${scoreTable(val,mode)}</div>
    <div class="hg-meta" style="padding:10px 12px;border-radius:12px;background:#f6f7fb;margin-top:8px">${mode==='marcador'
      ?'Solo marcador: los saldos del alumnado no cambian; se suma en el marcador de la partida.'
      :'Con puntos: se juega con los puntos reales del aula al revelar la respuesta. Nadie baja de 0.'}</div></div>`;
}
function readyTeacher(d){
  const r=d.r,c=M.cfg,bank=M.bank;
  let res='';
  if(d.ph==='revealed')res=revealTeacher(d);
  else if(r&&r.status==='cancelled')res='<div class="hg-notice">La última ronda se canceló. No se movió ningún punto.</div>';
  const next=r?r.no+1:1;
  const opts=bank?['<option value="">🎲 Pregunta al azar</option>'].concat(
    [...new Set(bank.map(q=>q.category))].map(cat=>`<optgroup label="${esc(cat)}">${bank.filter(q=>q.category===cat).map(q=>`<option value="${q.id}" ${q.id===c.question?'selected':''}>${esc(q.text.length>70?q.text.slice(0,68)+'…':q.text)}</option>`).join('')}</optgroup>`)).join('')
    :'<option value="">🎲 Pregunta al azar</option>';
  return `${res}<div class="hg-card">
    <div class="hg-eyebrow">${r?'Ronda '+next+' preparada':'Primera ronda'}</div>
    <div style="font-size:15px">Al lanzar la pregunta, el alumnado tiene ${c.board} s para subir a bordo. Después se sortea el orden y cada uno tiene ${c.turn} s en su turno. La respuesta no aparece en esta pantalla hasta que la reveles, así que puedes proyectarla.</div>
    <label class="cg-field"><span class="hg-muted">Pregunta</span><select onchange="CG.act('cfg','question',this.value)">${opts}</select></label>
    <div class="hg-row hg-wrap">
      <button class="hg-btn primary" ${M.busy?'disabled':''} onclick="CG.act('open')">${M.busy?'Preparando…':'🚀 Lanzar pregunta · ronda '+next}</button>
      <button class="hg-btn ghost" onclick="CG.act('bank')">${M.bankOpen?'Ocultar banco':'Banco de preguntas'}</button>
      ${r?`<label class="cg-check"><input type="checkbox" ${c.newMatch?'checked':''} onchange="CG.act('cfg','newMatch',this.checked)"> Empezar partida nueva (marcador a 0)</label>`:''}
    </div></div>
    ${d.ph!=='revealed'?boardHTML():''}`;
}
function boardingTeacher(d){
  const r=d.r;
  return `<div class="hg-card cg-stage">
    <div class="hg-between"><span class="hg-chip amber">${clock()}Embarque · despega en <span data-cg-board>${mmss(secsLeft(r.boarding_closes_at))}</span></span>${onChip(`${r.players.length} de ${M.st.members} a bordo`)}</div>
    ${questionCard(r,true)}
    <div class="cg-crew big">${r.players.length?r.players.map(p=>`<span class="cg-pchip">${esc(p.name)}</span>`).join(''):'<span class="hg-muted">Esperando a que suban los primeros tripulantes…</span>'}</div>
    <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
      <button class="hg-btn primary" ${!r.players.length||M.busy?'disabled':''} onclick="CG.act('start')">Despegar ya</button>
      <button class="hg-btn danger" style="margin-left:auto" onclick="CG.act('cancel')">Cancelar ronda</button></div></div>`;
}
function playTeacher(d){
  const r=d.r,closed=d.ph==='closed';
  return `<div class="hg-card cg-stage">
    <div class="hg-between">${closed?'<span class="hg-chip tint">Todos han jugado</span>':`<span class="hg-chip amber">${clock()}Turno de <b>${esc(r.current_name||'')}</b> · <span data-cg-turn>${secsLeft(r.turn_deadline)}</span> s</span>`}<span class="hg-chip white">Turno ${Math.min(r.turn,r.seats_total)} de ${r.seats_total}</span></div>
    ${questionCard(r,true)}
    ${bidBox(r,true)}
    <div class="cg-cols"><div><div class="hg-eyebrow" style="margin-bottom:8px">Tripulación</div>${seatsHTML(r,true)}</div>
      <div><div class="hg-eyebrow" style="margin-bottom:8px">Bitácora</div>${feedHTML(r,7)||'<div class="hg-muted">Aún no ha jugado nadie.</div>'}</div></div>
    <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
      ${closed?`<button class="hg-btn primary cg-big-btn" ${M.busy?'disabled':''} onclick="CG.act('reveal')">🔭 Revelar la respuesta</button>`
        :`<button class="hg-btn ghost" onclick="CG.act('skip')">Saltar turno de ${esc(first(r.current_name))}</button>`}
      <button class="hg-btn danger" style="margin-left:auto" onclick="CG.act('cancel')">Cancelar ronda</button></div></div>`;
}
function revealTeacher(d){
  const r=d.r,vd=verdict(r),u=r.mode==='marcador'?'':' pts';
  return `<div class="hg-card cg-stage">
    <div class="hg-between"><h3 style="font-size:22px">Ronda ${r.no} · ${vd.t}</h3>${r.mode==='marcador'?'<span class="hg-chip tint">Solo marcador</span>':''}</div>
    <div class="cg-q-t" style="font-size:18px">${esc(r.question)}</div>
    <div class="cg-reveal"><div><div class="cg-bid-k">Respuesta</div><div class="cg-answer-big">${withUnit(r.answer,esc(r.unit))}</div></div>
      <div><div class="cg-bid-k">Cifra final${r.captain_name?' · '+esc(r.captain_name):''}</div><div class="cg-answer-big ${vd.ok===false?'hg-neg':vd.ok?'hg-pos':''}">${withUnit(r.bid,esc(r.unit))}</div></div></div>
    ${r.players.length?`<div style="overflow-x:auto"><table class="hg-t"><thead><tr><th>Alumno</th><th>Papel</th><th class="n">Resultado</th></tr></thead><tbody>
      ${r.players.slice().sort((a,b)=>(b.delta||0)-(a.delta||0)).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.status==='out'?'Fuera':p.status==='jumped'?'Saltó':p.captain?'Capitán':'A bordo'}</td><td class="n ${p.delta>0?'hg-pos':p.delta<0?'hg-neg':''}">${signed(p.delta)||0}${p.delta?u:''}</td></tr>`).join('')}
      </tbody></table></div>`:''}
    </div>${boardHTML()}`;
}
function bankHTML(){
  const b=M.bank;
  if(!b)return `<div class="hg-card hg-muted">Cargando el banco de preguntas…</div>`;
  const mine=b.filter(q=>q.mine),common=b.filter(q=>!q.mine);
  const row=q=>`<div class="hg-prow"><div class="nm" style="white-space:normal">${esc(q.text)}</div><b style="white-space:nowrap">${withUnit(q.answer,esc(q.unit))}</b>${q.mine?`<button class="hg-btn danger small" onclick="CG.act('delq','${q.id}')" aria-label="Borrar pregunta">Borrar</button>`:''}</div>`;
  return `<div class="hg-card"><div class="hg-between"><h3 style="font-size:18px">Banco de preguntas</h3><span class="hg-chip amber">Con respuestas: no lo proyectes</span></div>
    <div class="cg-addq">
      <input id="cg-q-text" type="text" maxlength="200" placeholder="Nueva pregunta (ej.: ¿Cuántos alumnos hay en el centro?)">
      <input id="cg-q-ans" type="text" inputmode="decimal" placeholder="Respuesta">
      <input id="cg-q-unit" type="text" maxlength="30" placeholder="Unidad (opcional)">
      <button class="hg-btn primary small" onclick="CG.act('addq')">Añadir</button></div>
    ${mine.length?`<div class="hg-eyebrow">Mis preguntas (${mine.length})</div><div class="hg-plist">${mine.map(row).join('')}</div>`:''}
    <details><summary class="hg-eyebrow" style="cursor:pointer">Banco común de Benchi (${common.length})</summary><div class="hg-plist">${common.map(row).join('')}</div></details></div>`;
}

/* ---------- Alumno: puntos de la cabecera ---------- */
function syncPoints(d){
  if(!M.st||M.st.my_points==null)return;
  if(d.me&&d.r.mode==='puntos')M.dirty=true;
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
  const inp=M.root.querySelector('#cg-num'),btn=M.root.querySelector('#cg-raise-btn'),pv=M.root.querySelector('#cg-preview');
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
    case 'sug':{const i=M.root.querySelector('#cg-num');if(i){i.value=String(x).replace('.',',');M.draft=i.value;updateRaise();i.focus()}break}
    case 'board':{
      if(M.busy||!r)break;
      M.busy=true;refresh();
      const res=await rpc('cg_board',{p_round:r.id});
      if(!M)return;M.busy=false;if(res.ok)say('¡A bordo!');await poll();break;
    }
    case 'raise':case 'stay':case 'jump':{
      if(M.busy||!r)break;
      let v=null;
      if(a==='raise'){
        const inp=M.root.querySelector('#cg-num');v=parseNum(inp&&inp.value);
        if(v==null||(r.bid!=null&&v<=r.bid)){updateRaise();break}
      }
      M.busy=true;refresh();
      const res=await rpc('cg_act',{p_round:r.id,p_action:a,p_value:v});
      if(!M)return;M.busy=false;
      if(res.ok){M.draft='';say(a==='raise'?'¡Eres el capitán!':a==='stay'?'Sigues a bordo':'¡Has saltado!')}
      await poll();break;
    }
    case 'cfg':
      if(x==='mode'||x==='question')M.cfg[x]=y;else if(x==='newMatch')M.cfg.newMatch=!!y;else M.cfg[x]=+y;
      refresh();break;
    case 'toggle':{
      const on=M.st.enabled;
      if(on&&r&&['boarding','playing','closed'].includes(r.status)&&!confirm('Hay una ronda en marcha. Si desactivas el minijuego se cancelará (no se mueve ningún punto). ¿Continuar?'))break;
      if((await rpc('set_minigame',{p_class:M.classId,p_game:'cohete',p_enabled:!on})).ok)say(on?'Minijuego desactivado':'Minijuego activado para el aula');
      await poll();break;
    }
    case 'bank':M.bankOpen=!M.bankOpen;if(M.bankOpen&&!M.bank)loadBank();refresh();break;
    case 'addq':{
      const t=M.root.querySelector('#cg-q-text').value.trim(),ans=parseNum(M.root.querySelector('#cg-q-ans').value),u=M.root.querySelector('#cg-q-unit').value.trim();
      if(t.length<5){say('Escribe la pregunta (mínimo 5 caracteres)');break}
      if(ans==null){say('La respuesta tiene que ser un número');break}
      if((await rpc('cg_add_question',{p_text:t,p_answer:ans,p_unit:u,p_category:'Mis preguntas'})).ok){say('Pregunta añadida');M.bank=null;await loadBank()}
      break;
    }
    case 'delq':
      if(confirm('¿Borrar esta pregunta?')&&(await rpc('cg_delete_question',{p_id:x})).ok){if(M.cfg.question===x)M.cfg.question='';M.bank=null;await loadBank()}
      break;
    case 'open':{
      if(M.busy)break;
      M.busy=true;refresh();
      const c=M.cfg;
      const res=await rpc('cg_open_round',{p_class:M.classId,p_question:c.question||null,p_mode:c.mode,p_value:c.value,
        p_board_secs:c.board,p_turn_secs:c.turn,p_new_match:!!c.newMatch});
      if(!M)return;
      M.busy=false;if(res.ok){c.newMatch=false;c.question=''}
      await poll();break;
    }
    case 'start':if(r&&(await rpc('cg_start_now',{p_round:r.id})).ok)await poll();break;
    case 'skip':if(r&&(await rpc('cg_skip_turn',{p_round:r.id})).ok)await poll();break;
    case 'reveal':{
      if(M.busy||!r)break;
      M.busy=true;refresh();
      await rpc('cg_reveal',{p_round:r.id});
      if(!M)return;M.busy=false;await poll();break;
    }
    case 'cancel':
      if(r&&confirm('¿Cancelar la ronda? No se moverá ningún punto.')&&(await rpc('cg_cancel_round',{p_round:r.id})).ok)await poll();
      break;
  }
}
async function loadBank(){
  const m=M;
  const{data,error}=await sb.rpc('cg_list_questions');
  if(M!==m)return;
  if(error){say(error.message);return}
  m.bank=data||[];m.key='';refresh();
}

window.CG={mount,unmount,act,rocket:rocketSVG,NAME,takeDirty(){const d=!!(M&&M.dirty);if(M)M.dirty=false;return d}};

/* ===================================================== SELECTOR DE MINIJUEGOS =====================================================
   Une la carrera de caballos (HG) y el cohete (CG) en la pestaña «Minijuegos». */
let H=null;   // estado del selector
function hubStop(){if(H){clearInterval(H.t);H=null}}
function mountStudent(classId,root){
  hubStop();HG.unmount();CG.unmount();
  H={role:'student',classId,root,dirty:false,data:null,t:null};
  root.classList.add('hg');
  hubList();
}
async function hubPoll(){
  const h=H;if(!h||h.view!=='list')return;
  if(!document.body.contains(h.root)){hubStop();return}
  const[a,b]=await Promise.all([sb.rpc('horse_state',{p_class:h.classId}),sb.rpc('cg_state',{p_class:h.classId})]);
  if(H!==h||h.view!=='list')return;
  h.data={horses:a.error?null:a.data,cohete:b.error?null:b.data};
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
  const hs=dt.horses,cs=dt.cohete;
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
    const hint=st==='boarding'?(me?'Ya estás a bordo.':'¡Sube a bordo antes de que despegue!'):st==='playing'?(r.current===cs.me?'¡Te toca jugar!':me?'Estás en la partida.':'Puedes mirar la partida.'):'Esperando a que el profesor lance una pregunta.';
    cards.push(cardHTML('cohete',rocketSVG(72),NAME,'Adivina la cifra sin pasarte: sube, quédate a bordo o salta.',chip,hint));
  }
  const alert=(cs&&cs.enabled&&cs.round&&((cs.round.status==='boarding'&&!cs.round.players.some(p=>p.id===cs.me))||(cs.round.status==='playing'&&cs.round.current===cs.me)))
    ||(hs&&hs.enabled&&hs.round&&hs.round.status==='open'&&!hs.round.mine&&hs.now<hs.round.closes_at);
  const el=document.querySelector('.teacher-tab[data-tab="minigames"]');if(el)el.classList.toggle('hg-tab-live',!!alert);
  h.root.innerHTML=cards.length?`<div class="hg-games">${cards.join('')}</div>`
    :`<div class="hg-card"><h3>Minijuegos</h3><div class="hg-muted">Tu profesor aún no ha activado ningún minijuego en esta aula.</div></div>`;
}
function cardHTML(game,art,title,desc,chip,hint){
  return `<div class="hg-game"><div class="hg-game-art ${game==='cohete'?'cg-art':''}">${art}</div>
    <div class="hg-game-body"><div class="hg-between"><h3>${title}</h3>${chip}</div>
    <div class="hg-muted" style="font-size:14px">${desc}</div><div class="hg-meta">${hint}</div>
    <button class="hg-btn primary block" onclick="MG.play('${game}')">Jugar</button></div></div>`;
}
function play(game){
  const h=H;if(!h)return;
  h.view=game;clearInterval(h.t);
  const back=dirty=>{if(H===h)hubList(dirty)};
  if(game==='horses')HG.mount('student',h.classId,h.root,{start:'game',onBack:back});
  else CG.mount('student',h.classId,h.root,{onBack:back});
}
/* Profesor: pestañas para elegir qué minijuego configurar */
function mountTeacher(classId,root){
  // Al volver a la misma aula se recuerda la última pestaña elegida
  const last=H&&H.classId===classId&&H.lastGame||'horses',dirty=!!(H&&H.dirty);
  hubStop();HG.unmount();CG.unmount();
  H={role:'teacher',classId,root,dirty,view:null,lastGame:last};
  teacherTab(last);
}
function teacherTab(game){
  const h=H;if(!h)return;
  if(HG.takeDirty())h.dirty=true;
  if(CG.takeDirty())h.dirty=true;
  HG.unmount();CG.unmount();
  h.view=game;h.lastGame=game;
  h.root.innerHTML=`<div class="mg-tabs hg" role="tablist">
      <button role="tab" aria-selected="${game==='horses'}" onclick="MG.teacherTab('horses')">🏇 Carrera de caballos</button>
      <button role="tab" aria-selected="${game==='cohete'}" onclick="MG.teacherTab('cohete')">🚀 ${NAME}</button></div>
    <div id="mg-game"></div>`;
  const el=h.root.querySelector('#mg-game');
  if(game==='horses')HG.mount('teacher',h.classId,el);else CG.mount('teacher',h.classId,el);
}
window.MG={mountStudent,mountTeacher,play,teacherTab,
  takeDirty(){const d=HG.takeDirty()|CG.takeDirty()|!!(H&&H.dirty);if(H)H.dirty=false;return !!d}};
})();
