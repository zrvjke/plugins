(function () {
  'use strict';

  // ====== Настройки / хранение ======
  var STORAGE_KEY_API = 'rt_omdb_api';
  var STORAGE_KEY_HIDE_TMDB = 'rt_hide_tmdb';
  var STORAGE_KEY_CACHE = 'rt_omdb_cache'; // объект { [imdbID или <title|year|type> ]: { critics: n, audience: n, ts: ms } }

  var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

  function getApiKey() { return (Lampa.Storage.get(STORAGE_KEY_API) || '').trim(); }
  function getHideTmdb() { return !!Lampa.Storage.get(STORAGE_KEY_HIDE_TMDB); }

  function readCache() {
    return Lampa.Storage.cache(STORAGE_KEY_CACHE, 1000, {}); // до 1000 ключей
  }
  function writeCache(obj) {
    Lampa.Storage.set(STORAGE_KEY_CACHE, obj);
  }
  function getFromCache(key) {
    var c = readCache();
    if (c[key] && (Date.now() - (c[key].ts || 0)) < CACHE_TTL) return c[key];
    return null;
  }
  function putToCache(key, data) {
    var c = readCache();
    c[key] = Object.assign({}, data, { ts: Date.now() });
    writeCache(c);
    return c[key];
  }

  // ====== Утилиты ======
  function pickRTNumbers(omdbJson) {
    // OMDb: Ratings: [{Source:"Rotten Tomatoes", Value:"84%"}, {Source:"Internet Movie Database", Value:"7.8/10"}, ...]
    var r = { critics: null, audience: null };
    if (!omdbJson) return r;

    // Rotten “tomatometer” критиков:
    var tomatoCrit = null;
    // Audience score OMDb отдает либо в Ratings (редко), либо в полях tomato* если включено ?
    // Надежно: попробуем из Ratings; если нет — null
    if (Array.isArray(omdbJson.Ratings)) {
      omdbJson.Ratings.forEach(function (it) {
        if (it && typeof it.Source === 'string') {
          var s = it.Source.toLowerCase();
          if (s.indexOf('rotten') !== -1 && typeof it.Value === 'string' && it.Value.indexOf('%') > -1) {
            tomatoCrit = parseInt(it.Value, 10);
          }
        }
      });
    }
    r.critics = Number.isFinite(tomatoCrit) ? tomatoCrit : null;

    // Audience: OMDb бесплатный тариф обычно не отдает audience; но многие тайтлы содержат "tomatoUserRating" в альтернативных зеркалах.
    // Попробуем найти “tomatoUserMeter” в произвольных полях (на случай прокси OMDb). Безопасный парс:
    var userMeter = null;
    Object.keys(omdbJson).forEach(function (k) {
      if (/tomat[o]?user[a-z]*|audience/i.test(k)) {
        var val = omdbJson[k];
        if (typeof val === 'string' && val.indexOf('%') > -1) {
          var n = parseInt(val, 10);
          if (Number.isFinite(n)) userMeter = n;
        } else if (typeof val === 'number' && val >= 0 && val <= 100) {
          userMeter = Math.round(val);
        }
      }
    });
    r.audience = Number.isFinite(userMeter) ? userMeter : null;

    // Если аудитории нет — оставим null. Иконку покажем только для доступных чисел.
    return r;
  }

  function byImdbKey(card) {
    // формируем стабильный ключ кэша
    if (card && card.imdb_id) return 'imdb:' + card.imdb_id;
    var title = (card.original_title || card.original_name || card.title || card.name || '').trim();
    var date = (card.release_date || card.first_air_date || card.last_air_date || '0000').slice(0, 4);
    var type = card.media_type || card.type || (card.number_of_seasons ? 'series' : 'movie');
    return 't:' + title.toLowerCase() + '|' + date + '|' + type;
  }

  // ====== Иконки (inline SVG) ======
  var ICON_TOMATO =
    'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsPSIjZTYzMzM0IiBkPSJNMTIuMDIgNC4yYy0uNjUtMS43LTEuOTQtMy0zLjYtMy40LjI2IDEuMTkuMDcgMi40NC0uNTQgMy41Ni0uNDguOS0xLjI0IDEuNjYtMi4xNCAyLjE2QzYuNDQgNi4xIDYuMiA2LjE3IDYuMDkgNi4xYTUuNyA1LjcgMCAwIDAtMS43Ny0uNDljLS4yNy0uMDktLjU2LjA0LS42Ni4zLS4xMS4yNy4wNC41Ny4zMS42NiAxLjA4LjM2IDIuMjguNjMgMy42Ny42MyAzLjM1IDAgNi4xLTEuOTkgNy4yNi00LjYyLjExLjAxLjIyLjAxLjMzLjAxYzIuNzggMCA1LjA0LTEuNjEgNS4wNC0zLjYxIDAtMS41OC0xLjQ4LTIuOTUtMy41Ny0zLjQxLTEuMjEuMjUtMi4zNC45Ni0yLjkxIDEuOTYtLjM4LS4zLTEuMDctLjg3LTEuNTEtMS44OHoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjE0LjUiIHI9IjYuNSIgZmlsbD0iI2ZmMjIyNSIvPjwvc3ZnPg==';
  var ICON_POPCORN =
    'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBmaWxsPSIjRkNDRTAwIiBkPSJNNSA3aDE0bC0xIDExYy0uMDguODktLjc5IDEuNi0xLjY5IDEuNkg3LjY5QzYuNzcgMTkuNiA2LjA3IDE4Ljg5IDYgMTh6Ii8+PHBhdGggZmlsbD0iI0ZGRiIgZD0iTTE5IDdhMiAyIDAgMSAwIDAtNCAyIDIgMCAwIDAgMCA0ek05IDdhMiAyIDAgMSAwIDAtNCAyIDIgMCAwIDAgMCA0ek0xNC41IDZhMiAyIDAgMSAwIDAtNCAyIDIgMCAwIDAgMCA0eiIvPjwvc3ZnPg==';

  function renderBadge(value, title, iconDataURL) {
    if (!Number.isFinite(value)) return '';
    var pct = Math.max(0, Math.min(100, Math.round(value)));
    // Цвет по шкале RT
    var color = pct >= 75 ? '#21d07a' : (pct >= 60 ? '#f1c40f' : '#e74c3c');

    return (
      '<div class="rate rt-badge" style="display:flex;align-items:center;gap:.35em;margin-right:.6em">' +
        '<img src="'+iconDataURL+'" alt="" style="width:1.1em;height:1.1em;display:block"/>' +
        '<div style="color:'+color+';font-weight:600">'+ pct + '%</div>' +
        '<div style="opacity:.65;font-size:.85em">'+ title +'</div>' +
      '</div>'
    );
  }

  // ====== Запрос к OMDb ======
  function fetchRT(card, done, fail) {
    var api = getApiKey();
    var network = new Lampa.Reguest();
    var key = byImdbKey(card);
    var cached = getFromCache(key);
    if (cached) { done(cached); return; }

    if (!api) {
      done({ critics: null, audience: null, note: 'no_api' });
      return;
    }

    var url;
    if (card.imdb_id) {
      url = 'https://www.omdbapi.com/?i=' + encodeURIComponent(card.imdb_id) + '&apikey=' + encodeURIComponent(api);
    } else {
      var title = (card.original_title || card.original_name || card.title || card.name || '').trim();
      var year = (card.release_date || card.first_air_date || card.last_air_date || '').slice(0,4);
      var type = card.media_type || card.type || (card.number_of_seasons ? 'series' : 'movie');
      url = 'https://www.omdbapi.com/?t=' + encodeURIComponent(title);
      if (year) url += '&y=' + encodeURIComponent(year);
      if (type === 'tv' || type === 'series') url += '&type=series';
      url += '&apikey=' + encodeURIComponent(api);
    }

    network.clear();
    network.timeout(15000);
    network.silent(url, function (json) {
      if (!json || json.Response === 'False') {
        fail && fail('OMDb: ' + (json && json.Error ? json.Error : 'no data'));
        done({ critics: null, audience: null });
        return;
      }
      var picked = pickRTNumbers(json);
      putToCache(key, picked);
      done(picked);
    }, function (a, c) {
      fail && fail(network.errorDecode(a, c));
      done({ critics: null, audience: null });
    }, false, {});
  }

  // ====== Рендер в карточке ======
  function injectBadges(render, critics, audience) {
    // ищем контейнер c рейтингами (как в rating.js — рядом с .info__rate)
    var $render = $(render);
    var $infoRate = $render.find('.info__rate');
    if (!$infoRate.length) {
      // альтернативные контейнеры в разных версиях
      $infoRate = $render.find('.full-start__rate, .full-start-new__rate, .full-start__tags');
    }
    if (!$infoRate.length) return;

    // Удалим наши старые бейджи, если перерисовка
    $infoRate.find('.rt-badge').remove();

    var html = '';
    if (Number.isFinite(critics)) html += renderBadge(critics, 'RT Critics', ICON_TOMATO);
    if (Number.isFinite(audience)) html += renderBadge(audience, 'RT Audience', ICON_POPCORN);

    if (!html) return;

    // Вклеиваем рядом с существующими рейтингами (после IMDB/KP)
    // у rating.js добавление идет через .after(...) от .info__rate — поддержим то же место:
    if ($render.find('.info__rate').length) {
      $render.find('.info__rate').append(html);
    } else {
      $infoRate.append(html);
    }
  }

  // ====== Сокрытие TMDB при опции ======
  function applyHideTmdbIn(renderRoot) {
    var hide = getHideTmdb();
    var $root = $(renderRoot || document.body);
    // Максимально щадящий набор селекторов для “tmdb” показателей
    var selectors = [
      '.info__rate .rate--tmdb',
      '.full-start__rate .rate--tmdb',
      '.full-start-new__rate .rate--tmdb',
      '.full-start__vote',           // старые варианты блока с голосом TMDB
      '.full-start-new__vote'
    ];
    selectors.forEach(function (sel) {
      var $elem = $root.find(sel);
      if ($elem.length) {
        if (hide) $elem.addClass('rt-hide'); else $elem.removeClass('rt-hide');
      }
    });
  }

  // Подключаем небольшой CSS (чтобы не рушить верстку)
  (function addBaseCss(){
    var css = document.createElement('style');
    css.id = 'rt-omdb-css';
    css.textContent = `
      .rt-badge{white-space:nowrap}
      .rt-hide{display:none !important}
    `;
    document.head.appendChild(css);
  })();

  // ====== Меню настроек ======
  function openSettingsModal() {
    var api = getApiKey();
    var hide = getHideTmdb();

    var $wrap = $('<div class="about" style="padding:1em"></div>');
    var $title = $('<div class="about__title">Rotten Tomatoes (OMDb)</div>');
    var $descr = $('<div class="about__text" style="opacity:.8;margin-bottom:1em">Введите OMDb API ключ и (опционально) отключите TMDB-рейтинг в карточках.</div>');
    var $input = $('<input type="text" class="input" placeholder="OMDb API key" style="width:100%;margin:.5em 0 1em 0">').val(api);
    var $toggle = $('<label class="checkbox"><input type="checkbox"><span>Скрывать TMDB-рейтинг</span></label>');
    $toggle.find('input')[0].checked = hide;

    var $row = $('<div style="display:flex;gap:.6em;margin-top:1em"></div>');
    var $save = $('<div class="button selector">Сохранить</div>');
    var $cancel = $('<div class="button selector">Закрыть</div>');

    $row.append($save, $cancel);
    $wrap.append($title, $descr, $input, $toggle, $row);

    Lampa.Modal.open({
      title: 'Настройки плагина',
      html: $wrap,
      size: 'medium',
      onBack: function () { Lampa.Modal.close(); }
    });

    $save.on('click', function(){
      var newApi = ($input.val() || '').trim();
      var newHide = !!$toggle.find('input')[0].checked;
      Lampa.Storage.set(STORAGE_KEY_API, newApi);
      Lampa.Storage.set(STORAGE_KEY_HIDE_TMDB, newHide);
      // принудительно применим скрытие прямо сейчас
      applyHideTmdbIn(document.body);
      Lampa.Noty.show('Сохранено');
      Lampa.Modal.close();
    });
    $cancel.on('click', function(){ Lampa.Modal.close(); });

    // Фокус для пульта
    Lampa.Controller.add('rt_settings', {
      toggle: function(){},
      left: function(){},
      right: function(){},
      up: function(){},
      down: function(){},
      back: function(){ Lampa.Modal.close(); }
    });
    Lampa.Controller.toggle('rt_settings');
  }

  // Добавим пункт в системные Настройки (как у interface_mod — отдельный подпункт)
  function registerSettingsEntry() {
    if (!Lampa.Settings || !Lampa.Settings.add) return;

    // Группа “more” обычно есть в Лампе — поместим туда
    Lampa.Settings.add({
      title: 'Rotten Tomatoes (OMDb)',
      group: ['more', 'Ещё'],
      subtitle: 'RT критики и зрители · OMDb',
      onSelect: function(){ openSettingsModal(); },
      onLong: function(){ openSettingsModal(); }
    });

    // На изменение настроек (если кто-то правит Storage со стороны)
    Lampa.Settings.listener.follow('open', function(e){
      if (e.name === 'more') {
        // актуализируем скрытие
        applyHideTmdbIn(document.body);
      }
    });
  }

  // ====== Основной хук на карточку ======
  function hookFullCards() {
    Lampa.Listener.follow('full', function(e){
      if (e.type !== 'complite' || !e.data || !e.data.movie) return;

      var render = e.object && e.object.activity ? e.object.activity.render() : null;
      if (!render) return;

      // Применяем скрытие TMDB по опции
      applyHideTmdbIn(render);

      // Попросим OMDb
      fetchRT(e.data.movie, function (res) {
        if (!render) return;
        injectBadges(render, res.critics, res.audience);
      }, function(err){
        // Тихо: не шумим пользователю — плагин не должен мешать
        // Lampa.Noty.show('RT/OMDb: ' + err);
      });
    });
  }

  // ====== Запуск ======
  function start() {
    if (window.rt_omdb_plugin_started) return;
    window.rt_omdb_plugin_started = true;

    // Регистрация настроек
    registerSettingsEntry();
    // Сразу применим скрытие TMDB, если включено
    applyHideTmdbIn(document.body);
    // Хук карточек
    hookFullCards();
  }

  start();
})();
