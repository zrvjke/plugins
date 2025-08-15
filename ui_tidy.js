(function () {
  'use strict';
  if (!window.Lampa || window.uiTidyJQInjected) return;
  window.uiTidyJQInjected = true;

  // ====== переключатели (оставил гибко) ======
  var HIDE_QUALITY    = false;  // если нужно — поставьте true
  var HIDE_COMMENTS   = false;  // если нужно — поставьте true

  // ====== стили только для наших «пилюль» ======
  (function injectCSS(){
    var id = 'ui-tidy-jq-style';
    if (document.getElementById(id)) return;
    var css = document.createElement('style');
    css.id = id;
    css.textContent = [
      '.ui-genre-pill{display:inline-flex;align-items:center;background:rgba(0,0,0,.4);',
      '  padding:.22em .55em;border-radius:.4em;line-height:1;font-size:1em;',
      '  margin-right:.45em;margin-top:.25em;white-space:nowrap}',
      '@media (max-width:600px){.ui-genre-pill{font-size:.92em}}',
      '@media (min-width:1200px){.ui-genre-pill{font-size:1.08em}}',
      HIDE_QUALITY ? '.full-start__quality, .full-start-new__quality, .badge-quality{display:none!important}' : '',
      HIDE_COMMENTS ? '.full-start__comments, .full-start-new__comments, .comments, .comments--container, #comments{display:none!important}' : ''
    ].join('');
    document.head.appendChild(css);
  })();

  // ====== справочник жанров ======
  var GENRES = new Set([
    'боевик','комедия','драма','триллер','ужасы','фантастика','фэнтези','криминал','приключения',
    'мелодрама','семейный','анимация','мультфильм','военный','история','мюзикл','биография',
    'документальный','спорт','вестерн','детектив','реалити','научный','ток-шоу',
    'action','comedy','drama','thriller','horror','sci-fi','science fiction','fantasy','crime',
    'adventure','family','animation','war','history','musical','biography','documentary',
    'sport','western','mystery','reality','talk show'
  ]);
  function norm(s){ return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  function splitParts(t){ return t.split(/,|•|·/).map(function(p){return p.trim();}).filter(Boolean); }

  // ====== где жить жанрам ======
  function findDetails($root){
    var $d = $root.find('.new-interface-info__details, .full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info').eq(0);
    if ($d.length) return $d;
    var $ttl = $root.find('.full-start-new__title, .full-start__title').eq(0);
    return $ttl.length ? $ttl.parent() : $root;
  }

  // ====== превращаем только жанры в «пилюли» ======
  function pillify($details){
    if (!$details || !$details.length) return;

    // кандидаты: ссылки/бейджи/спаны в деталях
    var $nodes = $details.find('a, span, .tag, .badge');

    $nodes.each(function(){
      var $el = Lampa.$(this);
      if ($el.hasClass('ui-genre-pill')) return;

      var text = ($el.text()||'').trim();
      if (!text) return;

      // пропускаем разделители и короткие служебные куски
      if (text.length <= 2 && /[•·,]/.test(text)) return;
      if (/^\d{1,4}$/.test(text)) return;               // 1999 / 18+
      if (/(^|\\s)(мин|ч)\\s*$/i.test(text)) return;    // «мин», «ч»

      var lower = norm(text);

      // одиночный жанр
      if (GENRES.has(lower)) {
        $el.addClass('ui-genre-pill');
        return;
      }

      // список жанров в одном узле — аккуратно раскладываем
      if (/,|•|·/.test(text)) {
        var parts = splitParts(text);
        if (!parts.length) return;

        var matches = parts.reduce(function(a,p){ return a + (GENRES.has(norm(p)) ? 1 : 0); }, 0);
        if (matches >= Math.max(1, Math.floor(parts.length*0.6))) {
          var frag = document.createDocumentFragment();
          parts.forEach(function(p){
            var span = document.createElement('span');
            span.className = 'ui-genre-pill';
            span.textContent = p;
            frag.appendChild(span);
          });
          $el.replaceWith(frag);
        }
      }
    });
  }

  // ====== мягко скрываем вкладку «Комментарии» по заголовку ======
  function hideCommentsTab($root){
    if (!HIDE_COMMENTS) return;
    try{
      var $tabs = $root.find('.tabs, .full-start__tabs, .full-start-new__tabs').eq(0);
      if (!$tabs.length) return;
      var $heads = $tabs.find('.tabs__head .selector, .tabs__head *[class*="selector"]');
      var idx = -1;
      $heads.each(function(i){
        var t = Lampa.$(this).text().trim().toLowerCase();
        if (/коммент/i.test(t) || /comments?/i.test(t)) idx = i;
      });
      if (idx >= 0){
        $heads.eq(idx).hide();
        var $bods = $tabs.find('.tabs__body > *');
        if ($bods.eq(idx).length) $bods.eq(idx).hide();
      }
    }catch(_){}
  }

  // ====== мягко убираем «качество» в деталях (inline-текст) ======
  var QUALITY_RX = /(4k|uhd|2160p|1080p|720p|hdrip|web[.\\-\\s]?dl|webrip|b[dr]rip|blu[-\\s]?ray|dvdrip|camrip|ts|hdtv|sd|hd|fullhd)/i;
  function hideQualityInline($details){
    if (!HIDE_QUALITY || !$details || !$details.length) return;
    $details.find('span, a, b, i, div').each(function(){
      var $n = Lampa.$(this);
      var t = ($n.text()||'').trim();
      if (t && QUALITY_RX.test(t)) $n.hide();
    });
  }

  // ====== основная точка входа ======
  Lampa.Listener.follow('full', function(e){
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;

    try {
      var $root = Lampa.$(e.object.activity.render());
      if (!$root || !$root.length) return;

      var $details = findDetails($root);
      // первый проход
      pillify($details);
      hideCommentsTab($root);
      hideQualityInline($details);

      // резервный проход (когда Lampa дорисовывает строку позже)
      setTimeout(function(){
        var $details2 = findDetails($root);
        pillify($details2);
        hideCommentsTab($root);
        hideQualityInline($details2);
      }, 400);

    } catch(err){
      console.warn('[ui-tidy-jq]', err);
    }
  });

  console.log('[ui-tidy-jq] loaded');
})();



