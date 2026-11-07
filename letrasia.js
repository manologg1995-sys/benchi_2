/* Banner de LetrasIA: versión movible (panel del profesor) y versión fija (portada) */
const LIA_URL='https://letrasia.es/';
function liaHTML(movable){
  const handle=movable?`<div class="lia-handle"><button type="button" class="lia-grab" title="Arrastra para mover" aria-label="Mover banner">⠿</button><button type="button" class="lia-reset" title="Volver a su sitio" aria-label="Volver a su sitio">↺</button></div>`:'';
  return `<div class="lia-wrap${movable?'':' lia-static'}" ${movable?'id="liaMovable"':''}>
    <div class="lia">
      ${handle}
      <div class="lia-letters" aria-hidden="true">Aa<img src="https://letrasia.es/wp-content/uploads/2026/07/Lexi_smiling-150x150.png" alt="" loading="lazy" onerror="this.remove()"></div>
      <div class="lia-body">
        <span class="lia-tag">Recursos gratis · Primaria</span>
        <h3>¿Y si tus clases de Primaria tuvieran fichas y juegos listos?</h3>
        <p>LetrasIA te da fichas PDF gratuitas y juegos de Lengua, Matemáticas y Conocimiento del Medio de 1.º a 6.º. Aprende, explora y crea con Lexi… ¡y combínalo con Benchi para que cada ficha acabada sume puntos!</p>
        <div class="lia-chips"><span>📘 Lengua</span><span>➗ Matemáticas</span><span>🌍 C. del Medio</span><span>🎮 Juegos</span></div>
      </div>
      <a class="lia-cta" href="${LIA_URL}" target="_blank" rel="noopener">Descubrir LetrasIA →</a>
    </div>
    ${movable?'<div class="lia-hint">Arrastra el banner por ⠿ para colocarlo donde quieras.</div>':''}
  </div>`;
}
function initLiaDrag(){
  const w=document.getElementById('liaMovable'); if(!w) return;
  const g=w.querySelector('.lia-grab'), KEY='benchi_lia_pos';
  let x=0,y=0,sx,sy,ox,oy;
  try{ const p=JSON.parse(localStorage.getItem(KEY)||'null'); if(p){x=p.x;y=p.y;} }catch(e){}
  const apply=()=>{ w.style.transform=`translate(${x}px,${y}px)`; };
  apply();
  g.addEventListener('pointerdown',e=>{
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    sx=e.clientX; sy=e.clientY; ox=x; oy=y; w.classList.add('dragging');
  });
  g.addEventListener('pointermove',e=>{
    if(!w.classList.contains('dragging')) return;
    x=ox+e.clientX-sx; y=oy+e.clientY-sy; apply();
  });
  const end=()=>{ if(!w.classList.contains('dragging')) return; w.classList.remove('dragging');
    try{ localStorage.setItem(KEY,JSON.stringify({x,y})); }catch(e){} };
  g.addEventListener('pointerup',end); g.addEventListener('pointercancel',end);
  g.style.touchAction='none';
  w.querySelector('.lia-reset').addEventListener('click',()=>{ x=0;y=0;apply(); try{localStorage.removeItem(KEY);}catch(e){} });
}

function initLiaLanding(){ const l=document.getElementById('liaLanding'); if(l) l.innerHTML=liaHTML(false); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initLiaLanding); else initLiaLanding();
