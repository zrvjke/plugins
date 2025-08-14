(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.uiTidyPlusInjected) return;
  window.uiTidyPlusInjected = true;

  var STYLE_ID = 'ui-tidy-plus-style';

  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '.genre-pill{display:inline-flex;align-items:center;background:rgba(0,0,0,.4);',
      '  padding:.22em .55em;border-radius:.4em;line-height:1;font-size:1em;',
      '  margin-right:.4em;margin-top:.25em}',
      '@media (max-width:600px){.genre-pill{font-size:.92em}}',
      '@media (min-width:1200px){.genre-pill{font-size:1.08em}}',
      '.full-start__quality, .full-start-new__quality, .badge-quality{display:none!important}',
      '.full-start__comments, .full-start-new__comments, .comments, .comments--container, #comments{display:none!important}'
    ].join('');
    document.head.appendChild(css);
  }

  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  function qsa(root, sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function isNode(x){ return x && typeof x === 'object' && typeof x.nodeType === 'number'; }

  var GENRES = [
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал','приключения',
    'мелодрама','семейный','анимация','мультфильм','военный','история','мюзикл','биография',
    'документальный','спорт','вестерн','детектив','реалити','научный','ток-шоу',
    'action','comedy','drama','thriller','horror','sci-fi','fantasy','crime','adventure',
    'family','animation','war','history','musical','biography','documentary','sport','western','mystery','reality','talk show'
  ];

  var QUALITY_RX = /(4k|uhd|2160p|1080p|720p|hdrip|web[\.\-\s]?dl|webrip|b[dr]rip|blu[-\s]?ray|dvdrip|camrip|ts|hdtv|sd|hd|fullhd)/i;

  function findDetails(rootEl){
    var order = [
      '.new-interface-info__details',
      '.full-start-new__details',
      '.full-start__details',
      '.full-start-new__info',
      '.full-start__info'
    ];
    for (var i=0;i<order.length;i++){
      var el = rootEl.querySelector(order[i]);
      if (el) return el;
    }
    var title = rootEl.querySelector('.full-start-new__title, .full-start__title');
    return title ? title.parentElement : rootEl;
  }

  function removeQuality(details){
    qsa(details, '.full-start__quality, .full-start-new__quality, .badge-quality').forEach(function(el){ el.remove(); });
    qsa(details, '*').forEach(function(el){
      if (el.classList && el.classList.contains('genre-pill')) return;
      var t = (el.textContent || '').trim();
      if (!t) return;
      if (QUALITY_RX.test(t)) {
        el.style.display = 'none';
      }
    });
  }

  function decorateGenres(details){
    qsa(details, '.tag, .badge, a, span').forEach(function(el){
      if (el.classList && el.classList.contains('genre-pill')) return;
      var txt = norm(el.textContent);
      if (!txt) return;
      if (GENRES.indexOf(txt) >= 0){
        el.classList.add('genre-pill');
        return;
      }
      if (/[,•·]/.test(txt)){
        var raw = el.textContent;
        var parts = raw.split(/,|•|·/).map(function(p){return p.trim();}).filter(Boolean);
        if (!parts.length) return;
        var genresCount = parts.reduce(function(acc,p){
          return acc + (GENRES.indexOf(norm(p))>=0 ? 1 : 0);
        },0);
        if (genresCount >= Math.max(1, Math.floor(parts.length*0.6))){
          var frag = document.createDocumentFragment();
          parts.forEach(function(p){
            var pill = document.createElement('span');
            pill.className = 'genre-pill';
            pill.textContent = p;
            frag.appendChild(pill);
          });
          el.innerHTML = '';
          el.appendChild(frag);
        }
      }
    });
  }

  function nukeComments(rootEl){
    qsa(rootEl, '.full-start__comments, .full-start-new__comments, .comments, .comments--container, #comments')
      .forEach(function(el){ el.remove(); });
  }

  function applyToCard(rootEl){
    try{
      var details = findDetails(rootEl);
      if (details){
        removeQuality(details);
        decorateGenres(details);
      }
      nukeComments(rootEl);
    } catch(e){
      console.warn('[ui-tidy-plus]', e);
    }
  }

  function observeRoot(rootEl){
    if (!isNode(rootEl)) {
      console.warn('[ui-tidy-plus] skip observe: not a Node');
      return;
    }
    applyToCard(rootEl);
    var mo = new MutationObserver(function(){
      applyToCard(rootEl);
    });
    try {
      mo.observe(rootEl, { childList:true, subtree:true });
      setTimeout(function(){ try{ mo.disconnect(); }catch(_){ } }, 7000);
    } catch (err) {
      console.warn('[ui-tidy-plus] MutationObserver failed:', err);
    }
  }

  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    var rendered = e.object.activity.render();
    var rootEl = null;
    if (isNode(rendered)) {
      rootEl = rendered;
    } else if (typeof rendered === 'string') {
      rootEl = document.querySelector(rendered) || null;
    }
    if (isNode(rootEl)) observeRoot(rootEl);
    else console.warn('[ui-tidy-plus] rootEl not found');
  });

  Lampa.Listener.follow('app', function(e){
    if (e.type !== 'dom') return;
    var card = document.querySelector('.full-start, .full-start-new');
    if (isNode(card)) applyToCard(card);
  });

  console.log('[ui-tidy-plus] loaded');
})();



