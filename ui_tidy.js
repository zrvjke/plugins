(function () {
  'use strict';
  if (!window.Lampa) return;
  if (window.uiTidyInjected) return;
  window.uiTidyInjected = true;

  var STYLE_ID = 'ui-tidy-style';

  // --- стили: нейтральная полупрозрачная подложка, как у RT-бейджей ---
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      /* жанровые бейджи, которые мы пометим классом .genre-pill */
      '.genre-pill{display:inline-flex;align-items:center;',
      '  background:rgba(0,0,0,.4); padding:.22em .55em; border-radius:.4em;',
      '  line-height:1; font-size:1em; margin-right:.4em; margin-top:.25em}',
      '@media (max-width:600px){.genre-pill{font-size:.92em}}',
      '@media (min-width:1200px){.genre-pill{font-size:1.08em}}',

      /* скрыть явные контейнеры «качества» (на разных темах классы могут отличаться) */
      '.full-start__quality, .full-start-new__quality, .quality, .badge-quality{display:none!important}',

      /* скрыть блоки комментариев (на всякий случай покрываем несколько вариантов) */
      '.full-start__comments, .full-start-new__comments, .comments, .comments--container{display:none!important}'
    ].join('');
    document.head.appendChild(css);
  }

  // список жанров для распознавания (RU + несколько EN на всякий случай)
  var GENRES = [
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал',
    'приключения','мелодрама','семейный','анимация','мультфильм','военный','история',
    'мюзикл','биография','документальный','спорт','вестерн','детектив','научный',
    'ток-шоу','тв-шоу','reality','action','comedy','drama','thriller','horror',
    'sci-fi','fantasy','crime','adventure','family','animation','war','history',
    'musical','biography','documentary','sport','western','mystery','talk show','reality'
  ];

  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

  // пытаемся найти «детали» карточки (где год/страна/жанры/качество обычно живут)
  function findDetails(root){
    var sel = [
      '.new-interface-info__details',
      '.full-start-new__details',
      '.full-start__details',
      '.full-start-new__info',
      '.full-start__info'
    ];
    for (var i=0;i<sel.length;i++){
      var f = root.find(sel[i]).eq(0);
      if (f && f.length) return f;
    }
    // резерв — родитель заголовка
    var titlePar = root.find('.full-start-new__title, .full-start__title').eq(0).parent();
    return titlePar.length ? titlePar : root;
  }

  // убрать "качество" (на случай, если это не отдельный блок, а бейдж/текст среди деталей)
  function removeQualityInline(details){
    try{
      // если есть явные бейджи качества — уже скрыли стилями, но подчистим DOM:
      details.find('.full-start__quality, .full-start-new__quality, .quality, .badge-quality').remove();

      // fallback: скрыть элементы, которые выглядят как качество по тексту
      var QUALITY_PAT = /(4k|uhd|1080p|720p|hdrip|web[\.\-\s]?dl|webrip|b[dr]rip|dvdrip|camrip|ts|hdtv)/i;

      // пройтись по «фишкам»/бейджам внутри details
      details.find('*').each(function(){
        var el = this;
        // не трогаем наши уже оформленные жанры
        if (el.classList && el.classList.contains('genre-pill')) return;
        var txt = (el.textContent||'').trim();
        if (!txt) return;

        // если совсем похоже на качество — скрываем элемент
        if (QUALITY_PAT.test(txt)) {
          el.style.display = 'none';
        }
      });
    } catch(e){}
  }

  // обернуть жанры в красивые «пилюли»
  function decorateGenres(details){
    try{
      // 1) если жанры — отдельные теги/ссылки с классом .tag или .badge, просто навешиваем .genre-pill
      details.find('.tag, .badge, a, span').each(function(){
        var el = this;
        if (el.classList && el.classList.contains('genre-pill')) return;
        var txt = norm(el.textContent);
        if (!txt) return;

        // одиночный жанр «чистый»
        if (GENRES.indexOf(txt) >= 0){
          el.classList.add('genre-pill');
        }

        // если это список через запятую внутри одного SPAN/A
        if (txt.indexOf(',')>0 || txt.indexOf(' • ')>0){
          var raw = el.textContent;
          var parts = raw.split(/,|•/).map(function(p){return p.trim();}).filter(Boolean);
          var isMostlyGenres = parts.length && parts.reduce(function(acc,p){
            return acc + (GENRES.indexOf(norm(p))>=0 ? 1 : 0);
          },0) >= Math.max(1, Math.floor(parts.length*0.6));

          if (isMostlyGenres){
            // заменим содержимое на набор «пилюль»
            var frag = document.createDocumentFragment();
            parts.forEach(function(p,i){
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
    }catch(e){}
  }

  // основной хук при рендере карточки
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    try{
      var root = $(e.object.activity.render());
      var details = findDetails(root);

      // 1) скрыть/убрать качество
      removeQualityInline(details);

      // 2) оформить жанры «пилюлями»
      decorateGenres(details);

      // 3) на всякий случай ещё раз скрыть комменты (если тема подгружает позже)
      root.find('.full-start__comments, .full-start-new__comments, .comments, .comments--container').remove();
    } catch(err){
      console.warn('[ui-tidy]', err);
    }
  });

  // дополнительная подстраховка: глобально скрыть комментарии, если они рендерятся вне карточки
  var killCommentsOnce = setInterval(function(){
    var c = document.querySelector('.full-start__comments, .full-start-new__comments, .comments, .comments--container');
    if (c) c.remove();
  }, 500);
  setTimeout(function(){ clearInterval(killCommentsOnce); }, 5000);

  console.log('[ui-tidy] loaded');
})();
