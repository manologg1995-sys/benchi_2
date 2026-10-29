/* El Súper de Clase · minijuego NEAE de Benchi
   Sumar la cesta, pagar arrastrando dinero desde la cartera y dar el cambio.
   Uso: SUPER.mount(root,{onBack,storeKey,allUnlocked}) / SUPER.unmount() */
(function(){
const fmt=c=>(c/100).toFixed(2).replace('.',',')+' €';
const lab=v=>v>=100?(v/100)+'€':v+'c';
const say$=c=>c<100?c+' céntimos':fmt(c);
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const sum=a=>a.reduce((s,x)=>s+x.v,0);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let uid=0;const mk=v=>({id:++uid,v});
const PER_LEVEL=3; // compras para desbloquear el siguiente nivel

const PRODUCTS=[["🍞","Pan"],["🥛","Leche"],["🍎","Manzanas"],["🧀","Queso"],["🥚","Huevos"],["🍌","Plátanos"],["🍅","Tomates"],["🧃","Zumo"],["🍪","Galletas"],["🧻","Papel"],["🍝","Pasta"],["🥫","Tomate frito"],["🍫","Chocolate"],["🧼","Jabón"],["🍚","Arroz"],["🥖","Barra"],["🥕","Zanahorias"],["🍗","Pollo"],["🐟","Pescado"],["🥤","Refresco"],["🧈","Mantequilla"],["🍦","Helado"],["🥔","Patatas"],["🧴","Champú"]];
const ALL_TILL=[1,2,5,10,20,50,100,200,500,1000,2000,5000];
/* n: productos · step: múltiplo del precio en céntimos · p: rango de precio en "steps" · q: unidades máx. */
const LEVELS=[
 {t:'Primeros euros',d:'2 productos. Precios en euros enteros.',n:[2,2],step:100,p:[1,5],q:1,loose:[100,200,100,200],till:[100,200,500,1000]},
 {t:'Tres productos',d:'3 productos. Euros enteros.',n:[3,3],step:100,p:[1,6],q:1,loose:[100,200,100,200,200],till:[100,200,500,1000,2000]},
 {t:'Medio euro',d:'Aparecen precios con 50 céntimos.',n:[2,3],step:50,p:[1,10],q:1,loose:[50,100,200,50,100],till:[50,100,200,500,1000,2000]},
 {t:'Céntimos',d:'Precios con 10 y 20 céntimos.',n:[2,3],step:10,p:[5,39],q:1,loose:[10,20,50,100,200,20],till:[10,20,50,100,200,500,1000,2000]},
 {t:'Cesta mediana',d:'Hasta 4 productos con céntimos.',n:[3,4],step:10,p:[5,79],q:1,loose:[10,20,50,100,200,50,20],till:[10,20,50,100,200,500,1000,2000]},
 {t:'Varias unidades',d:'Algunos productos vienen de 2 o 3 en 2 o 3. ¡Multiplica!',n:[2,3],step:10,p:[5,29],q:3,loose:[10,20,50,100,200,50],till:[10,20,50,100,200,500,1000,2000]},
 {t:'Céntimos sueltos',d:'Precios con 5 céntimos. Monedas pequeñas.',n:[3,3],step:5,p:[10,80],q:1,loose:[5,10,20,50,100,5,20],till:[5,10,20,50,100,200,500,1000,2000]},
 {t:'Gran compra',d:'4 o 5 productos, unidades y billetes grandes.',n:[4,5],step:5,p:[20,160],q:2,loose:[5,10,20,50,100,200,50,10],till:ALL_TILL}
];

let S=null;

/* ---------- progreso (por alumno y navegador) ---------- */
function loadProg(){try{const p=JSON.parse(localStorage.getItem(S.key)||'{}');return Array.isArray(p.done)?p:{done:[]}}catch(e){return{done:[]}}}
function saveProg(){try{localStorage.setItem(S.key,JSON.stringify(S.prog))}catch(e){}}
const doneIn=i=>S.prog.done[i]||0;
const unlocked=i=>S.all||i===0||doneIn(i-1)>=PER_LEVEL;

/* ---------- sonido y voz ---------- */
let ac=null;
function tone(f,d=.08,t='triangle',g=.08){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),v=ac.createGain();o.type=t;o.frequency.value=f;v.gain.value=g;o.connect(v);v.connect(ac.destination);const n=ac.currentTime;v.gain.exponentialRampToValueAtTime(.0001,n+d);o.start(n);o.stop(n+d)}catch(e){}}
const clink=()=>{tone(1800,.06);setTimeout(()=>tone(2400,.08),40)};
const yay=()=>[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.18,'sine',.1),i*110));
const nope=()=>tone(180,.2,'sawtooth',.05);
function speak(t){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t.replace(/€/g,' euros').replace(/ x /g,' por '));u.lang='es-ES';u.rate=.9;speechSynthesis.speak(u)}catch(e){}}

/* ---------- nueva compra ---------- */
function newRound(lv){
  if(lv!=null)S.level=lv;
  const L=LEVELS[S.level];
  const n=rnd(L.n[0],L.n[1]);
  const pool=[...PRODUCTS].sort(()=>Math.random()-.5).slice(0,n);
  S.basket=pool.map(([ico,name],i)=>{
    const qty=L.q>1&&(i===0||Math.random()<.5)?rnd(2,L.q):1;
    return{ico,name,price:rnd(L.p[0],L.p[1])*L.step,qty};
  });
  S.total=S.basket.reduce((s,i)=>s+i.price*i.qty,0);
  const bills=[500,1000,2000,5000].filter(b=>b>=S.total);
  const W=[];
  if(bills.length)W.push(Math.random()<.3&&bills[1]?bills[1]:bills[0]);
  else{let p=0;while(p<S.total){W.push(5000);p+=5000}}
  const coins=[...L.loose].sort(()=>Math.random()-.5).slice(0,rnd(3,5));
  S.wallet=[...W,...coins].sort((a,b)=>b-a).map(mk);
  Object.assign(S,{tray:[],hand:[],change:0,paid:0,input:'',fails:0,step:1,sub:'ask',view:'game',unlockedNew:false});
  render();
}

/* ---------- utilidades UI ---------- */
const q=s=>S.root.querySelector(s);
function moneyEl(o,zone){
  const v=o.v,d=document.createElement('div');
  d.className='sp-money '+(v>=500?'sp-bill sp-b'+v:'sp-coin sp-c'+v);
  d.innerHTML='<span>'+lab(v)+'</span>';
  d.tabIndex=0;d.setAttribute('role','button');d.setAttribute('aria-label',say$(v));
  d.dataset.id=o.id;d.dataset.v=v;d.dataset.from=zone;
  return d;
}
function fillZone(el,arr,zone,emptyTxt){
  el.innerHTML='';
  if(!arr.length){el.innerHTML='<div class="sp-empty">'+emptyTxt+'</div>';return}
  arr.slice().sort((a,b)=>b.v-a.v).forEach(o=>el.appendChild(moneyEl(o,zone)));
}
function parseInput(s){if(!s)return NaN;const[e,c='']=s.split(',');return parseInt(e||'0',10)*100+parseInt((c+'00').slice(0,2),10)}
function keypad(onCheck,label='Comprobar'){
  const w=document.createElement('div');w.className='sp-pad';
  w.innerHTML=`<div class="sp-screen"></div><div class="sp-keys">${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(k=>`<button class="sp-k" data-k="${k}" aria-label="${k==='⌫'?'Borrar':k}">${k}</button>`).join('')}</div><button class="sp-go sp-check">${label}</button><div class="sp-msg"></div>`;
  const scr=w.querySelector('.sp-screen');
  const show=()=>scr.innerHTML=(S.input||'<small>escribe aquí</small>')+(S.input?' <small>€</small>':'');
  w.querySelectorAll('.sp-k').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;tone(700,.04);
    if(k==='⌫')S.input=S.input.slice(0,-1);
    else if(k===','){if(!S.input.includes(','))S.input=(S.input||'0')+','}
    else{const p=S.input.split(',');if(p[1]!==undefined&&p[1].length>=2)return;if(S.input.length<7)S.input+=k}
    show();
  });
  w.querySelector('.sp-check').onclick=()=>onCheck(parseInput(S.input),w.querySelector('.sp-msg'),scr);
  show();return w;
}
function sayBlock(t){const d=document.createElement('div');d.className='sp-say';d.innerHTML=`<button class="sp-speak" aria-label="Escuchar">🔊</button><p>${t}</p>`;d.querySelector('.sp-speak').onclick=()=>speak(d.querySelector('p').textContent);return d}
function bad(msg,scr,txt){nope();msg.className='sp-msg bad';msg.textContent=txt;if(scr){scr.classList.remove('sp-shake');void scr.offsetWidth;scr.classList.add('sp-shake')}}
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};

/* ---------- pantallas ---------- */
function render(){
  if(!S)return;
  const r=S.root;r.innerHTML='';
  const top=el('div','sp-top');
  top.innerHTML=`<h2 class="sp-title">El Súper <span>de Clase</span></h2>`;
  const hud=el('div','sp-top');
  if(S.view==='game'){
    hud.innerHTML=`<span class="sp-pill">Nivel ${S.level+1} · ${esc(LEVELS[S.level].t)}</span>`;
    const b=el('button','sp-go alt','🗺️ Niveles');b.style.fontSize='1rem';b.style.padding='8px 14px';b.onclick=()=>{S.view='levels';render()};hud.appendChild(b);
  }
  if(S.onBack){const b=el('button','sp-go alt','← Minijuegos');b.style.fontSize='1rem';b.style.padding='8px 14px';b.onclick=()=>{const f=S.onBack;unmount();f()};hud.appendChild(b)}
  top.appendChild(hud);r.appendChild(top);
  if(S.view==='levels'){renderLevels();return}
  const steps=el('div','sp-steps');
  ['Suma la compra','Paga','Recoge el cambio'].forEach((t,i)=>{const n=i+1;steps.appendChild(el('div','sp-step'+(S.step===n?' on':'')+(S.step>n?' done':''),`<b>${n}</b><span>${t}</span>`))});
  r.appendChild(steps);
  const scene=el('div','sp-scene');scene.setAttribute('aria-live','polite');r.appendChild(scene);S.scene=scene;
  const wal=el('section','sp-wallet');
  wal.innerHTML=`<div class="sp-zhead"><h3>👛 Mi cartera</h3><span class="sp-big sp-wtotal">${fmt(sum(S.wallet))}</span></div><div class="sp-zone" data-zone="wallet"></div>`;
  r.appendChild(wal);
  fillZone(wal.querySelector('.sp-zone'),S.wallet,'wallet','Cartera vacía');
  if(S.step===1)renderSum();else if(S.step===2)renderPay();else if(S.step===3)renderChange();else renderEnd();
}

function renderLevels(){
  const sc=el('div','sp-scene');
  sc.appendChild(sayBlock('Elige un nivel. Haz 3 compras para abrir el siguiente.'));
  const g=el('div','sp-levels');
  LEVELS.forEach((L,i)=>{
    const n=doneIn(i),open=unlocked(i);
    const b=el('button','sp-lv'+(n>=PER_LEVEL?' done':''),
      `<span class="n">${open?'Nivel '+(i+1):'🔒 Nivel '+(i+1)}</span><span class="t">${esc(L.t)}</span><span class="d">${esc(L.d)}</span><span class="s" aria-label="${Math.min(n,PER_LEVEL)} de ${PER_LEVEL} compras">${'⭐'.repeat(Math.min(n,PER_LEVEL))}${'☆'.repeat(PER_LEVEL-Math.min(n,PER_LEVEL))}</span>`);
    b.disabled=!open;b.onclick=()=>newRound(i);
    g.appendChild(b);
  });
  sc.appendChild(g);S.root.appendChild(sc);
}

function basketEl(){
  const b=el('div','sp-basket');
  b.innerHTML=S.basket.map(i=>`<div class="sp-item sp-pop">${i.qty>1?`<span class="sp-qty">x${i.qty}</span>`:''}<div class="ico">${i.ico}</div><div class="nm">${esc(i.name)}</div><div class="sp-tag">${fmt(i.price)}${i.qty>1?' <small>cada uno</small>':''}</div></div>`).join('');
  return b;
}
function hintText(){
  const parts=S.basket.map(i=>i.qty>1?`(${i.qty} x ${fmt(i.price)} = ${fmt(i.qty*i.price)})`:fmt(i.price));
  return parts.join(' + ')+' = ?';
}

function renderSum(){
  const many=S.basket.some(i=>i.qty>1);
  S.scene.appendChild(sayBlock(many?'Mira tu cesta. Algunos productos van repetidos. ¿Cuánto cuesta todo?':'Mira tu cesta. ¿Cuánto cuesta todo junto?'));
  const row=el('div','sp-row');
  const left=el('div');left.style.cssText='display:flex;flex-direction:column;gap:14px';
  left.appendChild(basketEl());
  const hint=el('div','sp-sumline');hint.hidden=S.fails<2;hint.textContent=hintText();
  const hb=el('button','sp-go alt','💡 Pista');hb.onclick=()=>{hint.hidden=false};
  left.append(hb,hint);
  row.append(left,keypad((val,msg,scr)=>{
    if(val===S.total){yay();S.step=2;S.input='';S.fails=0;render()}
    else{S.fails++;bad(msg,scr,isNaN(val)?'Escribe un número.':val<S.total?'Te falta un poco. Vuelve a sumar.':'Te has pasado. Vuelve a sumar.');if(S.fails>=2)hint.hidden=false}
  }));
  S.scene.appendChild(row);
}

function renderPay(){
  const paid=sum(S.tray);
  S.scene.appendChild(sayBlock(`Tienes que pagar ${fmt(S.total)}. Arrastra el dinero de tu cartera al mostrador.`));
  const row=el('div','sp-row');
  const left=el('div');left.appendChild(basketEl());
  const right=el('div');
  right.innerHTML=`<div class="sp-zhead"><h3>🧾 Mostrador</h3><span class="sp-big">${fmt(paid)} <small>de ${fmt(S.total)}</small></span></div>`;
  const z=el('div','sp-zone');z.dataset.zone='tray';
  fillZone(z,S.tray,'tray','Suelta aquí las monedas y billetes');
  const m=el('div','sp-meter'+(paid>=S.total?' full':''),`<i style="width:${Math.min(100,paid/S.total*100)}%"></i>`);
  const msg=el('div','sp-msg'+(paid>=S.total?' ok':''));
  msg.textContent=paid===0?'':paid<S.total?`Faltan ${fmt(S.total-paid)}`:paid===S.total?'¡Justo! Dinero exacto.':'Has dado de más: te tienen que devolver.';
  const go=el('button','sp-go','💳 Pagar');go.disabled=paid<S.total;go.style.marginTop='10px';
  go.onclick=()=>{
    // si sobra una moneda o billete entero, avisar (pagar de más sin necesidad)
    const extra=S.tray.find(o=>paid-o.v>=S.total);
    if(extra&&!S.warned){S.warned=true;nope();msg.className='sp-msg bad';msg.textContent=`Ojo: te sobra ${say$(extra.v)}. ¿Puedes quitarlo? Si quieres pagar así, pulsa otra vez.`;return}
    yay();S.warned=false;S.change=paid-S.total;S.paid=paid;S.input='';S.fails=0;S.sub='ask';
    S.step=S.change>0?3:4;if(S.step===4)finish();render();
  };
  right.append(z,m,msg,go);
  row.append(left,right);S.scene.appendChild(row);
}

function renderChange(){
  if(S.sub==='ask'){
    S.scene.appendChild(sayBlock(`Has pagado ${fmt(S.paid)}. La compra cuesta ${fmt(S.total)}. ¿Cuánto te tienen que devolver?`));
    const row=el('div','sp-row');
    const left=el('div','sp-center');
    left.innerHTML=`<div class="sp-receipt"><div><span>Has pagado</span><b>${fmt(S.paid)}</b></div><div><span>Cuesta</span><b>− ${fmt(S.total)}</b></div><hr><div><span>Cambio</span><b>?</b></div></div>`;
    if(S.fails>=2)left.appendChild(el('div','sp-sumline',`${fmt(S.paid)} − ${fmt(S.total)} = ?`));
    row.append(left,keypad((val,msg,scr)=>{
      if(val===S.change){yay();S.sub='drag';S.input='';S.fails=0;render()}
      else{S.fails++;bad(msg,scr,isNaN(val)?'Escribe un número.':'No es correcto. Resta: lo que pagas menos lo que cuesta.');if(S.fails===2)render()}
    }));
    S.scene.appendChild(row);return;
  }
  const got=sum(S.hand);
  S.scene.appendChild(sayBlock(`Ahora eres el cajero. Saca de la caja ${fmt(S.change)} de cambio.`));
  const row=el('div','sp-row');
  const left=el('div','','<div class="sp-zhead"><h3>🏪 La caja</h3><span style="color:var(--sp-muted);font-weight:700">Arrastra o toca</span></div>');
  const till=el('div','sp-till');
  LEVELS[S.level].till.forEach(v=>{const s=el('div','sp-slot');s.appendChild(moneyEl({id:'t'+v,v},'till'));till.appendChild(s)});
  left.appendChild(till);
  const right=el('div','',`<div class="sp-zhead"><h3>✋ Cambio</h3><span class="sp-big">${fmt(got)} <small>de ${fmt(S.change)}</small></span></div>`);
  const z=el('div','sp-zone');z.dataset.zone='hand';
  fillZone(z,S.hand,'hand','Pon aquí el cambio');
  const m=el('div','sp-meter'+(got===S.change?' full':''),`<i style="width:${Math.min(100,got/S.change*100)}%"></i>`);
  const msg=el('div','sp-msg');
  if(got>S.change){msg.className='sp-msg bad';msg.textContent=`Te has pasado ${fmt(got-S.change)}. Toca una moneda para quitarla.`}
  else if(got>0&&got<S.change)msg.textContent=`Faltan ${fmt(S.change-got)}`;
  else if(got===S.change){msg.className='sp-msg ok';msg.textContent='¡Cambio correcto!'}
  const go=el('button','sp-go','✔ Dar el cambio');go.disabled=got!==S.change;go.style.marginTop='10px';
  go.onclick=()=>{S.wallet.push(...S.hand.map(o=>mk(o.v)));S.hand=[];S.step=4;finish();yay();render()};
  right.append(z,m,msg,go);
  row.append(left,right);S.scene.appendChild(row);
}

function finish(){
  const before=unlocked(S.level+1);
  S.prog.done[S.level]=doneIn(S.level)+1;saveProg();
  S.unlockedNew=S.level<LEVELS.length-1&&!before&&unlocked(S.level+1);
  S.tray=[];
}
function renderEnd(){
  const n=Math.min(doneIn(S.level),PER_LEVEL);
  const c=el('div','sp-center sp-pop');
  c.innerHTML=`<div class="sp-stars" aria-label="${n} de ${PER_LEVEL}">${'⭐'.repeat(n)}${'☆'.repeat(PER_LEVEL-n)}</div><h2 class="sp-title" style="font-size:2rem">¡Compra terminada!</h2>
  ${S.unlockedNew?`<div class="sp-unlock">🔓 ¡Has abierto el nivel ${S.level+2}: ${esc(LEVELS[S.level+1].t)}!</div>`:''}
  <div class="sp-receipt">${S.basket.map(i=>`<div><span>${i.ico} ${i.qty>1?i.qty+' x ':''}${esc(i.name)}</span><span>${fmt(i.price*i.qty)}</span></div>`).join('')}<hr>
  <div><b>TOTAL</b><b>${fmt(S.total)}</b></div><div><span>Pagado</span><span>${fmt(S.paid)}</span></div><div><span>Cambio</span><span>${fmt(S.change)}</span></div></div>`;
  const btns=el('div','sp-top');btns.style.justifyContent='center';
  const a=el('button','sp-go','🛒 Otra compra');a.onclick=()=>newRound();
  btns.appendChild(a);
  if(S.unlockedNew){const b=el('button','sp-go alt','➡️ Ir al nivel '+(S.level+2));b.onclick=()=>newRound(S.level+1);btns.appendChild(b)}
  const l=el('button','sp-go alt','🗺️ Niveles');l.onclick=()=>{S.view='levels';render()};btns.appendChild(l);
  c.appendChild(btns);
  S.scene.appendChild(c);
  speak(S.unlockedNew?'¡Muy bien! Has abierto un nivel nuevo.':'¡Muy bien! Compra terminada.');
}

/* ---------- mover dinero (arrastrar o tocar) ---------- */
function tapTarget(from){
  if(S.step===2)return from==='wallet'?'tray':from==='tray'?'wallet':null;
  if(S.step===3&&S.sub==='drag')return from==='till'?'hand':from==='hand'?'trash':null;
  return null;
}
function act(from,id,v,to){
  if(!to)return;
  if(from==='till'){if(to==='hand'){S.hand.push(mk(v));clink();render()}return}
  if(to==='trash'){const i=S.hand.findIndex(o=>String(o.id)===String(id));if(i>=0){S.hand.splice(i,1);tone(500,.06);render()}return}
  const src=from==='wallet'?S.wallet:from==='tray'?S.tray:S.hand;
  const i=src.findIndex(o=>String(o.id)===String(id));if(i<0)return;
  const[o]=src.splice(i,1);
  (to==='wallet'?S.wallet:to==='tray'?S.tray:S.hand).push(o);
  S.warned=false;clink();render();
}
function zoneAt(x,y){return[...S.root.querySelectorAll('.sp-zone[data-zone]')].find(z=>{const r=z.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom})}
function clearDrag(){const d=S&&S.drag;if(!d)return;d.ghost&&d.ghost.remove();d.el.classList.remove('sp-dragging');S.root.querySelectorAll('.sp-zone').forEach(z=>z.classList.remove('hot'));S.drag=null}
const H={
  down(e){
    const m=e.target.closest('.sp-money');if(!m||!S.root.contains(m))return;
    const from=m.dataset.from;if(!tapTarget(from))return;
    e.preventDefault();
    S.drag={el:m,from,id:m.dataset.id,v:+m.dataset.v,x:e.clientX,y:e.clientY,moved:false,ghost:null};
  },
  move(e){
    const d=S&&S.drag;if(!d)return;
    if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>6){
      d.moved=true;d.ghost=d.el.cloneNode(true);d.ghost.classList.add('sp','sp-ghost');document.body.appendChild(d.ghost);d.el.classList.add('sp-dragging');
    }
    if(d.moved){
      d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';
      S.root.querySelectorAll('.sp-zone').forEach(z=>z.classList.remove('hot'));
      const z=zoneAt(e.clientX,e.clientY);if(z&&z.dataset.zone===tapTarget(d.from))z.classList.add('hot');
    }
  },
  up(e){
    const d=S&&S.drag;if(!d)return;
    const z=d.moved?zoneAt(e.clientX,e.clientY):null;clearDrag();
    const allowed=tapTarget(d.from);
    if(!d.moved){act(d.from,d.id,d.v,allowed);return}
    const to=z?z.dataset.zone:null;
    if(to&&to===allowed)act(d.from,d.id,d.v,to);
    else if(d.from==='hand'&&to!=='hand')act(d.from,d.id,d.v,'trash');
  },
  cancel(){if(S)clearDrag()},
  key(e){const m=e.target.closest&&e.target.closest('.sp-money');if(m&&S.root.contains(m)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();act(m.dataset.from,m.dataset.id,+m.dataset.v,tapTarget(m.dataset.from))}}
};

function mount(root,opts={}){
  unmount();
  S={root,onBack:opts.onBack||null,key:'benchi-super:'+(opts.storeKey||'local'),all:!!opts.allUnlocked,level:0,view:'levels',drag:null};
  S.prog=loadProg();
  // empezar en el nivel más alto abierto
  for(let i=LEVELS.length-1;i>=0;i--)if(unlocked(i)){S.level=i;break}
  root.classList.add('sp');
  root.addEventListener('pointerdown',H.down);
  document.addEventListener('pointermove',H.move);
  document.addEventListener('pointerup',H.up);
  document.addEventListener('pointercancel',H.cancel);
  root.addEventListener('keydown',H.key);
  render();
}
function unmount(){
  if(!S)return;
  clearDrag();
  S.root.removeEventListener('pointerdown',H.down);
  document.removeEventListener('pointermove',H.move);
  document.removeEventListener('pointerup',H.up);
  document.removeEventListener('pointercancel',H.cancel);
  S.root.removeEventListener('keydown',H.key);
  S.root.classList.remove('sp');S.root.innerHTML='';
  try{speechSynthesis.cancel()}catch(e){}
  S=null;
}
window.SUPER={mount,unmount,LEVELS,NAME:'El Súper de Clase'};
})();
