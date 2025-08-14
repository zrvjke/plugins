(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.genrePillsSafeInjected) return;
  window.genrePillsSafeInjected = true;

  var STYLE_ID = 'genre-pills-safe-style';

  // 1) Чистый CSS — полупрозрачная «пилюля», как в интерфейс-модах
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

  // 2) Список жанров (RU/EN). Нужен, чтобы не красить всё подряд.
  var GENRES = new Set([
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал','приключения',
    'мелодрама','семейный','анимация','мультфильм','военный','история','мюзикл','биография',
    'документальный','спорт','вестерн','детектив','реалити','научный','ток-шоу',
    'action','comedy','drama','thriller','horror','sci-fi','science fiction','fantasy','crime',
    'adventure','family','animation','war','history','musical','biography','documentary',
    'sport','western','mystery','reality','talk show'
  ]);
  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

  // 3) Находим «детали» карточки (где обычно лежат год/страна/жанры)
  function findDetails(root){
    var q = [
      '.new-interface-info__details',
      '.full-start-new__details',
      '.full-start__details',
      '.full-start-new__info',
      '.full-start__info'
    ];
    for (var i=0;i<q.length;i++){
      var el = root.querySelector(q[i]);
      if (el) return el;
    }
    var ttl = root.querySelector('.full-start-new__title, .full-start__title');
    return ttl ? ttl.parentElement : root;
  }

  // 4) Аккуратно помечаем жанры (НЕ перестраиваем DOM — только класс)
  function paintGenres(details){
    if (!details) return;
    // жанры обычно как <a>, <span> или «теги»
    var candidates = details.querySelectorAll('a, span, .tag, .badge');
    candidates.forEach(function(el){
      if (el.classList.contains('genre-pill')) return;
      var txt = (el.textContent || '').trim();
      if (!txt) return;

      // если узел содержит список через запятую — красим поштучно
      if (txt.includes(',') || txt.includes(' • ') || txt.includes(' · ')) {
        // ничего не разбираем — просто не трогаем такие узлы, чтобы не ломать верстку
        return;
      }

      if (GENRES.has(norm(txt))) {
        el.classList.add('genre-pill');
      }
    });
  }

  // 5) Один проход при открытии карточки
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    var rendered = e.object.activity.render();
    var root = (rendered && typeof rendered === 'object' && rendered.nodeType === 1)
      ? rendered
      : (typeof rendered === 'string' ? document.querySelector(rendered) : document);

    var details = findDetails(root);
    paintGenres(details);
    // на всякий — второй проход через полсекунды (часто дорисовывается строка)
    setTimeout(function(){ paintGenres(details); }, 500);
  });

  console.log('[genre-pills-safe] loaded');
})();
