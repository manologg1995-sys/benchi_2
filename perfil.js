/* Minijuegos de Benchi · "Perfil Perfecto" (puzle de deducción para toda la clase).
   El profesor genera un caso (tema + dificultad) y lo lanza: todo el alumnado resuelve la misma cuadrícula
   con las pistas, cada uno en su dispositivo. Cada colocación se comprueba en el servidor (tienes 2 vidas);
   quien termina gana puntos y nunca se quitan. La solución no sale del servidor hasta que el profesor cierra el caso.
   Todo lo que toca puntos pasa por funciones de Supabase (supabase/perfil.sql).
   Los temas viven en perfil-temas.js (window.PP_THEMES).
   Uso: PP.mount('teacher'|'student', classId, el, {onBack}). */
(function(){
'use strict';

const NAME='Perfil Perfecto';
const POLL_MS=2000;
const LIVES=2;
const ALL=['same','not','at','notAt','next','adj','before','edge'];
const LEVELS={
  facil:{t:'Fácil',n:3,k:3,types:['same','at','next']},
  medio:{t:'Medio',n:4,k:3,types:['same','at','next','adj','not']},
  dificil:{t:'Difícil',n:4,k:4,types:ALL},
  experto:{t:'Experto',n:5,k:4,types:ALL}
};
// Puntos: base (la elige el profesor) + podio (1.º +3, 2.º +2, 3.º +1) + 1 si no fallas. Debe coincidir con pp_place.
const PODIUM=[3,2,1];

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
const pts=n=>`${n} ${n===1?'punto':'puntos'}`;
const R=Math.random;
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

/* ===================================================== MOTOR ===================================================== */
/* Un caso tiene k categorías de n elementos. Cada categoría es una permutación: pos[c][i] = casilla (0..n-1) del elemento i. */
const permCache={};
function perms(n){
  if(permCache[n])return permCache[n];
  const out=[];
  (function rec(p,used){if(p.length===n){out.push(p);return}for(let i=0;i<n;i++)if(!(used>>i&1))rec(p.concat(i),used|1<<i)})([],0);
  return permCache[n]=out;
}
function holds(cl,pos,n){
  const a=pos[cl.a[0]][cl.a[1]],b=cl.b?pos[cl.b[0]][cl.b[1]]:0;
  switch(cl.t){
    case 'same':return a===b;
    case 'not':return a!==b;
    case 'at':return a===cl.s;
    case 'notAt':return a!==cl.s;
    case 'next':return b===a+1;
    case 'adj':return Math.abs(a-b)===1;
    case 'before':return a<b;
    case 'edge':return a===0||a===n-1;
  }
  return false;
}
// Cuenta soluciones (se detiene en 2). Si se pasa del límite de nodos devuelve 2: «no demostrado único».
function solveCount(n,k,clues,cap){
  const P=perms(n),by=Array.from({length:k},()=>[]),pos=Array(k);
  clues.forEach(c=>by[Math.max(c.a[0],c.b?c.b[0]:0)].push(c));
  let cnt=0,nodes=0;
  (function dfs(c){
    if(c===k){cnt++;return}
    for(const p of P){
      if(++nodes>cap||cnt>=2)return;
      pos[c]=p;
      if(by[c].every(cl=>holds(cl,pos,n)))dfs(c+1);
      if(cnt>=2)return;
    }
  })(0);
  return nodes>cap?2:cnt;
}
function candidates(pos,n,k,types){
  const refs=[];for(let c=0;c<k;c++)for(let i=0;i<n;i++)refs.push([c,i]);
  const at=r=>pos[r[0]][r[1]],out=[],want=t=>types.includes(t);
  for(const a of refs){
    if(want('at'))out.push({t:'at',a,s:at(a)});
    if(want('notAt'))for(let s=0;s<n;s++)if(s!==at(a))out.push({t:'notAt',a,s});
    if(want('edge')&&(at(a)===0||at(a)===n-1))out.push({t:'edge',a});
    for(const b of refs){
      if(a===b||(a[0]===b[0]&&a[1]===b[1]))continue;
      const cross=a[0]!==b[0],lt=a[0]<b[0]||(a[0]===b[0]&&a[1]<b[1]);
      if(cross&&lt){
        if(want('same')&&at(a)===at(b))out.push({t:'same',a,b});
        if(want('not')&&at(a)!==at(b))out.push({t:'not',a,b});
      }
      if(lt&&want('adj')&&Math.abs(at(a)-at(b))===1)out.push({t:'adj',a,b});
      if(want('next')&&at(b)===at(a)+1)out.push({t:'next',a,b});
      if(want('before')&&at(a)<at(b))out.push({t:'before',a,b});
    }
  }
  return out;
}
const WEIGHT={same:1,at:1.7,next:.9,adj:1.2,not:1.9,notAt:1.9,before:1.4,edge:1.5};
function genClues(pos,n,k,types){
  const cand=candidates(pos,n,k,types).map(c=>({c,w:R()*WEIGHT[c.t]})).sort((x,y)=>x.w-y.w).map(x=>x.c);
  let clues=[],ok=false;
  for(const cl of cand){
    clues.push(cl);
    if(clues.length>=n*(k-1)&&clues.length%2===0&&solveCount(n,k,clues,60000)===1){ok=true;break}
  }
  if(!ok&&solveCount(n,k,clues,400000)===1)ok=true;
  if(!ok)return null;
  // Quitar las pistas que sobran (siempre se conserva una solución única)
  for(const cl of shuffle(clues)){
    const rest=clues.filter(x=>x!==cl);
    if(rest.length&&solveCount(n,k,rest,60000)===1)clues=rest;
  }
  return clues;
}
function makePuzzle(theme,lvKey){
  const L=LEVELS[lvKey];
  if(!L||!theme||theme.categories.length<L.k)return null;
  for(let tries=0;tries<30;tries++){
    const cats=shuffle(theme.categories).slice(0,L.k).map(c=>({key:c.key,label:c.label,icon:c.icon,
      items:shuffle(c.items).slice(0,L.n).map(([n,e])=>({n,e}))}));
    const pos=cats.map(()=>shuffle([...Array(L.n).keys()]));
    const clues=genClues(pos,L.n,L.k,L.types);
    if(!clues)continue;
    // La solución viaja como sol[categoría][casilla] = elemento (lo que guarda el servidor)
    const sol=pos.map(p=>{const s=Array(L.n);p.forEach((slot,i)=>s[slot]=i);return s});
    return{puzzle:{n:L.n,k:L.k,cats,clues:clues.map(orderClue)},solution:sol};
  }
  return null;
}
const orderClue=c=>c;   // las pistas ya vienen en su forma final; punto único por si se quisiera reordenar

function clueHTML(p,cl){
  const nm=r=>{const it=p.cats[r[0]].items[r[1]];return `<b>${it.e} ${esc(it.n)}</b>`};
  const A=nm(cl.a),B=cl.b?nm(cl.b):'';
  switch(cl.t){
    case 'same':return `${A} y ${B} van juntos.`;
    case 'not':return `${A} y ${B} <u>no</u> van juntos.`;
    case 'at':return `${A} está en la posición <b>${cl.s+1}</b>.`;
    case 'notAt':return `${A} <u>no</u> está en la posición <b>${cl.s+1}</b>.`;
    case 'next':return `${A} está <b>justo a la izquierda</b> de ${B}.`;
    case 'adj':return `${A} y ${B} están <b>uno al lado del otro</b>.`;
    case 'before':return `${A} está <b>más a la izquierda</b> que ${B}.`;
    case 'edge':return `${A} está en <b>un extremo</b>.`;
  }
  return '';
}

/* ===================================================== ESTADO ===================================================== */
let M=null;

function mount(role,classId,root,opts){
  unmount();
  opts=opts||{};
  const themes=window.PP_THEMES||[];
  M={role,classId,root,st:null,err:null,key:'',v:0,busy:false,onBack:opts.onBack||null,dirty:false,
     sel:null,mode:'place',crossed:{},struck:{},localRound:null,msg:null,polling:false,
     draft:null,gen:false,cfg:{theme:themes[0]?themes[0].id:'',level:'medio',value:2}};
  root.classList.add('hg','pp');
  root.innerHTML='<div class="hg-card hg-muted">Cargando…</div>';
  M.pollT=setInterval(poll,POLL_MS);
  M.tickT=setInterval(()=>{if(M&&!document.body.contains(M.root))unmount()},1000);
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
  try{
    const{data,error}=await sb.rpc('pp_state',{p_class:m.classId});
    if(M!==m)return;
    if(error)throw error;
    m.st=data;m.err=null;
  }catch(e){
    if(M!==m)return;
    m.err=e.message||String(e);
  }finally{m.polling=false}
  refresh();
}
async function rpc(name,args){
  const{data,error}=await sb.rpc(name,args);
  if(error){say(error.message);return{ok:false}}
  if(M)M.dirty=true;
  return{ok:true,data};
}
function derive(){
  const st=M.st;
  if(!st)return{ph:'loading'};
  if(!st.enabled)return{ph:'off'};
  const r=st.round;
  if(!r||r.status==='cancelled')return{ph:'lobby',r};
  return{ph:r.status,r,mine:st.mine};
}
/* Marcas personales (tachar pistas y descartar elementos) por caso; solo en este navegador */
function localKey(id){return 'benchi-pp:'+id}
function syncLocal(r){
  if(!r||M.localRound===r.id)return;
  M.localRound=r.id;M.sel=null;M.mode='place';M.msg=null;
  try{const o=JSON.parse(localStorage.getItem(localKey(r.id))||'{}');M.crossed=o.crossed||{};M.struck=o.struck||{}}catch(e){M.crossed={};M.struck={}}
}
function saveLocal(){
  try{localStorage.setItem(localKey(M.localRound),JSON.stringify({crossed:M.crossed,struck:M.struck}))}catch(e){}
}
function refresh(){
  if(!M)return;
  if(!M.st){if(M.err)M.root.innerHTML=`<div class="hg-card"><div class="hg-notice">${esc(M.err)}</div><button class="hg-btn ghost" onclick="PP.act('retry')">Reintentar</button></div>`;return}
  const d=derive();
  if(d.r)syncLocal(d.r);
  const key=JSON.stringify([d.ph,d.r&&[d.r.id,d.r.status],M.st.mine,M.st.players,M.st.finished,M.st.enabled,M.st.members,
    M.v,M.busy,M.role==='teacher'?[M.cfg,M.gen,M.draft&&M.draft.id]:0]);
  if(key===M.key)return;
  M.key=key;
  M.root.innerHTML=M.role==='teacher'?teacherHTML(d):studentHTML(d);
  tabAlert(d);
}
function tabAlert(d){
  if(M.role!=='student')return;
  const el=document.querySelector('.teacher-tab[data-tab="minigames"]');
  if(el)el.classList.toggle('hg-tab-live',d.ph==='open'&&d.mine&&d.mine.status==='playing'&&!Object.keys(d.mine.cells||{}).length);
}
const bump=()=>{M.v++;M.key='';refresh()};

/* ===================================================== PIEZAS COMUNES ===================================================== */
const onChip=t=>`<span class="hg-chip green hg-live"><span class="hg-dot"></span>${t}</span>`;
const hearts=n=>Array.from({length:LIVES},(_,i)=>`<span class="pp-heart ${i<n?'on':''}">${i<n?'❤️':'🖤'}</span>`).join('');
const lvName=k=>(LEVELS[k]||{}).t||k;
const placedCount=cells=>Object.keys(cells||{}).length;

/* Cuadrícula: filas = categorías, columnas = posiciones. cellFn(c,s) → {cls,html,click} */
function gridHTML(p,cellFn){
  let h=`<div class="pp-grid" style="--n:${p.n}"><div class="pp-corner"></div>`;
  for(let s=0;s<p.n;s++)h+=`<div class="pp-colh">${s+1}</div>`;
  p.cats.forEach((c,ci)=>{
    h+=`<div class="pp-rowh"><span>${c.icon||''}</span><b>${esc(c.label)}</b></div>`;
    for(let s=0;s<p.n;s++){
      const x=cellFn(ci,s);
      h+=x.click?`<button type="button" class="pp-cell ${x.cls||''}" onclick="${x.click}" aria-label="${esc(c.label)}, posición ${s+1}">${x.html}</button>`
        :`<div class="pp-cell ${x.cls||''}">${x.html}</div>`;
    }
  });
  return h+'</div>';
}
const itemHTML=it=>`<span class="e">${it.e}</span><span class="t">${esc(it.n)}</span>`;
function cluesHTML(p,interactive){
  return `<ol class="pp-clues">${p.clues.map((cl,i)=>`<li class="${interactive&&M.struck[i]?'x':''}" ${interactive?`onclick="PP.act('strike',${i})" tabindex="0" role="button" aria-pressed="${!!M.struck[i]}"`:''}><span>${clueHTML(p,cl)}</span></li>`).join('')}</ol>`;
}
function solutionGrid(r){
  const p=r.puzzle;
  return gridHTML(p,(c,s)=>({cls:'done',html:itemHTML(p.cats[c].items[r.solution[c][s]])}));
}
const rulesCard=()=>`<div class="hg-card"><div class="hg-eyebrow">Cómo se juega</div>
  <div class="cr-mini"><span>🔎</span><div>Lee las <b>pistas</b> y averigua qué elementos van en cada <b>posición</b> (de izquierda a derecha).</div></div>
  <div class="cr-mini"><span>👆</span><div>Toca una casilla, elige el elemento y se comprueba al momento.</div></div>
  <div class="cr-mini"><span>❤️</span><div>Tienes <b>${LIVES} vidas</b>: dos fallos y te quedas sin caso. Piensa antes de elegir.</div></div>
  <div class="cr-mini"><span>🏆</span><div>Ganas puntos al resolverlo, y más si eres de los primeros o no fallas. <b>Nunca pierdes puntos.</b></div></div></div>`;
const heroHTML=(title,sub)=>`<div class="cr-hero"><div class="pp-lens" aria-hidden="true">🕵️</div><div><h2 class="hg-title">${title}</h2>${sub?`<div class="cr-hero-sub">${sub}</div>`:''}</div></div>`;

/* ===================================================== ALUMNO ===================================================== */
function studentHTML(d){
  const back=M.onBack?`<button class="hg-btn ghost small" onclick="PP.act('back')">← Minijuegos</button>`:'<span></span>';
  const lives=d.mine&&d.ph!=='off'&&d.ph!=='lobby'?`<div class="hg-balance pp-lives" aria-label="${d.mine.lives} vidas">${hearts(d.mine.lives)}</div>`:'';
  const head=`<div class="hg-between">${back}${lives}</div>`;
  let body;
  if(d.ph==='off')body=`<div class="hg-card"><h3>${NAME}</h3><div class="hg-muted">Tu profesor no tiene activado este minijuego ahora mismo.</div></div>`;
  else if(d.ph==='lobby')body=`${heroHTML(NAME,'Resuelve el caso con las pistas.')}${rulesCard()}
    ${d.r&&d.r.status==='cancelled'?'<div class="hg-notice">El último caso se canceló.</div>':''}
    <div class="hg-card" style="align-items:center;text-align:center">${onChip('Esperando al profesor')}<div class="hg-muted">En cuanto lance un caso aparecerá aquí.</div></div>`;
  else body=caseStudent(d);
  return `<div class="hg-phone">${head}${body}</div>`;
}
function caseStudent(d){
  const r=d.r,p=r.puzzle,closed=r.status==='closed';
  const mine=d.mine||{lives:LIVES,cells:{},mistakes:0,status:'playing'};
  const cells=mine.cells||{},total=p.n*p.k,done=placedCount(cells);
  const playing=!closed&&mine.status==='playing';
  let banner='';
  if(mine.status==='done')banner=`<div class="hg-banner win"><div><h2>¡Caso resuelto!</h2><div style="opacity:.9">${mine.rank?`Has sido el ${mine.rank}.º en resolverlo.`:''}${mine.mistakes?'':' Sin ningún fallo.'}</div></div><div class="big">+${pts(mine.points||0)}</div></div>`;
  else if(mine.status==='out')banner=`<div class="hg-banner lose"><div><h2>Te has quedado sin vidas</h2><div class="hg-muted">Esta vez no ha podido ser. Cuando el profesor cierre el caso verás la solución.</div></div></div>`;
  else if(closed)banner=`<div class="hg-banner lose"><div><h2>Caso cerrado</h2><div class="hg-muted">${done?'Te quedaste a medias.':'No llegaste a jugar este caso.'} Aquí tienes la solución.</div></div></div>`;
  const grid=gridHTML(p,(c,s)=>{
    const k=c+'-'+s,it=cells[k]!=null?p.cats[c].items[cells[k]]:null;
    if(it)return{cls:'done',html:itemHTML(it)};
    if(closed&&r.solution)return{cls:'reveal',html:itemHTML(p.cats[c].items[r.solution[c][s]])};
    if(!playing)return{cls:'',html:''};
    const sel=M.sel&&M.sel[0]===c&&M.sel[1]===s;
    return{cls:sel?'sel':'',html:'<span class="q">?</span>',click:`PP.act('cell',${c},${s})`};
  });
  return `<div class="hg-card pp-case"><div class="hg-between"><div class="hg-row"><span class="pp-theme">${esc(r.emoji||'🕵️')}</span><div><h3 style="font-size:20px">${esc(r.title)}</h3><div class="hg-meta">Nivel ${esc(lvName(r.level))} · vale ${pts(r.value)} base</div></div></div>
      ${closed?'<span class="hg-chip tint">Cerrado</span>':onChip('En juego')}</div>
    <div class="hg-bar" style="height:8px" aria-hidden="true"><div style="width:${done/total*100}%;background:var(--hg-grad)"></div></div>
    <div class="hg-meta">${done} de ${total} casillas</div></div>
  ${banner}
  <div class="hg-card"><div class="hg-between"><div class="hg-eyebrow">Pistas</div><div class="hg-meta">Toca una para tacharla</div></div>${cluesHTML(p,true)}</div>
  <div class="hg-card"><div class="hg-eyebrow">Posiciones, de izquierda a derecha</div>${grid}${playing?pickerHTML(d):''}</div>
  ${finishedCard()}`;
}
function pickerHTML(d){
  const p=d.r.puzzle,cells=(d.mine&&d.mine.cells)||{};
  const msg=M.msg?`<div class="pp-msg ${M.msg.bad?'bad':''}" role="status">${esc(M.msg.t)}</div>`:'';
  if(!M.sel)return `${msg}<div class="hg-meta" style="text-align:center">Toca una casilla para elegir qué va en ella.</div>`;
  const[c,s]=M.sel,cat=p.cats[c],key=c+'-'+s;
  const used=new Set(Object.keys(cells).filter(k=>k.split('-')[0]==c).map(k=>cells[k]));
  const cross=M.crossed[key]||[];
  const chips=cat.items.map((it,i)=>used.has(i)?'':`<button type="button" class="pp-chip ${cross.includes(i)?'x':''}" onclick="PP.act('item',${i})" ${M.busy?'disabled':''}>${itemHTML(it)}</button>`).join('');
  return `${msg}<div class="pp-pick"><div class="hg-between"><b>${esc(cat.icon||'')} ${esc(cat.label)} · posición ${s+1}</b>
    <div class="hg-seg" role="group" aria-label="Qué hace al tocar un elemento">
      <button type="button" aria-pressed="${M.mode==='place'}" onclick="PP.act('mode','place')">Elegir</button>
      <button type="button" aria-pressed="${M.mode==='cross'}" onclick="PP.act('mode','cross')">Descartar</button></div></div>
    <div class="pp-chips">${chips}</div>
    <div class="hg-meta">${M.mode==='cross'?'Modo descartar: marca los elementos que ya sabes que no van aquí (solo tú lo ves).':'Cuidado: si eliges mal, pierdes una vida.'}</div></div>`;
}
function finishedCard(){
  const f=M.st.finished||[];
  if(!f.length)return '';
  return `<div class="hg-card"><div class="hg-eyebrow">Han resuelto el caso</div><div class="hg-plist">${f.map(x=>`<div class="hg-prow"><b style="width:18px">${x.rank}</b><div class="nm">${esc(x.name)}</div><b class="hg-pos">+${x.points}</b></div>`).join('')}</div></div>`;
}

/* ===================================================== PROFESOR ===================================================== */
function teacherHTML(d){
  const on=M.st.enabled;
  const head=`<div class="hg-card"><div class="hg-between"><div class="hg-row" style="gap:14px"><div class="hg-badge" style="width:48px;height:48px;background:var(--hg-grad);color:#fff;font-size:24px">🕵️</div>
    <div><h3 style="font-size:20px">${NAME}</h3><div class="hg-muted" style="font-size:14px">Un caso de deducción para toda la clase: mismas pistas, cada alumno en su dispositivo.</div></div></div>
    <div class="hg-row"><span class="hg-chip ${on?'green':'white'}">${on?'Activado':'Desactivado'}</span><button type="button" class="hg-switch ${on?'on':''}" role="switch" aria-checked="${on}" aria-label="Activar ${NAME} para los alumnos" onclick="PP.act('toggle')"></button></div></div></div>`;
  if(!on)return `<div class="hg-col">${head}<div class="hg-card hg-muted">Los alumnos no ven este minijuego. Actívalo para que aparezca en su pestaña «Minijuegos».</div></div>`;
  const live=d.ph==='open'||d.ph==='closed';
  return `<div class="hg-col">${head}${live?liveTeacher(d):''}${d.ph==='open'?'':setupTeacher()}</div>`;
}
function setupTeacher(){
  const themes=window.PP_THEMES||[];
  if(!themes.length)return `<div class="hg-card hg-muted">Todavía no hay temas. Añádelos en <code>perfil-temas.js</code>.</div>`;
  const c=M.cfg;
  const seg=(items,cur,k)=>`<div class="hg-seg" role="group">${items.map(([v,t])=>`<button type="button" aria-pressed="${String(cur)===String(v)}" onclick="PP.act('cfg','${k}','${v}')">${t}</button>`).join('')}</div>`;
  const th=themes.find(t=>t.id===c.theme)||themes[0];
  const L=LEVELS[c.level];
  let h=`<div class="hg-card"><h3 style="font-size:18px">Nuevo caso</h3>
    <div class="hg-kv"><span class="hg-muted">Tema</span><select onchange="PP.act('cfg','theme',this.value)">${themes.map(t=>`<option value="${esc(t.id)}" ${t.id===c.theme?'selected':''}>${esc(t.emoji)} ${esc(t.title)}</option>`).join('')}</select></div>
    ${th.desc?`<div class="hg-meta">${esc(th.desc)}${th.rec?` Nivel recomendado: <b>${esc(lvName(th.rec))}</b>.`:''}</div>`:''}
    <div class="hg-kv" style="flex-direction:column;align-items:stretch"><span class="hg-muted">Dificultad</span>${seg(Object.entries(LEVELS).map(([k,v])=>[k,v.t]),c.level,'level')}
      <div class="hg-meta">${L.n} posiciones y ${L.k} categorías (${L.n*L.k} casillas).</div></div>
    <div class="hg-kv"><span class="hg-muted">Puntos base</span><select onchange="PP.act('cfg','value',this.value)">${[1,2,3,4,5].map(v=>`<option value="${v}" ${v===+c.value?'selected':''}>${pts(v)}</option>`).join('')}</select></div>
    <div class="hg-meta" style="padding:10px 12px;border-radius:12px;background:#f6f7fb">Puntos por alumno: base + podio (1.º +${PODIUM[0]}, 2.º +${PODIUM[1]}, 3.º +${PODIUM[2]}) + 1 si no falla. Con base ${c.value}: entre ${c.value} y ${+c.value+PODIUM[0]+1}. Nunca se quitan puntos.</div>
    <div><button class="hg-btn primary" ${M.gen?'disabled':''} onclick="PP.act('gen')">${M.gen?'Generando…':M.draft?'Generar otro caso':'Generar caso'}</button></div></div>`;
  if(M.draft){
    const dr=M.draft,p=dr.puzzle;
    h+=`<div class="hg-card"><div class="hg-between"><h3 style="font-size:18px">${esc(dr.title)}</h3><span class="hg-chip tint">Vista previa · ${esc(lvName(dr.level))}</span></div>
      <div class="hg-eyebrow">Pistas (${p.clues.length})</div>${cluesHTML(p,false)}
      <details><summary class="hg-meta" style="cursor:pointer">Ver la solución (solo tú)</summary><div style="margin-top:10px">${solutionGrid({puzzle:p,solution:dr.solution})}</div></details>
      <div class="hg-row hg-wrap"><button class="hg-btn primary" ${M.busy?'disabled':''} onclick="PP.act('launch')">${M.busy?'Lanzando…':'Lanzar a la clase'}</button></div></div>`;
  }
  return h;
}
function liveTeacher(d){
  const r=d.r,p=r.puzzle,closed=d.ph==='closed',pl=M.st.players||[],total=p.n*p.k;
  const doneN=pl.filter(x=>x.status==='done').length,outN=pl.filter(x=>x.status==='out').length;
  const rows=pl.slice().sort((a,b)=>(a.status==='done'?0:1)-(b.status==='done'?0:1)||(a.rank||99)-(b.rank||99)||b.cells-a.cells);
  const stat={done:'<span class="hg-chip green">Resuelto</span>',out:'<span class="hg-chip red">Sin vidas</span>',playing:'<span class="hg-chip tint">Jugando</span>'};
  return `<div class="hg-card" style="gap:16px"><div class="hg-between" style="align-items:flex-start">
      <div><div class="hg-eyebrow">${closed?'Caso cerrado':'En directo'}</div><div class="hg-bigstat" style="margin-top:8px">${esc(r.title)}</div>
        <div class="hg-muted">Nivel ${esc(lvName(r.level))} · base ${pts(r.value)}</div></div>
      <div style="text-align:right"><div class="hg-eyebrow">Resuelto</div><div class="hg-bigstat" style="margin-top:8px">${doneN} <span class="hg-muted" style="font-size:16px">de ${M.st.members}</span></div>
        <div class="hg-meta">${pl.length-doneN-outN} jugando · ${outN} sin vidas · ${Math.max(0,M.st.members-pl.length)} sin empezar</div></div></div>
    ${rows.length?`<div style="overflow-x:auto"><table class="hg-t"><thead><tr><th>Alumno</th><th>Estado</th><th class="n">Casillas</th><th class="n">Vidas</th><th class="n">Puntos</th></tr></thead><tbody>
      ${rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${stat[x.status]||''}</td><td class="n">${x.cells}/${total}</td><td class="n">${x.status==='done'||x.status==='out'?x.lives:hearts(x.lives)}</td><td class="n ${x.points?'hg-pos':''}">${x.points?'+'+x.points:'—'}</td></tr>`).join('')}</tbody></table></div>`
      :'<div class="hg-muted">Nadie ha empezado todavía.</div>'}
    <div class="hg-row hg-wrap" style="padding-top:14px;border-top:1px solid #eef0f5">
      ${closed?'<span class="hg-muted">Caso cerrado. Puedes preparar el siguiente más abajo.</span>'
        :`<button class="hg-btn primary" ${M.busy?'disabled':''} onclick="PP.act('close')">Cerrar caso y mostrar la solución</button>
          <button class="hg-btn danger" style="margin-left:auto" ${doneN?'disabled title="Ya hay alumnos que han terminado: ciérralo en lugar de cancelarlo"':''} onclick="PP.act('cancel')">Cancelar caso</button>`}</div></div>
  <div class="hg-card"><div class="hg-eyebrow">Pistas del caso</div><div class="hg-meta">Puedes proyectarlas en la pizarra.</div>${cluesHTML(p,false)}</div>
  ${closed&&r.solution?`<div class="hg-card"><div class="hg-eyebrow">Solución</div>${solutionGrid(r)}</div>`:''}`;
}

/* ===================================================== ACCIONES ===================================================== */
async function act(a,x,y){
  if(!M)return;
  const st=M.st,r=st&&st.round;
  switch(a){
    case 'retry':poll();break;
    case 'back':{const f=M.onBack,dirty=M.dirty;unmount();if(f)f(dirty);break}
    case 'strike':M.struck[x]=!M.struck[x];saveLocal();bump();break;
    case 'mode':M.mode=x;bump();break;
    case 'cell':M.sel=(M.sel&&M.sel[0]===x&&M.sel[1]===y)?null:[x,y];M.msg=null;bump();break;
    case 'item':{
      if(!r||!M.sel||M.busy)break;
      const[c,s]=M.sel,key=c+'-'+s;
      if(M.mode==='cross'){
        const arr=M.crossed[key]||(M.crossed[key]=[]),i=arr.indexOf(x);
        if(i>=0)arr.splice(i,1);else arr.push(x);
        saveLocal();bump();break;
      }
      M.busy=true;bump();
      const res=await rpc('pp_place',{p_round:r.id,p_cat:c,p_slot:s,p_item:x});
      if(!M)return;
      M.busy=false;
      if(res.ok){
        const o=res.data;
        if(o.correct){M.sel=null;M.msg=o.done?null:{t:'¡Correcto!'}}
        else M.msg={bad:true,t:o.lives>0?`No es esa. Te ${o.lives===1?'queda 1 vida':'quedan '+o.lives+' vidas'}.`:'Te has quedado sin vidas.'};
      }
      await poll();bump();break;
    }
    case 'cfg':
      M.cfg[x]=(x==='value')?+y:y;
      if(x==='theme'){const t=(window.PP_THEMES||[]).find(t=>t.id===y);if(t&&t.rec)M.cfg.level=t.rec}   // al cambiar de tema se propone su nivel
      M.draft=null;bump();break;
    case 'gen':{
      if(M.gen)break;
      const th=(window.PP_THEMES||[]).find(t=>t.id===M.cfg.theme);
      M.gen=true;bump();
      await new Promise(f=>setTimeout(f,30));          // deja pintar «Generando…» antes del cálculo
      const out=makePuzzle(th,M.cfg.level);
      if(!M)return;
      M.gen=false;
      if(!out){say('No se ha podido generar un caso con este tema y nivel. Prueba otra vez o añade más categorías al tema.');M.draft=null;bump();break}
      M.draft={id:Date.now(),title:th.title,theme:th.id,emoji:th.emoji,level:M.cfg.level,value:M.cfg.value,puzzle:out.puzzle,solution:out.solution};
      bump();break;
    }
    case 'launch':{
      const dr=M.draft;if(!dr||M.busy)break;
      M.busy=true;bump();
      const res=await rpc('pp_open_round',{p_class:M.classId,p_theme:dr.theme,p_title:dr.title,p_emoji:dr.emoji,p_level:dr.level,
        p_value:dr.value,p_puzzle:dr.puzzle,p_solution:dr.solution});
      if(!M)return;
      M.busy=false;
      if(res.ok){M.draft=null;say('Caso lanzado a la clase')}
      await poll();bump();break;
    }
    case 'close':
      if(r&&!M.busy&&confirm('¿Cerrar el caso? Se mostrará la solución a toda la clase y ya no se podrá seguir jugando.')){
        M.busy=true;bump();
        await rpc('pp_close_round',{p_round:r.id});
        if(!M)return;M.busy=false;await poll();bump();
      }
      break;
    case 'cancel':
      if(r&&!M.busy&&confirm('¿Cancelar el caso? Nadie ganará puntos con él.')){
        M.busy=true;bump();
        await rpc('pp_cancel_round',{p_round:r.id});
        if(!M)return;M.busy=false;await poll();bump();
      }
      break;
    case 'toggle':{
      const on=st.enabled;
      if(on&&r&&r.status==='open'&&!confirm('Hay un caso abierto. Si desactivas el minijuego se cerrará. ¿Continuar?'))break;
      if((await rpc('set_minigame',{p_class:M.classId,p_game:'perfil',p_enabled:!on})).ok)say(on?'Minijuego desactivado':'Minijuego activado para el aula');
      await poll();break;
    }
  }
}

window.PP={mount,unmount,act,NAME,art:()=>'<div style="font-size:64px;line-height:1">🕵️</div>',
  engine:{makePuzzle,solveCount,clueHTML,LEVELS},
  takeDirty(){const d=!!(M&&M.dirty);if(M)M.dirty=false;return d}};
})();
