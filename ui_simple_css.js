(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.genrePillsFixInjected) return;
  window.genrePillsFixInjected = true;

  var STYLE_ID = 'genre-pills-fix-style';

  // 1) Стили только для .genre-pill (больше не красим все span/a подряд)
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '.genre-pill{display:inline-flex;align-items:center;background:rgba(0,0,0,.4);',
      '  padding:.22em .55em;border-radius:.4em;line-height:1;font-size:1em;',
      '  margin-right:.45em;margin-top:.25em;white-space:nowrap}',
      '@media (max-width:600px){.genre-pill{font-size:.92em}}',
      '@media (min-width:1200px){.genre-pill{font-size:1.08em}}'
    ].join('');
    document.head.appendChild(css);
  }

  // --- Справочник жанров (RU/EN) ---
  var GENRES = new Set([
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал','приключения',
    'мелодрама','семейный','анимация','мультфильм','военный','история','мюзикл','биография',
    'документальный','спорт','вестерн','детектив','реалити','научный','ток-шоу',
    'action','comedy','drama','thriller','horror','sci-fi','science fiction','fantasy','crime',
    'adventure','family','animation','war','history','musical','biography','documentary',
    'sport','western','mystery','reality','talk show'
  ]);
  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

  // Где обычно лежит строка деталей
  function findDetails(root){
    var sels = [
      '.new-interface-info__details',
      '.full-start-new__details',
      '.full-start__details',
      '.full-start-new__info',
      '.full-start__info'
    ];
    for (var i=0;i<sels.length;i++){
      var el = root.querySelector(sels[i]);
      if (el) return el;
    }
    var ttl = root.querySelector('.full-start-new__title, .full-start__title');
    return ttl ? ttl.parentElement : root;
  }

  // Разложить «Комедия, Приключения • Фантастика» -> [Комедия, Приключения, Фантастика]
  function splitParts(text){
    return text
      .split(/,|•|·/).map(function(p){ return p.trim(); })
      .filter(Boolean);
  }

  // Превратить текстовый узел/элемент в набор «пилюль» жанров
  function pillifyNode(node){
    var raw = (node.textContent || '').trim();
    if (!raw) return false;

    // пропускаем одиночные символы/разделители/короткие куски (в т.ч. «•», «·» и т.п.)
    if (raw.length <= 2 && /[•·,]/.test(raw)) return false;

    // если это один жанр
    var t = norm(raw);
    if (GENRES.has(t)) {
      // оборачиваем содержимое в span.genre-pill
      var pill = document.createElement('span');
      pill.className = 'genre-pill';
      pill.textContent = raw;
      node.replaceWith(pill);
      return true;
    }

    // если список жанров в одной ноде
    if (/,|•|·/.test(raw)) {
      var parts = splitParts(raw);
      if (!parts.length) return false;

      // считаем, что это действительно жанры, если >=60% совпадают со справочником
      var matches = parts.reduce(function(acc,p){ return acc + (GENRES.has(norm(p)) ? 1 : 0); }, 0);
      if (matches >= Math.max(1, Math.floor(parts.length*0.6))) {
        var frag = document.createDocumentFragment();
        parts.forEach(function(p){
          if (!p) return;
          var pill = document.createElement('span');
          pill.className = 'genre-pill';
          pill.textContent = p;
          frag.appendChild(pill);
        });
        node.replaceWith(frag);
        return true;
      }
    }

    return false;
  }

  // Проходим по кандидатам: только возможные «теги» жанров
  function paintGenres(details){
    if (!details) return;
    var candidates = details.querySelectorAll('a, span, .tag, .badge');
    candidates.forEach(function(el){
      // уже сделали
      if (el.classList.contains('genre-pill')) return;

      // пропустим очевидные «служебные» куски:
      var txt = (el.textContent || '').trim();
      if (!txt) return;
      if (txt.length <= 2 && /[•·,]/.test(txt)) return; // точка/разделитель
      if (/^\d{1,4}$/.test(txt)) return;                // «1999», «18+», «1080»
      if (/мин|ч$/.test(norm(txt))) return;              // «2:14», «ч», «мин» и т.п.

      // пытаемся превратить в «пилюли»
      pillifyNode(el);
    });
  }

  // Запуск при открытии карточки (двойной проход — на случай «ленивой» дорисовки)
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;

    var rendered = e.object.activity.render();
    var root = (rendered && typeof rendered === 'object' && rendered.nodeType === 1)
      ? rendered
      : (typeof rendered === 'string' ? document.querySelector(rendered) : document);

    var details = findDetails(root);
    paintGenres(details);
    setTimeout(function(){ paintGenres(details); }, 400);
  });

  console.log('[genre-pills-fix] loaded');
})();
