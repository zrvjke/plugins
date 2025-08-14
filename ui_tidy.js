(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.uiTidyPlusInjected) return;
  window.uiTidyPlusInjected = true;

  var STYLE_ID = 'ui-tidy-plus-style';

  // === Стили (та же полупрозрачная подложка, что у RT-бейджей) ===
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      // «пилюли» для жанров
      '.genre-pill{display:inline-flex;align-items:center;background:rgba(0,0,0,.4);',
      '  padding:.22em .55em;border-radius:.4em;line-height:1;font-size:1em;',
      '  margin-right:.4em;margin-top:.25em}',
      '@media (max-width:600px){.genre-pill{font-size:.92em}}',
      '@media (min-width:1200px){.genre-pill{font-size:1.08em}}',

      // страховочное скрытие качества и комментариев по «частичным» классам
      '[class*=\"quality\" i]{display:none!important}',     // качество
      '[class*=\"comment\" i]{display:none!important}',     // комментарии (блоки)
      '.comments, .comments--container, #comments{display:none!important}'
    ].join('');
    document.head.appendChild(css);
  }

  // === Утилиты ===
  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  function qsa(root, sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  // популярные жанры RU/EN для распознавания
  var GENRES = [
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал','приключения',
    'мелодрама','семейный','анимация','мультфильм','военный','история','мюзикл','биография',
    'документальный','спорт','вестерн','детектив','реалити','научный','ток-шоу',
    'action','comedy','drama','thriller','horror','sci-fi','fantasy','crime','adventure',
    'family','animation','war','history','musical','biography','documentary','sport','western','mystery','reality','talk show'
  ];

  var QUALITY_RX = /(4k|uhd|2160p|1080p|720p|hdrip|web[\.\-\s]?dl|webrip|b[dr]rip|blu[-\s]?ray|dvdrip|camrip|ts|hdtv|sd|hd|fullhd)/i;

  // Ищем «зону деталей» карточки
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

  // Скрыть явные блоки качества + inline-варианты по тексту
  function removeQuality(details){
    // убрать явные бейджи/блоки качества
    qsa(details, '.full-start__quality, .full-start-new__quality, .quality, .badge-quality')
      .forEach(function(el){ el.remove(); });

    // inline: пробежать потомков и скрыть те, что похожи на качество по тексту
    qsa(details, '*').forEach(function(el){
      if (el.classList && el.classList.contains('genre-pill')) return;
      var t = (el.textContent||'').trim();
      if (!t) return;
      if (QUALITY_RX.test(t)) {
        el.style.display = 'none';
      }
    });
  }

  // Обернуть жанры в «пилюли»
  function decorateGenres(details){
    // 1) если жанры уже размечены как теги/бейджи — просто навесим класс
    qsa(details, '.tag, .badge, a, span').forEach(function(el){
      if (el.classList && el.classList.contains('genre-pill')) return;
      var txt = norm(el.textContent);
      if (!txt) return;

      // одиночный жанр
      if (GENRES.indexOf(txt) >= 0){
        el.classList.add('genre-pill');
      }

      // список жанров в одной ноде через запятую/точку/маркер
      if (txt.indexOf(',')>0 || txt.indexOf(' • ')>0 || txt.indexOf(' · ')>0){
        var raw = el.textContent;
        var parts = raw.split(/,|•|·/).map(function(p){return p.trim();}).filter(Boolean);
        if (!parts.length) return;
        var genresCount = parts.reduce(function(acc,p){
          return acc + (GENRES.indexOf(norm(p))>=0 ? 1 : 0);
        },0);
        if (genresCount >= Math.max(1, Math.floor(parts.length*0.6))){
          // заменим на набор «пилюль»
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

  // Удалить/скрыть комментарии (включая то, что подгружается динамически)
  function nukeComments(rootEl){
    qsa(rootEl, '.full-start__comments, .full-start-new__comments, .comments, .comments--container, [id*=\"comment\" i]')
      .forEach(function(el){ el.remove(); });
  }

  // Применить ко всей карточке
  function applyToCard(rootEl){
    try{
      var details = findDetails(rootEl);
      if (details){
        removeQuality(details);
        decorateGenres(details);
      }
      nukeComments(rootEl);
      // логи в консоль — удобно проверить, что сработало
      // console.log('[ui-tidy-plus] applied to card');
    }catch(e){ console.warn('[ui-tidy-plus]', e); }
  }

  // Хук на открытие карточки
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    var root = e.object.activity.render();
    if (!root) return;
    var rootEl = typeof root === 'string' ? document.querySelector(root) : root;

    if (rootEl){
      // применить сразу
      applyToCard(rootEl);
      // а также следить за асинхронной подгрузкой
      var mo = new MutationObserver(function(){
        applyToCard(rootEl);
      });
      mo.observe(rootEl, { childList:true, subtree:true });
      // через 7 секунд можно отключить наблюдатель (обычно хватает)
      setTimeout(function(){ try{ mo.disconnect(); }catch(_){} }, 7000);
    }
  });

  // Подстраховка: на глобальные DOM-изменения
  Lampa.Listener.follow('app', function(e){
    if (e.type !== 'dom') return;
    var card = document.querySelector('.full-start, .full-start-new');
    if (card) applyToCard(card);
  });

  console.log('[ui-tidy-plus] loaded');
})();


