/* Banner de LetrasIA: se usa fijo en el panel del profesor y en la portada */
const LIA_URL='https://letrasia.es/';
function liaHTML(landing){
  return `<div class="lia-wrap${landing?' lia-static':''}">
    <div class="lia">
      <div class="lia-letters" aria-hidden="true">Aa<img src="https://letrasia.es/wp-content/uploads/2026/07/Lexi_smiling-150x150.png" alt="" loading="lazy" onerror="this.remove()"></div>
      <div class="lia-body">
        <span class="lia-tag">Recursos gratis · Primaria</span>
        <h3>¿Y si tus clases de Primaria tuvieran fichas y juegos listos?</h3>
        <p>LetrasIA te da fichas PDF gratuitas y juegos de Lengua, Matemáticas y Conocimiento del Medio de 1.º a 6.º. Aprende, explora y crea con Lexi… ¡y combínalo con Benchi para que cada ficha acabada sume puntos!</p>
        <div class="lia-chips"><span>📘 Lengua</span><span>➗ Matemáticas</span><span>🌍 C. del Medio</span><span>🎮 Juegos</span></div>
      </div>
      <a class="lia-cta" href="${LIA_URL}" target="_blank" rel="noopener">Descubrir LetrasIA →</a>
    </div>
  </div>`;
}
function initLiaLanding(){ const l=document.getElementById('liaLanding'); if(l) l.innerHTML=liaHTML(true); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initLiaLanding); else initLiaLanding();
