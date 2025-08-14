(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.uiFixGqcInjected) return;
  window.uiFixGqcInjected = true;

  var STYLE_ID = 'ui-fix-gqc-style';

  // ---------- стили ----------
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      /* наши жанры-пилюли */
      '.gqc-genres{display:flex;flex-wrap:wrap;gap:.45em;margin-top:.5em}',
      '.gqc-pill{display:inline-flex;align-items:center;background:rgba(0,0,0,.4);',
      '  padding:.22em .55em;border-radius:.4em;line-height:1;font-size:1em}',
      '@media (max-width:600px){.gqc-pill{font-size:.92em}}',
      '@media (min-width:1200px){.gqc-pill{font-size:1.08em}}',

      /* максимально широкая маска для комментариев */
      '.comments, .comments--container, #comments, [data-name=\"comments\"],',
      ' [class*=\"comment\" i]{display:none!important}',

      /* типовые контейнеры качества */
      '.full-start__quality, .full-start-new__quality, .badge-quality{display:none!important}'
    ].join('');
    document.head.appendChild(css);
  }

  // ---------- утилиты ----------
  function isNode(x){ return x && typeof x === 'object' && typeof x.nodeType === 'number'; }
  function selOne(root, list){
    for (var i=0;i<list.length;i++){
      var el = root.querySelector(list[i]);
      if (el) return el;
    }
    return null;
  }
  function getRootEl(e){
    var r = e && e.object && e.object.activity && e.object.activity.render && e.object.activity.render();
    if (isNode(r)) return r;
    if (typeof r === 'string') return document.querySelector(r);
    return document.querySelector('.full-start, .full-start-new') || null;
  }

  // зона «деталей» в разных темах
  var DETAILS_SEL = [
    '.new-interface-info__details',
    '.full-start-new__details',
    '.full-start__details',
    '.full-start-new__info',
    '.full-start__info'
  ];

  // убираем качество (блоки уже скрыли стилями; сейчас удалим/спрячем inline-текст)
  var QUALITY_RX = /(4k|uhd|2160p|1080p|720p|hdrip|web[\.\-\s]?dl|webrip|b[dr]rip|blu[-\s]?ray|dvdrip|camrip|ts|hdtv|sd|hd|fullhd)/i;
  function removeQualityInline(details){
    try{
      var all = details.querySelectorAll('*');
      for (var i=0;i<all.length;i++){
        var el = all[i];
        var txt = (el.textContent||'').trim();
        if (!txt) continue;
        if (QUALITY_RX.test(txt)) el.style.display = 'none';
      }
    }catch(_){}
  }

  // строим собственную линию жанров
  function buildGenresLine(movie){
    var names = [];

    // 1) TMDB формат
    if (Array.isArray(movie && movie.genres) && movie.genres.length){
      names = movie.genres.map(function(g){ return g && (g.name||g.title||g.ru||g.en); }).filter(Boolean);
    }
    // 2) иногда прилетает genre_names
    if (!names.length && Array.isArray(movie && movie.genre_names)) names = movie.genre_names.slice();
    // 3) иногда прилетает строкой
    if (!names.length && typeof movie.genre === 'string') {
      names = movie.genre.split(/,|•|·/).map(function(p){return p.trim();}).filter(Boolean);
    }

    // 4) запасной вариант — карта популярных id TMDB -> RU
    if (!names.length && Array.isArray(movie && movie.genre_ids)) {
      var map = {
        28:'Боевик',12:'Приключения',16:'Анимация',35:'Комедия',80:'Криминал',
        99:'Документальный',18:'Драма',10751:'Семейный',14:'Фэнтези',36:'История',
        27:'Ужасы',10402:'Музыка',9648:'Детектив',10749:'Мелодрама',878:'Фантастика',
        10770:'ТВ-фильм',53:'Триллер',10752:'Военный',37:'Вестерн'
      };
      names = movie.genre_ids.map(function(id){ return map[id]; }).filter(Boolean);
    }

    if (!names.length) return null;

    var box = document.createElement('div');
    box.className = 'gqc-genres';
    names.forEach(function(n){
      var s = (n||'').toString().trim();
      if (!s) return;
      var pill = document.createElement('span');
      pill.className = 'gqc-pill';
      pill.textContent = s;
      box.appendChild(pill);
    });
    return box;
  }

  function ensureHost(rootEl){
    var host = selOne(rootEl, DETAILS_SEL);
    if (host) return host;
    var title = rootEl.querySelector('.full-start-new__title, .full-start__title');
    return (title && title.parentElement) ? title.parentElement : rootEl;
  }

  function applyAll(rootEl, movie){
    // 1) удаляем/скрываем комментарии (на всякий случай)
    rootEl.querySelectorAll('.comments, .comments--container, #comments, [data-name=\"comments\"], [class*=\"comment\" i]')
      .forEach(function(el){ el.remove(); });

    // 2) детали и чистка «качества»
    var details = ensureHost(rootEl);
    if (details){
      // явные контейнеры качества уже скрыты стилем; подчистим inline
      removeQualityInline(details);

      // 3) рисуем СВОЮ строку жанров (чтобы не зависеть от вёрстки темы)
      //    перед вставкой удалим старую нашу линию, чтобы не дублировать
      var old = details.querySelector('.gqc-genres');
      if (old) old.remove();

      var line = buildGenresLine(movie || {});
      if (line) details.appendChild(line);
    }
  }

  // основной хук карточки
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e || !e.data || !e.data.movie) return;

    var rootEl = getRootEl(e);
    if (!isNode(rootEl)) return;

    // применяем сразу
    applyAll(rootEl, e.data.movie);

    // и наблюдаем немного — чтобы перерисовки не ломали правки
    var mo;
    try{
      mo = new MutationObserver(function(){ applyAll(rootEl, e.data.movie); });
      mo.observe(rootEl, {childList:true, subtree:true});
      setTimeout(function(){ try{ mo.disconnect(); }catch(_){ } }, 7000);
    }catch(_){}
  });

  // подстраховка при общих DOM-обновлениях
  Lampa.Listener.follow('app', function(ev){
    if (ev.type !== 'dom') return;
    var rootEl = document.querySelector('.full-start, .full-start-new');
    if (isNode(rootEl)) applyAll(rootEl, (window.__lastMovieData||{}));
  });

  // сохраняем последнюю «movie», если понадобится
  Lampa.Listener.follow('full', function(e){
    if (e && e.data && e.data.movie) window.__lastMovieData = e.data.movie;
  });

  console.log('[ui-fix-gqc] loaded');
})();




