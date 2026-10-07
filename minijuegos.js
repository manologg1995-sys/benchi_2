/* Minijuegos de Benchi · Carrera de caballos.
   Todo lo que toca puntos pasa por funciones de Supabase (ver supabase/minijuegos.sql);
   aquí solo se pinta el estado y se envían acciones. Uso: HG.mount('teacher'|'student', classId, el). */
(function(){
'use strict';

const STEP_MS=100, DIST=1600, COUNT_MS=3000;
const HORSE_NAMES=['Relámpago','Canela','Tormenta','Pimienta','Galleta','Cometa','Brisa','Trueno','Chispa','Azúcar','Bombón','Huracán','Pistacho','Centella','Lucero','Turrón','Rayo','Mostaza'];
const SILKS=[{c:'#635bff',ink:'#FFFFFF'},{c:'#28c6e8',ink:'#172033'},{c:'#ff5a9d',ink:'#FFFFFF'},{c:'#ffc857',ink:'#172033'},{c:'#35c77f',ink:'#172033'}];
const COATS=[['#8B5A2B','#5C3A1A'],['#6B4226','#3E2614'],['#A0522D','#6B3519'],['#3E2A1E','#22160F'],['#C19A6B','#8A6A44'],['#E8E0D4','#A89B88']];
const TIMES=[20,30,40,60,90], CAPS=[0.1,0.2,0.3,0.5];
const R=Math.random;

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString('es-ES');
const fmt1=x=>x.toFixed(1).replace('.',',');
const pct=x=>Math.round(x*100);
const sum=a=>a.reduce((x,y)=>x+y,0);
const mmss=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};

/* ---------- Simulación (determinista a partir de la semilla del servidor) ---------- */
function simulate(strs,rng,record){
  const n=strs.length,pos=Array(n).fill(0),mood=strs.map(()=>(rng()-0.5)*1.2),fin=Array(n).fill(null);
  const frames=record?[pos.slice()]:null;let step=0;
  while(fin.some(f=>f===null)&&step<600){
    step++;
    for(let i=0;i<n;i++){
      mood[i]=mood[i]*0.97+(rng()-0.5)*0.6;
      let v=9.5*strs[i]*(1+0.2*mood[i]);
      if(step<8)v*=step/8;
      const prev=pos[i];pos[i]+=v;
      if(fin[i]===null&&pos[i]>=DIST)fin[i]=step-1+(DIST-prev)/(pos[i]-prev);
    }
    if(record)frames.push(pos.map(p=>Math.min(p,DIST)));
  }
  return{frames,fin};
}
function estimateProbs(strs){
  const c=strs.map(()=>0),N=2000;
  for(let k=0;k<N;k++){const{fin}=simulate(strs,R,false);let w=0;fin.forEach((x,i)=>{if(x<fin[w])w=i});c[w]++}
  return c.map(x=>x/N);
}
function genHorses(){
  const names=shuffle(HORSE_NAMES).slice(0,5),coats=shuffle([0,1,2,3,4,5]);
  const strs=names.map(()=>+(0.97+R()*0.06).toFixed(5)),probs=estimateProbs(strs);
  return names.map((name,i)=>({i,num:i+1,name,str:strs[i],prob:probs[i],coat:coats[i]}));
}
function leaderAt(F,s){const f=F[s];let l=0;f.forEach((x,i)=>{if(x>f[l])l=i});return l}
function buildEvents(sim,H){
  const ev=[],F=sim.frames,first=Math.min(...sim.fin);
  ev.push({step:0,msg:'¡Salida! Los cinco caballos arrancan a la vez'});
  let lead=leaderAt(F,14),since=14,lastMsg=0,stretch=false,half=false;
  ev.push({step:14,msg:H[lead].name+' toma la delantera'});
  for(let s=15;s<first;s++){
    const l=leaderAt(F,s);
    if(!half&&Math.max(...F[s])>=DIST*0.5){half=true;ev.push({step:s,msg:'Mitad de carrera: '+H[l].name+' en cabeza'});lastMsg=s}
    if(!stretch&&Math.max(...F[s])>=DIST*0.75){stretch=true;ev.push({step:s,msg:'Recta final: '+H[l].name+' manda'});lastMsg=s;lead=l;since=s;continue}
    if(l!==lead){if(s-since>=4&&s-lastMsg>=14){ev.push({step:s,msg:H[l].name+' adelanta a '+H[lead].name});lastMsg=s}lead=l;since=s}
  }
  ev.push({step:first,msg:'¡'+H[sim.fin.indexOf(first)].name+' cruza la meta en primer lugar!'});
  return ev;
}

/* ---------- Estado del módulo ---------- */
let M=null;
const now=()=>Date.now()+M.offset;

function mount(role,classId,root){
  unmount();
  M={role,classId,root,st:null,err:null,offset:0,view:'list',pick:null,stake:null,stakeRound:null,key:'',race:null,busy:false,launching:null,dirty:false,
     cfg:{time:40,cap:0.2,mode:'puntos'},raf:0,polling:false};
  root.classList.add('hg');
  root.innerHTML='<div class="hg-card hg-muted">Cargando minijuegos…</div>';
  M.pollT=setInterval(poll,2000);
  M.tickT=setInterval(tick,250);
  poll();
}
function unmount(){
  if(!M)return;
  clearInterval(M.pollT);clearInterval(M.tickT);cancelAnimationFrame(M.raf);M=null;
}
async function poll(){
  const m=M;if(!m||m.polling)return;
  m.polling=true;
  const t0=Date.now();
  try{
    const{data,error}=await sb.rpc('horse_state',{p_class:m.classId});
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
  refresh();
  if(M.role==='teacher'&&M.st){
    const d=derive();
    // Cierre automático solo si el tiempo se acaba con la pantalla delante
    if(d.ph==='closed'&&!M.launching&&now()-d.r.closes_at<8000&&M.launchFailed!==d.r.id)launch();
  }
}

/* ---------- Fases derivadas del estado del servidor ---------- */
function getRace(r){
  if(M.race&&M.race.id===r.id)return M.race;
  const sim=simulate(r.horses.map(h=>h.str),mulberry32(r.seed),true);
  M.race={id:r.id,frames:sim.frames,fin:sim.fin,order:r.order,events:buildEvents(sim,r.horses),shown:0,
    durMs:(Math.max(...sim.fin)+10)*STEP_MS};
  return M.race;
}
function derive(){
  const st=M.st;
  if(!st)return{ph:'loading'};
  if(!st.enabled)return{ph:'off'};
  const r=st.round;
  if(!r||r.status==='cancelled')return{ph:'lobby',r};
  const n=now();
  if(r.status==='open')return{ph:n<r.closes_at?'open':'closed',r};
  const race=getRace(r),t=n-(r.started_at+COUNT_MS);
  if(t<0)return{ph:'countdown',r,race,count:Math.ceil(-t/1000)};
  if(t<race.durMs)return{ph:'race',r,race,t};
  return{ph:'results',r,race};
}
function bal(d){
  const st=M.st,r=st.round,mine=r&&r.mine;
  const v=st.my_points||0;
  if(r&&r.mode==='votos')return v;
  return d&&(d.ph==='countdown'||d.ph==='race')&&mine?v-(mine.payout||0):v;   // no destripar el resultado antes de tiempo
}
const isVotes=r=>!!r&&r.mode==='votos';
// Aciertos acumulados (sin puntos); durante la carrera no se cuenta aún el voto de esta ronda
function hits(d){
  const r=d&&d.r,v=M.st.my_hits||0;
  return isVotes(r)&&(d.ph==='countdown'||d.ph==='race')&&r.mine&&r.mine.payout?v-1:v;
}
function balChip(d){
  return isVotes(d.r)?`<div class="hg-balance"><span id="hg-bal">${hits(d)}</span> ${hits(d)===1?'acierto':'aciertos'}</div>`
    :`<div class="hg-balance">${coin()}<span id="hg-bal">${fmt(bal(d))}</span> pts</div>`;
}
const maxStake=()=>{const p=M.st.my_points||0;return p<1?0:Math.max(1,Math.floor(p*M.st.round.cap))};

function refresh(){
  if(!M)return;
  if(!M.st){if(M.err)M.root.innerHTML=`<div class="hg-card"><div class="hg-notice">${esc(M.err)}</div><button class="hg-btn ghost" onclick="HG.act('retry')">Reintentar</button></div>`;return}
  const d=derive();
  const key=[d.ph,d.r?d.r.id:'',M.view,d.r&&d.r.mine?1:0,M.st.enabled?1:0,M.role==='student'&&d.ph==='open'&&!d.r.mine&&!isVotes(d.r)&&maxStake()<1?'x':''].join('|');
  if(key!==M.key){M.key=key;render(d)}else live(d);
  tabAlert(d);
}
function tabAlert(d){
  const el=document.querySelector('.teacher-tab[data-tab="minigames"]');
  if(el)el.classList.toggle('hg-tab-live',M.role==='student'&&d.ph==='open'&&!d.r.mine);
}

/* ---------- Piezas visuales ---------- */
function horseSVG(h){
  const[coat,dark]=COATS[h.coat%COATS.length],s=SILKS[h.i];
  return `<svg viewBox="0 0 64 44" width="64" height="44" aria-hidden="true">
  <path d="M15 19 C7 18 4 26 2 33 C8 31 11 27 15 24Z" fill="${dark}"/>
  <rect class="leg la" x="17" y="27" width="4" height="15" rx="2" fill="${dark}"/>
  <rect class="leg lb" x="38" y="27" width="4" height="15" rx="2" fill="${dark}"/>
  <rect class="leg lb" x="21" y="28" width="4" height="14" rx="2" fill="${coat}"/>
  <rect class="leg la" x="42" y="28" width="4" height="14" rx="2" fill="${coat}"/>
  <ellipse cx="30" cy="24" rx="17" ry="9" fill="${coat}"/>
  <path d="M40 21 L47 8 L53 10 L48 27Z" fill="${coat}"/>
  <path d="M47 6 C52 3 60 6 62 11 C62 14 58 15 54 13 L49 12Z" fill="${coat}"/>
  <path d="M48 7 L49 1.5 L51.5 6Z" fill="${dark}"/>
  <path d="M45 7 L40 19 L43 19 L48 9Z" fill="${dark}"/>
  <circle cx="55.5" cy="8" r="1.3" fill="#172033"/>
  <rect x="22" y="16" width="14" height="11" rx="2" fill="${s.c}" stroke="#fff" stroke-width="1"/>
  <text x="29" y="24.5" text-anchor="middle" font-size="8" font-weight="800" font-family="Inter, sans-serif" fill="${s.ink}">${h.num}</text>
  <path d="M27 17 L31 6 L36 7.5 L33 18Z" fill="${s.c}"/>
  <path d="M33 10 L41 13" stroke="${s.c}" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="34" cy="3.6" r="3.4" fill="${s.c}" stroke="#fff" stroke-width=".8"/>
</svg>`;
}
const demoHorse={i:0,num:1,coat:0};
const badge=(h,size)=>{size=size||40;const s=SILKS[h.i];return `<div class="hg-badge" style="width:${size}px;height:${size}px;background:${s.c};color:${s.ink};font-size:${Math.round(size/2)}px">${h.num}</div>`};
const coin=()=>`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c27a0a" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>`;
const clock=()=>`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const onChip=t=>`<span class="hg-chip green hg-live"><span class="hg-dot"></span>${t}</span>`;

function trackHTML(d,big){
  const r=d.r,mine=r.mine;
  const lanes=r.horses.map(h=>{
    const you=mine&&mine.horse===h.i;
    return `<div class="hg-lane ${you?'you':''}"><div class="hg-lname">${esc(h.name)}${you?' · tú':''}</div><div class="hg-finish"></div>
      <div class="hg-rank" data-h="${h.i}">${d.race.order.indexOf(h.i)+1}.º</div>
      <div class="hg-horse" data-h="${h.i}" style="left:0">${horseSVG(h)}</div></div>`}).join('');
  const ov=d.ph==='countdown'?`<div class="hg-overlay"><span>${d.count}</span></div>`:'';
  return `<div class="hg-track ${big?'big':''} ${d.ph==='race'?'hg-run':''}">${lanes}${ov}</div>`;
}
function feedHTML(d,n){
  const ev=d.race.events.slice(0,d.race.shown).reverse().slice(0,n);
  if(!ev.length)return '';
  return ev.map(e=>`<div class="hg-ev"><div class="t">${mmss(Math.round(e.step*STEP_MS/1000))}</div><div class="msg">${esc(e.msg)}</div></div>`).join('');
}
function podiumHTML(r){
  const o=r.order,H=r.horses;
  const col=(k,h,hgt)=>`<div class="p p${k}">${badge(H[h],k===1?48:40)}<div class="nm">${esc(H[h].name)}</div><div class="block" style="height:${hgt}px;font-size:${k===1?28:22}px">${k}.º</div></div>`;
  return `<div class="hg-podium">${col(2,o[1],62)}${col(1,o[0],92)}${col(3,o[2],42)}</div>`;
}
function shareBar(r){
  const T=sum(r.pools)||1;
  return `<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px;background:#eef0f6">${r.horses.map(h=>r.pools[h.i]?`<div style="width:${r.pools[h.i]/T*100}%;background:${SILKS[h.i].c}"></div>`:'').join('')}</div>`;
}
function resultInfo(r){
  const T=r.total,W=r.pools[r.winner]||0;
  return{T,W,refund:T>0&&W===0,mult:W>0?T/W:0};
}

/* ---------- Render ---------- */
function render(d){
  cancelAnimationFrame(M.raf);
  M.root.innerHTML=M.role==='teacher'?teacherHTML(d):studentHTML(d);
  if(d.ph==='open')updateStake();
  if(d.ph==='race'||d.ph==='countdown')anim();
  if(M.role==='student'&&d.ph==='results')syncPoints(d);
  if(d.ph==='open'||d.ph==='closed')live(d);
}

function gameCard(d){
  let chip='<span class="hg-chip tint">Activo</span>',hint='Esperando a que el profesor abra una ronda.';
  const V=d.r&&d.ph!=='lobby'&&isVotes(d.r);
  if(d.ph==='open'){chip=onChip('Ronda abierta');hint=d.r.mine?(V?'Ya has votado.':'Ya has hecho tu predicción.'):(V?'¡Vota antes de que se cierre!':'¡Haz tu predicción antes de que se cierre!')}
  else if(d.ph==='countdown'||d.ph==='race'){chip='<span class="hg-chip red hg-live"><span class="hg-dot"></span>En directo</span>';hint='La carrera está en marcha.'}
  else if(d.ph==='closed')hint='Predicciones cerradas.';
  return `<div class="hg-game"><div class="hg-game-art">${horseSVG(demoHorse).replace('width="64" height="44"','width="96" height="66"')}</div>
    <div class="hg-game-body"><div class="hg-between"><h3>Carrera de caballos</h3>${chip}</div>
    <div class="hg-muted" style="font-size:14px">${V?'Vota por el caballo que crees que ganará. Sin puntos en juego: solo cuentan los aciertos.':'Apuesta puntos por el caballo que crees que ganará y reparte el bote con quien acierte.'}</div>
    <div class="hg-meta">${hint}</div>
    <button class="hg-btn primary block" onclick="HG.act('play')">Jugar</button></div></div>`;
}

/* ===== Alumno ===== */
function studentHTML(d){
  if(d.ph==='off')return `<div class="hg-card"><h3>Minijuegos</h3><div class="hg-muted">Tu profesor aún no ha activado ningún minijuego en esta aula.</div></div>`;
  if(M.view==='list')return `<div class="hg-games">${gameCard(d)}</div>`;
  const r=d.r,V=isVotes(r)&&d.ph!=='lobby';
  // En el lobby se muestra el saldo; en una ronda sin puntos, los aciertos
  const head=`<div class="hg-between"><button class="hg-btn ghost small" onclick="HG.act('list')">← Minijuegos</button>${d.ph==='lobby'?balChip({ph:'lobby',r:null}):balChip(d)}</div>`;
  let body='';
  if(d.ph==='lobby'){
    body=`<div class="hg-col" style="gap:6px"><h2 class="hg-title">Carrera de caballos</h2><div class="hg-muted">Predice qué caballo ganará. El profesor decide en cada ronda si se juega con puntos o sin ellos.</div></div>
    ${r&&r.status==='cancelled'?'<div class="hg-notice">La última ronda se canceló'+(isVotes(r)?'.':' y se devolvieron los puntos.')+'</div>':''}
    <div class="hg-card"><div class="hg-eyebrow">Cómo funciona</div>
      <div class="hg-row" style="align-items:flex-start"><b style="width:22px">1</b><div>Cuando el profesor abra la ronda, elige un caballo.</div></div>
      <div class="hg-row" style="align-items:flex-start"><b style="width:22px">2</b><div><b>Con puntos:</b> pones los que quieras (con un límite sobre tu saldo) y todo va a un <b>bote común</b>. Si tu caballo gana, te llevas una parte; si pierdes, pierdes lo apostado; si nadie acierta, se devuelve todo.</div></div>
      <div class="hg-row" style="align-items:flex-start"><b style="width:22px">3</b><div><b>Sin puntos:</b> tienes <b>un voto</b> por ronda. No arriesgas nada: solo cuentan los aciertos.</div></div></div>
    <div class="hg-card" style="align-items:center;text-align:center">${onChip('Esperando al profesor')}<div class="hg-muted">Aquí aparecerá la ronda en cuanto el profesor la abra.</div></div>`;
  }else if(d.ph==='open'||d.ph==='closed'){
    body=openHTML(d);
  }else if(d.ph==='countdown'||d.ph==='race'){
    const mine=r.mine;
    body=`<div class="hg-col" style="gap:6px"><span class="hg-chip red hg-live" style="align-self:flex-start"><span class="hg-dot"></span>EN DIRECTO</span>
      <h2 class="hg-title">${d.ph==='countdown'?'¡Preparados!':'¡En carrera!'}</h2></div>
      ${mine?`<div class="hg-card"><div class="hg-row">${badge(r.horses[mine.horse])}<div style="flex-grow:1"><div class="hg-meta">${V?'Tu voto':'Tu predicción'}</div><div style="font-weight:850">${esc(r.horses[mine.horse].name)}${V?'':' · '+mine.amount+' pts'}</div></div><span class="hg-chip green" data-hg-myrank>—</span></div></div>`:`<div class="hg-card hg-muted">No has ${V?'votado':'hecho predicción'} en esta ronda. ¡Disfruta de la carrera!</div>`}
      <div class="hg-col" style="gap:6px"><div class="hg-between" style="font-size:13px"><b>Progreso</b><span class="hg-muted" data-hg-progtxt>0 %</span></div><div class="hg-bar" style="height:8px"><div data-hg-prog style="width:0;background:var(--hg-grad)"></div></div></div>
      ${trackHTML(d,false)}
      <div class="hg-card"><div class="hg-eyebrow">Lo que ha ${V?'votado':'predicho'} la clase</div>${shareBar(r)}</div>
      <div class="hg-card"><div class="hg-eyebrow">Narración</div><div class="hg-feed" data-hg-feed="4"></div></div>`;
  }else if(d.ph==='results'){
    body=resultsStudentHTML(d);
  }
  return `<div class="hg-phone">${head}${body}</div>`;
}

function openHTML(d){
  const r=d.r,p=r.pools,T=sum(p),mine=r.mine,closed=d.ph==='closed',V=isVotes(r),m=V?0:maxStake();
  const cards=r.horses.map(h=>{
    const isMine=mine&&mine.horse===h.i;
    return `<button type="button" class="hg-hcard ${isMine?'mine':''}" ${mine||closed?'disabled':''} aria-pressed="${M.pick===h.i}" onclick="HG.act('pick',${h.i})">
      ${badge(h)}
      <div class="hg-mid"><div class="hg-name">${esc(h.name)}${isMine?(V?' · tu voto':' · tu predicción'):''}</div>
        <div class="hg-bar"><div data-hg-share="${h.i}" style="width:${T?p[h.i]/T*100:0}%;background:${SILKS[h.i].c}"></div></div>
        <div class="hg-meta">Prob. estimada ${pct(h.prob)} %${V?'':` · <span data-hg-pool="${h.i}">${fmt(p[h.i])}</span> pts en el bote`}</div></div>
      ${V?`<div class="hg-right"><div class="hg-mult"><span data-hg-pool="${h.i}">${p[h.i]}</span></div><div class="hg-meta">votos</div></div>`
        :`<div class="hg-right"><div class="hg-mult" data-hg-mult="${h.i}">${T&&p[h.i]?'×'+fmt1(T/p[h.i]):'—'}</div><div class="hg-meta">paga hoy</div></div>`}
    </button>`}).join('');
  let stake='';
  if(V){
    stake=mine?`<div class="hg-card"><div class="hg-row">${badge(r.horses[mine.horse])}<div style="flex-grow:1"><div class="hg-meta">Voto enviado</div><div style="font-weight:850;font-size:16px">${esc(r.horses[mine.horse].name)}</div></div><span class="hg-chip green">Bloqueado</span></div></div>`
      :closed?`<div class="hg-notice">Votación cerrada. El profesor lanzará la carrera en unos segundos.</div>`
      :`<button class="hg-btn primary block" id="hg-vote-btn" ${M.pick==null?'disabled':''} onclick="HG.act('bet')">${M.pick==null?'Elige un caballo':'Votar por '+esc(r.horses[M.pick].name)}</button>`;
  }else if(mine){
    stake=`<div class="hg-card"><div class="hg-row">${badge(r.horses[mine.horse])}<div style="flex-grow:1"><div class="hg-meta">Predicción enviada</div><div style="font-weight:850;font-size:16px">${esc(r.horses[mine.horse].name)} · ${mine.amount} pts</div></div><span class="hg-chip green">Bloqueada</span></div>
      <div class="hg-meta">Si gana te llevarías ≈ <b id="hg-mylive">${fmt(p[mine.horse]?mine.amount*T/p[mine.horse]:mine.amount)}</b> pts (cambia hasta el cierre según lo que ponga la clase).</div></div>`;
  }else if(closed){
    stake=`<div class="hg-notice">Predicciones cerradas. El profesor lanzará la carrera en unos segundos.</div>`;
  }else if(m<1){
    stake=`<div class="hg-notice">No tienes puntos suficientes para participar en esta ronda.</div>`;
  }else{
    if(M.stakeRound!==r.id||M.stake==null){M.stakeRound=r.id;M.stake=Math.max(1,Math.round(m/2));M.pick=null}
    const q=[Math.max(1,Math.round(m*.1)),Math.max(1,Math.round(m*.25)),Math.max(1,Math.round(m*.5)),m];
    stake=`<div class="hg-col" style="gap:8px">
      <div class="hg-between"><div class="hg-eyebrow">¿Cuántos puntos?</div><div class="hg-meta">Máx. ${pct(r.cap)} % de tu saldo = ${m}</div></div>
      <div class="hg-stakes">${q.map((v,k)=>`<button type="button" class="hg-stake" data-q="${v}" onclick="HG.act('stake',${v})">${k===3?'Máx '+v:v}</button>`).join('')}</div>
      <input id="hg-range" type="range" min="1" max="${m}" value="${M.stake}" aria-label="Puntos a poner" oninput="HG.act('stake',this.value)"></div>
      <div class="hg-card"><div class="hg-between"><div><div class="hg-meta" id="hg-sb-label"></div><div style="font-size:12px" id="hg-sb-ev"></div></div><div class="hg-payout" id="hg-sb-pay"></div></div>
      <button class="hg-btn primary block" id="hg-sb-btn" onclick="HG.act('bet')"></button></div>`;
  }
  return `<div class="hg-col" style="gap:6px"><h2 class="hg-title">Gran Premio · Ronda ${r.no}</h2>
    <div class="hg-row hg-wrap"><span class="hg-chip amber">${clock()}${closed?'Cerrado':`Cierra en <span data-hg-timer>${mmss(Math.ceil((r.closes_at-now())/1000))}</span>`}</span>${onChip(`${M.st.members} en el aula`)}<span class="hg-chip white">${V?`<span data-hg-votes>${T}</span> votos`:`Bote <span data-hg-total>${fmt(T)}</span> pts`}</span>${V?'<span class="hg-chip tint">Sin puntos</span>':''}</div></div>
    <div class="hg-eyebrow">${mine?(V?'Así va la votación':'Así va el bote'):'Elige tu caballo'}</div>
    <div class="hg-hcards">${cards}</div>${stake}`;
}

function resultsVotesStudentHTML(d){
  const r=d.r,mine=r.mine,w=r.horses[r.winner],H=r.horses,total=M.st.my_votes||0,h=M.st.my_hits||0;
  const me=typeof state!=='undefined'&&state.profile?state.profile.id:null;
  const winners=r.rows.filter(x=>x.payout>0);
  let banner;
  if(!mine)banner=`<div class="hg-banner lose"><h2>Ganó ${esc(w.name)}</h2><div class="hg-muted">No votaste en esta ronda.</div></div>`;
  else if(mine.payout>0)banner=`<div class="hg-banner win"><div><h2>¡Acertaste!</h2><div style="opacity:.88">${esc(w.name)} ganó la ronda ${r.no}</div></div><div class="big">+1 acierto</div><div>Llevas ${h} de ${total} ${total===1?'voto':'votos'}</div></div>`;
  else banner=`<div class="hg-banner lose"><div><h2>Esta vez no</h2><div class="hg-muted">Ganó ${esc(w.name)}; tú votaste por ${esc(H[mine.horse].name)}.</div></div><div>Llevas ${h} ${h===1?'acierto':'aciertos'} de ${total} ${total===1?'voto':'votos'}</div></div>`;
  const top=M.st.hits_top||[];
  return `${banner}${podiumHTML(r)}
    <div class="hg-card"><div class="hg-between"><div class="hg-eyebrow">Acertaron ${winners.length}</div><div class="hg-meta">de ${r.total} votos</div></div>
      ${winners.length?`<div class="hg-plist">${winners.map(x=>`<div class="hg-prow ${x.student_id===me?'me':''}"><div class="nm">${esc(x.name)}${x.student_id===me?' (tú)':''}</div></div>`).join('')}</div>`:`<div class="hg-muted" style="font-size:14px">Nadie votó por ${esc(w.name)} esta ronda.</div>`}</div>
    ${top.length?`<div class="hg-card"><div class="hg-eyebrow">Más aciertos del aula</div><div class="hg-plist">${top.map((x,k)=>`<div class="hg-prow"><b style="width:18px">${k+1}</b><div class="nm">${esc(x.name)}</div><b>${x.hits}</b></div>`).join('')}</div></div>`:''}
    <div class="hg-card hg-muted" style="font-size:14px">Cuando el profesor abra otra ronda aparecerá aquí.</div>`;
}
function resultsStudentHTML(d){
  if(isVotes(d.r))return resultsVotesStudentHTML(d);
  const r=d.r,mine=r.mine,w=r.horses[r.winner],ri=resultInfo(r),H=r.horses;
  let banner;
  if(!mine)banner=`<div class="hg-banner lose"><h2>Ganó ${esc(w.name)}</h2><div class="hg-muted">No participaste en esta ronda.</div></div>`;
  else if(ri.refund)banner=`<div class="hg-banner lose"><h2>Nadie acertó</h2><div class="hg-muted">Ganó ${esc(w.name)}, pero nadie lo eligió: se te devuelven tus ${mine.amount} pts.</div></div>`;
  else if(mine.payout>0)banner=`<div class="hg-banner win"><div><h2>¡Acertaste!</h2><div style="opacity:.88">${esc(w.name)} ganó la ronda ${r.no}</div></div><div class="big">+${fmt(mine.payout-mine.amount)} pts</div>
    <div class="hg-stats3"><div><span class="k">Pusiste</span><span class="v">${mine.amount}</span></div><div><span class="k">Recibes</span><span class="v">${mine.payout}</span></div><div><span class="k">Saldo</span><span class="v">${fmt(M.st.my_points)}</span></div></div></div>`;
  else banner=`<div class="hg-banner lose"><div><h2>Esta vez no</h2><div class="hg-muted">Ganó ${esc(w.name)}; tú ibas con ${esc(H[mine.horse].name)}.</div></div><div class="big">−${mine.amount} pts</div>
    <div class="hg-stats3"><div><span class="k">Pusiste</span><span class="v">${mine.amount}</span></div><div><span class="k">Recibes</span><span class="v">0</span></div><div><span class="k">Saldo</span><span class="v">${fmt(M.st.my_points)}</span></div></div></div>`;
  const me=typeof state!=='undefined'&&state.profile?state.profile.id:null;
  const winners=ri.refund?[]:r.rows.filter(x=>x.payout>0&&x.horse===r.winner);
  return `${banner}${podiumHTML(r)}
    ${ri.T>0&&!ri.refund?`<div class="hg-card" style="font-size:14px">Bote total <b>${fmt(ri.T)}</b> pts ÷ <b>${fmt(ri.W)}</b> pts acertados → cada punto acertado paga <b>×${fmt1(ri.mult)}</b>.</div>`:''}
    ${winners.length?`<div class="hg-card"><div class="hg-between"><div class="hg-eyebrow">Acertaron ${winners.length}</div><div class="hg-meta">pone → recibe</div></div><div class="hg-plist">${winners.map(x=>`<div class="hg-prow ${x.student_id===me?'me':''}"><div class="nm">${esc(x.name)}${x.student_id===me?' (tú)':''}</div><div class="hg-muted">${x.amount} → <b style="color:var(--hg-ink)">${x.payout}</b></div></div>`).join('')}</div></div>`:''}
    <div class="hg-card hg-muted" style="font-size:14px">Cuando el profesor abra otra ronda aparecerá aquí.</div>`;
}

/* ===== Profesor ===== */
function teacherHTML(d){
  const on=M.st.enabled;
  const head=`<div class="hg-card"><div class="hg-between"><div class="hg-row" style="gap:14px"><div class="hg-badge" style="width:48px;height:48px;background:var(--hg-grad);color:#fff;font-size:22px">🏇</div>
    <div><h3 style="font-size:20px">Carrera de caballos</h3><div class="hg-muted" style="font-size:14px">Los alumnos apuestan puntos por un caballo y se reparten el bote.</div></div></div>
    <div class="hg-row"><span class="hg-chip ${on?'green':'white'}">${on?'Activado':'Desactivado'}</span><button type="button" class="hg-switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="Activar la carrera de caballos para los alumnos" onclick="HG.act('toggle')"></button></div></div></div>`;
  if(!on)return `<div class="hg-col">${head}<div class="hg-card hg-muted">Los alumnos no ven este minijuego. Actívalo para que aparezca en su pestaña «Minijuegos».</div></div>`;
  const locked=d.ph==='open'||d.ph==='closed'||d.ph==='countdown'||d.ph==='race';
  // Con una ronda en curso se muestra el modo de esa ronda; si no, el que elige el profesor
  const V=(locked&&d.r?d.r.mode:M.cfg.mode)==='votos';
  const sel=(k,opts,cur,f)=>`<select ${locked?'disabled':''} onchange="HG.act('cfg','${k}',this.value)">${opts.map(o=>`<option value="${o}" ${o===cur?'selected':''}>${f(o)}</option>`).join('')}</select>`;
  const rules=`<div class="hg-card" style="gap:2px"><h3 style="font-size:18px;margin-bottom:6px">Reglas</h3>
    <div class="hg-kv" style="flex-direction:column;align-items:stretch"><span class="hg-muted">Modo de juego</span>
      <div class="hg-seg" role="group" aria-label="Modo de juego">
        <button type="button" ${locked?'disabled':''} aria-pressed="${!V}" onclick="HG.act('cfg','mode','puntos')">Con puntos</button>
        <button type="button" ${locked?'disabled':''} aria-pressed="${V}" onclick="HG.act('cfg','mode','votos')">Sin puntos</button>
      </div></div>
    <div class="hg-kv"><span class="hg-muted">Tiempo para ${V?'votar':'apostar'}</span>${sel('time',TIMES,M.cfg.time,o=>o+' s')}</div>
    ${V?`<div class="hg-kv"><span class="hg-muted">Por alumno</span><b>1 voto por ronda</b></div>
    <div class="hg-kv"><span class="hg-muted">Premio</span><b>Contador de aciertos</b></div>
    <div class="hg-meta" style="padding:10px 12px;border-radius:12px;background:#f6f7fb;margin-top:8px">Sin puntos en juego: los saldos del alumnado no cambian. Solo se cuentan los aciertos.</div>`
    :`<div class="hg-kv"><span class="hg-muted">Límite por alumno</span>${sel('cap',CAPS,M.cfg.cap,o=>pct(o)+' % saldo')}</div>
    <div class="hg-kv"><span class="hg-muted">Reparto</span><b>Bote común</b></div>
    <div class="hg-kv"><span class="hg-muted">Si nadie acierta</span><b>Se devuelve</b></div>
    <div class="hg-meta" style="padding:10px 12px;border-radius:12px;background:#f6f7fb;margin-top:8px">Se juega con los puntos reales del aula: se descuentan al apostar y los ganadores los cobran al terminar la carrera.</div>`}</div>`;
  let main='';
  const r=d.r;
  if(d.ph==='lobby'||d.ph==='results'){
    main=`<div class="hg-card">
      ${d.ph==='lobby'&&r&&r.status==='cancelled'?`<div class="hg-notice">La última ronda se canceló${isVotes(r)?'.':' y se devolvieron todos los puntos.'}</div>`:''}
      ${d.ph==='results'?teacherResultsHTML(d):`<div class="hg-eyebrow">${r?'Ronda '+(r.no+1)+' preparada':'Primera ronda'}</div>
      <div style="font-size:15px">Al abrir la ronda aparecen 5 caballos nuevos y el alumnado tiene ${M.cfg.time} s para ${V?'votar (sin puntos en juego)':'apostar'}. El resultado se decide al lanzar la carrera y todos la ven a la vez en sus dispositivos.</div>`}
      <div><button class="hg-btn primary" ${M.busy?'disabled':''} onclick="HG.act('open')">${M.busy?'Preparando…':(V?'Abrir votación':'Abrir predicciones')+' · ronda '+(r?r.no+1:1)}</button></div></div>`;
  }else if(d.ph==='open'||d.ph==='closed'){
    const p=r.pools,T=sum(p);
    main=`<div class="hg-card" style="gap:18px"><div class="hg-between" style="align-items:flex-start">
      <div><div class="hg-eyebrow">${V?'Votación en directo':'Bote en directo'}</div><div class="hg-bigstat" style="margin-top:8px">${V?`<span data-hg-votes>${T}</span> votos`:`<span data-hg-total>${fmt(T)}</span> pts`}</div><div class="hg-muted"><span data-hg-bets>${r.bets}</span> de ${M.st.members} alumnos han ${V?'votado':'apostado'}</div></div>
      <div style="text-align:right"><div class="hg-eyebrow">${d.ph==='closed'?'Estado':'Cierre en'}</div><div class="hg-bigstat" style="color:#c27a0a;margin-top:8px" data-hg-timer>${d.ph==='closed'?'Cerrado':mmss(Math.ceil((r.closes_at-now())/1000))}</div></div></div>
      <div class="hg-col" style="gap:12px">${r.horses.map(h=>`<div class="hg-pool">${badge(h,32)}<div class="nm">${esc(h.name)}</div><div class="hg-bar"><div data-hg-share="${h.i}" style="width:${T?p[h.i]/T*100:0}%;background:${SILKS[h.i].c}"></div></div><div class="val">${V?`<b><span data-hg-pool="${h.i}">${p[h.i]}</span> votos</b> <span class="hg-muted">· ${pct(h.prob)} %</span>`:`<b><span data-hg-pool="${h.i}">${fmt(p[h.i])}</span> pts</b> <span class="hg-muted">· <span data-hg-count="${h.i}">${r.counts[h.i]}</span> · ${pct(h.prob)} %</span>`}</div></div>`).join('')}</div>
      <div class="hg-meta">${V?'Columnas: votos · probabilidad estimada.':'Columnas: puntos en el bote · nº de alumnos · probabilidad estimada.'}</div>
      <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
        <button class="hg-btn primary" ${M.launching?'disabled':''} onclick="HG.act('launch')">${d.ph==='closed'?'Lanzar carrera':'Cerrar predicciones y lanzar carrera'}</button>
        ${d.ph==='open'?`<button class="hg-btn ghost" onclick="HG.act('extend')">+15 s</button>`:''}
        <button class="hg-btn danger" style="margin-left:auto" onclick="HG.act('cancel')">${V?'Cancelar ronda':'Cancelar y devolver puntos'}</button></div></div>`;
  }else if(d.ph==='countdown'||d.ph==='race'){
    main=`<div class="hg-card"><div class="hg-between"><h3 style="font-size:24px">Ronda ${r.no} · ${d.ph==='countdown'?'¡Preparados!':'En carrera'}</h3><span class="hg-chip red hg-live"><span class="hg-dot"></span>EN DIRECTO</span></div>
      <div class="hg-muted" style="font-size:14px">${V?'Votación cerrada':'Bote cerrado'}: <b style="color:var(--hg-ink)">${V?r.total+' votos':fmt(r.total)+' pts'}</b>. Proyecta esta pantalla para que toda la clase vea la carrera.</div>
      ${trackHTML(d,true)}
      <div><div class="hg-eyebrow" style="margin-bottom:8px">Narración</div><div class="hg-feed" data-hg-feed="6"></div></div></div>`;
  }
  return `<div class="hg-col">${head}<div class="hg-desk">${rules}<div style="min-width:0">${main}</div></div></div>`;
}
function teacherResultsHTML(d){
  const r=d.r,ri=resultInfo(r);
  if(isVotes(r))return `<div class="hg-between"><h3 style="font-size:24px">Ronda ${r.no} · gana ${esc(r.horses[r.winner].name)}</h3></div>
    ${podiumHTML(r)}
    <div class="hg-muted" style="font-size:14px">${r.total===0?'Nadie votó en esta ronda.':`Acertaron <b style="color:var(--hg-ink)">${ri.W}</b> de ${r.total} votos. No se ha movido ningún punto.`}</div>
    ${r.rows.length?`<div style="overflow-x:auto"><table class="hg-t"><thead><tr><th>Alumno</th><th>Votó</th><th class="n">Resultado</th></tr></thead><tbody>
    ${r.rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(r.horses[x.horse].name)}</td><td class="n ${x.payout?'hg-pos':''}" style="${x.payout?'':'color:var(--hg-muted)'}">${x.payout?'Acierto':'Fallo'}</td></tr>`).join('')}
    </tbody></table></div>`:''}`;
  return `<div class="hg-between"><h3 style="font-size:24px">Ronda ${r.no} · gana ${esc(r.horses[r.winner].name)}</h3></div>
    ${podiumHTML(r)}
    <div class="hg-muted" style="font-size:14px">${ri.T===0?'Nadie apostó en esta ronda.':ri.refund?'Nadie eligió al ganador: se han devuelto todos los puntos.':`Bote ${fmt(ri.T)} pts ÷ ${fmt(ri.W)} pts acertados → ×${fmt1(ri.mult)} por punto.`}</div>
    ${r.rows.length?`<div style="overflow-x:auto"><table class="hg-t"><thead><tr><th>Alumno</th><th>Caballo</th><th class="n">Puso</th><th class="n">Recibe</th><th class="n">Neto</th></tr></thead><tbody>
    ${r.rows.slice().sort((a,b)=>(b.payout-b.amount)-(a.payout-a.amount)).map(x=>{const net=x.payout-x.amount;return `<tr><td>${esc(x.name)}</td><td>${esc(r.horses[x.horse].name)}</td><td class="n">${x.amount}</td><td class="n">${x.payout}</td><td class="n ${net>=0?'hg-pos':'hg-neg'}">${net>=0?'+':'−'}${Math.abs(net)}</td></tr>`}).join('')}
    </tbody></table></div>`:''}`;
}

/* ---------- Actualizaciones en vivo (sin repintar) ---------- */
function live(d){
  const q=s=>M.root.querySelectorAll(s);
  if(d.ph==='countdown')q('.hg-overlay span').forEach(e=>{if(e.textContent!==String(d.count))e.textContent=d.count});
  if(d.ph==='open'||d.ph==='closed'){
    const r=d.r,p=r.pools,T=sum(p);
    q('[data-hg-timer]').forEach(e=>{if(d.ph==='open')e.textContent=mmss(Math.ceil((r.closes_at-now())/1000))});
    q('[data-hg-total]').forEach(e=>e.textContent=fmt(T));
    q('[data-hg-votes]').forEach(e=>e.textContent=T);
    q('[data-hg-bets]').forEach(e=>e.textContent=r.bets);
    r.horses.forEach(h=>{
      q(`[data-hg-pool="${h.i}"]`).forEach(e=>e.textContent=fmt(p[h.i]));
      q(`[data-hg-count="${h.i}"]`).forEach(e=>e.textContent=r.counts[h.i]);
      q(`[data-hg-share="${h.i}"]`).forEach(e=>e.style.width=(T?p[h.i]/T*100:0)+'%');
      q(`[data-hg-mult="${h.i}"]`).forEach(e=>e.textContent=T&&p[h.i]?'×'+fmt1(T/p[h.i]):'—');
    });
    const ml=document.getElementById('hg-mylive');if(ml&&r.mine)ml.textContent=fmt(p[r.mine.horse]?r.mine.amount*T/p[r.mine.horse]:r.mine.amount);
    if(d.ph==='open'&&M.role==='student')updateStake();
  }
}
function updateStake(){
  const btn=document.getElementById('hg-sb-btn');if(!btn||!M.st.round)return;
  const r=M.st.round,m=maxStake();
  M.stake=Math.max(1,Math.min(m,M.stake||1));
  const rg=document.getElementById('hg-range');if(rg&&+rg.value!==M.stake)rg.value=M.stake;
  M.root.querySelectorAll('.hg-stake').forEach(c=>c.setAttribute('aria-pressed',+c.dataset.q===M.stake));
  M.root.querySelectorAll('.hg-hcard').forEach(c=>{});
  const set=(id,t,html)=>{const e=document.getElementById(id);if(e)html?e.innerHTML=t:e.textContent=t};
  if(M.pick==null){
    set('hg-sb-label','Elige un caballo para ver cuánto podrías ganar');set('hg-sb-pay','');set('hg-sb-ev','');
    btn.disabled=true;btn.textContent='Elige un caballo';return;
  }
  const h=r.horses[M.pick],p=r.pools.slice(),T0=sum(p),s=M.stake;
  const pay=s*(T0+s)/(p[h.i]+s);
  const P=p.slice();P[h.i]+=s;const T=T0+s;
  let ev=h.prob*(s*T/P[h.i]);
  r.horses.forEach(x=>{if(x.i!==h.i&&P[x.i]===0)ev+=x.prob*s});
  ev-=s;
  set('hg-sb-label','Si gana '+h.name+' recibirías');
  set('hg-sb-pay','≈ '+fmt(pay)+' pts');
  set('hg-sb-ev',`Valor esperado: <span class="${ev>=0?'hg-pos':'hg-neg'}">${ev>=0?'+':'−'}${fmt1(Math.abs(ev))} pts</span> <span class="hg-muted">(${pct(h.prob)} % de ganar ${fmt(pay)})</span>`,true);
  btn.disabled=M.busy;btn.textContent='Confirmar predicción · '+s+' pts';
}

/* ---------- Animación de la carrera (sincronizada con la hora del servidor) ---------- */
function anim(){
  const m=M;if(!m)return;
  const d=derive();
  if(d.ph==='countdown'){m.raf=requestAnimationFrame(anim);refresh();return}
  if(d.ph!=='race'){refresh();return}
  const rc=d.race,F=rc.frames,st=Math.max(0,d.t/STEP_MS);
  const s0=Math.min(Math.floor(st),F.length-1),s1=Math.min(s0+1,F.length-1),fr=Math.min(1,st-s0);
  const pos=F[s0].map((p,i)=>p+(F[s1][i]-p)*fr);
  const q=s=>m.root.querySelectorAll(s);
  q('.hg-horse[data-h]').forEach(el=>{
    const i=+el.dataset.h,p=pos[i]/DIST;
    el.style.left=`calc(${p*100}% - ${p} * var(--hw))`;
    if(st>=rc.fin[i])el.classList.add('done');
  });
  rc.order.forEach((h,k)=>{if(st>=rc.fin[h])q(`.hg-rank[data-h="${h}"]`).forEach(e=>{e.classList.add('show');if(k===0)e.classList.add('first')})});
  const maxP=Math.max(...pos);
  q('[data-hg-prog]').forEach(e=>e.style.width=Math.min(100,maxP/DIST*100)+'%');
  q('[data-hg-progtxt]').forEach(e=>e.textContent=Math.min(100,Math.round(maxP/DIST*100))+' %');
  const mine=d.r.mine;
  if(mine){const rank=pos.map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p).findIndex(o=>o.i===mine.horse)+1;q('[data-hg-myrank]').forEach(e=>e.textContent='Va '+rank+'.º')}
  let changed=false;while(rc.shown<rc.events.length&&rc.events[rc.shown].step<=st){rc.shown++;changed=true}
  if(changed||!rc._painted){rc._painted=true;q('[data-hg-feed]').forEach(e=>e.innerHTML=feedHTML(d,+e.dataset.hgFeed))}
  m.raf=requestAnimationFrame(anim);
}

/* ---------- Puntos: refrescar la cabecera del aula del alumno ---------- */
function syncPoints(d){
  if(!M.st||M.st.my_points==null)return;
  if(d.r.mine&&!isVotes(d.r))M.dirty=true;
  const p=M.st.my_points;
  try{
    const c=state.myClasses.find(x=>x.id===M.classId);
    if(c&&c.points!==p){c.points=p;const b=document.querySelector('.page-head .points-badge');if(b)b.outerHTML=pointsBadgeHTML(p)}
  }catch(e){}
}

/* ---------- Acciones ---------- */
async function rpc(name,args){
  const{error}=await sb.rpc(name,args);
  if(error){say(error.message);return false}
  M&&(M.dirty=true);
  return true;
}
async function act(a,x,y){
  if(!M)return;
  const r=M.st&&M.st.round;
  switch(a){
    case 'retry':poll();break;
    case 'play':M.view='game';refresh();break;
    case 'list':M.view='list';refresh();break;
    case 'pick':if(M.st.round&&M.st.round.status==='open'&&!M.st.round.mine){M.pick=x;render(derive())}break;
    case 'stake':M.stake=Math.round(+x);updateStake();break;
    case 'bet':{
      if(M.busy||M.pick==null)break;
      M.busy=true;updateStake();
      const V=isVotes(r);
      const ok=await rpc('horse_place_bet',{p_round:r.id,p_horse:M.pick,p_amount:V?1:M.stake});
      if(!M)return;
      M.busy=false;if(ok)say(V?'Voto enviado':'Predicción enviada');
      await poll();break;
    }
    case 'cfg':M.cfg[x]=x==='mode'?y:+y;M.key='';refresh();break;
    case 'toggle':{
      const on=M.st.enabled;
      if(on&&r&&r.status==='open'&&!confirm('Hay una ronda abierta. Si desactivas el minijuego se cancelará y se devolverán los puntos. ¿Continuar?'))break;
      if(await rpc('set_minigame',{p_class:M.classId,p_game:'horses',p_enabled:!on}))say(on?'Minijuego desactivado':'Minijuego activado para el aula');
      await poll();break;
    }
    case 'open':{
      if(M.busy)break;
      M.busy=true;M.key='';refresh();
      await new Promise(r=>setTimeout(r,30));            // deja pintar "Preparando…" antes del cálculo
      const horses=genHorses();
      await rpc('horse_open_round',{p_class:M.classId,p_seconds:M.cfg.time,p_cap:M.cfg.cap,p_horses:horses,p_mode:M.cfg.mode});
      if(!M)return;
      M.busy=false;M.key='';await poll();break;
    }
    case 'extend':if(r&&await rpc('horse_extend_round',{p_round:r.id,p_seconds:15}))await poll();break;
    case 'cancel':
      if(r&&confirm('¿Cancelar la ronda? Se devolverán todos los puntos apostados.')&&await rpc('horse_cancel_round',{p_round:r.id}))await poll();
      break;
    case 'launch':launch();break;
  }
}
async function launch(){
  const r=M.st&&M.st.round;
  if(!r||r.status!=='open'||M.launching)return;
  M.launching=r.id;
  const seed=(Date.now()^Math.floor(R()*1e9))>>>0;
  const sim=simulate(r.horses.map(h=>h.str),mulberry32(seed),false);
  const order=r.horses.map(h=>h.i).sort((a,b)=>sim.fin[a]-sim.fin[b]);
  const ok=await rpc('horse_start_race',{p_round:r.id,p_seed:seed,p_order:order});
  if(!M)return;
  if(!ok){M.launching=null;M.launchFailed=r.id}       // si falló, solo reintento manual
  M.key='';await poll();
}

window.HG={mount,unmount,act,takeDirty(){const d=!!(M&&M.dirty);if(M)M.dirty=false;return d}};
})();
