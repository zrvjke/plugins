(function(){
  'use strict';
  var id = 'rt_dual_styles';
  if (document.getElementById(id)) return;
  var css = `
    .rate.rt--critics, .rate.rt--audience { display:flex; align-items:center; gap:.35em; margin-left:.6em; }
    .rate.rt--critics .rate__text, .rate.rt--audience .rate__text { font-weight:700; }
    .rt-settings .rt-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; }
    .rt-settings input[type="text"] { width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.04); color:#fff; }
    .rt-settings .switch { display:flex; align-items:center; gap:8px; }
    .rt-settings .switch input { transform: scale(1.1); }
    .rt-settings .hint { opacity:.7; font-size:.9em; }
  `;
  var style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();