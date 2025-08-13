(function () {
  'use strict';

  // === Твой OMDb ключ ===
  var API_KEY = '63684232';

  // ===== Утилиты =====
  function log() {
    try { console.log.apply(console, ['[RT-ERL-like]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function colorClass(percent) {
    if (percent == null) return '';
    if (percent >= 70) return 'rt-green';
    if (percent >= 40) return 'rt-orange';
    return 'rt-red';
  }

  // ===== Иконки (вшиты, папки icons/ не нужны) =====
  var ICON_TOMATO = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Ccircle cx='128' cy='128' r='100' fill='%23ff3b30'/%3E%3Cpath d='M128 80c-15 0-28 6-38 16 6-18 24-32 38-36 14 4 32 18 38 36-10-10-23-16-38-16z' fill='%232ecc71'/%3E%3C/svg%3E";
  var ICON_POPCORN = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Crect x='64' y='64' width='128' height='160' rx='12' fill='%23ffd166'/%3E%3Cpath d='M80 64h16v160H80zM112 64h16v160h-16zM144 64h16v160h-16zM176 64h16v160h-16z' fill='%23ef476f'/%3E%3Ccircle cx='96' cy='56' r='20' fill='%23fff'/%3E%3Ccircle cx='160' cy='48' r='16' fill='%23fff'/%3E%3Ccircle cx='128' cy='44' r='18' fill='%23fff'/%3E%3C/svg%3E";

  // ===== Стили бейджей =====
  if (!document.getElementById('rt-erl-like-styles')) {
    var style = document.createElement('style');
    style.id = 'rt-erl-like-styles';
    style.textContent =
      ".rt-rate{display:inline-flex;align-items:center;gap:.35em;padding:.25em .5em;border-radius:.5em;background:rgba(255,255,255,.06);margin-left:.5em;font-weight:600;font-size:.95em}" +
      ".rt-rate img{width:16px;height:16px;display:block}" +
      ".rt-green{color:#59d36c}.rt-orange{color:#ffbf45}.rt-red{color:#ff6b6b}";
    document.head.appendChild(style);
  }

  // ===== DOM-helpers =====
  function ensureSlots(render) {
    var host = $('.info__rate', render);
    if (!host.length) host = $('.full-title__rate, .full-title__right, .full-title', render).first();
    if (!host.length) host = $('.full-title__left', render).first();
    if (!host.length) return null;

    if (!$('.rt-rate.rt-critics', host).length) {
      host.append('<div class="rt-rate rt-critics"><img alt="RT" src="' + ICON_TOMATO + '"><span class="rt-v">—</span></div>');
    }
    if (!$('.rt-rate.rt-audience', host).length) {
      host.append('<div class="rt-rate rt-audience"><img alt="AUD" src="' + ICON_POPCORN + '"><span class="rt-v">—</span></div>');
    }
    return host;
  }

  function setValues(render, critics, audience) {
    var host = ensureSlots(render); if (!host) return;
    var cEl = $('.rt-rate.rt-critics .rt-v', host);
    var aEl = $('.rt-rate.rt-audience .rt-v', host);

    var cVal = critics != null ? (critics + '%') : '—';
    var aVal = audience != null ? (audience + '%') : '—';

    cEl.text(cVal).removeClass('rt-green rt-orange rt-red').addClass(colorClass(critics));
    aEl.text(aVal).removeClass('rt-green rt-orange rt-red').addClass(colorClass(audience));
  }

  function pickQuery(movie) {
    var imdb = movie && (movie.imdb_id || movie.imdbId || (movie.external_ids && movie.external_ids.imdb_id));
    var title = (movie && (movie.name_ru || movie.title || movie.name || movie.original_title || movie.original_name)) || '';
    var year  = (movie && (movie.release_date || movie.first_air_date || movie.year || movie.release_year)) || '';
    if (typeof year === 'string' && year.length >= 4) year = year.slice(0,4);
    if (typeof year === 'string') {
      var m = year.match(/\d{4}/);
      year = m ? m[0] : '';
    }
    return { imdb: imdb, title: title, year: year };
  }

  // ===== Запрос к OMDb =====
  function fetchOMDb(query, done) {
    var url = 'https://www.omdbapi.com/?apikey=' + API_KEY + '&tomatoes=true&plot=short';
    if (query.imdb) url += '&i=' + encodeURIComponent(query.imdb);
    else if (query.title) {
      url += '&t=' + encodeURIComponent(query.title);
      if (query.year) url += '&y=' + encodeURIComponent(query.year);
    }

    var network = new Lampa.Reguest();
    network.timeout(10000);
    network.silent(
      url,
      function (json) {
        try {
          if (!json || json.Response === 'False') return done(null);
          var critics = null, audience = null;

          // Критики — из массива Ratings
          if (Array.isArray(json.Ratings)) {
            var rt = json.Ratings.find(function (r) { return r.Source === 'Rotten Tomatoes'; });
            if (rt && /%$/.test(rt.Value)) critics = parseInt(rt.Value, 10);
          }

          // Зрители — из tomatoUserMeter (если OMDb вернёт; иначе останется "—")
          if (json.tomatoUserMeter && String(json.tomatoUserMeter).trim() !== 'N/A') {
            var n = parseInt(json.tomatoUserMeter, 10);
            if (!isNaN(n)) audience = n;
          }

          done({ critics: critics, audience: audience, raw: json });
        } catch (e) {
          log('parse error', e); done(null);
        }
      },
      function (e) { log('OMDb error', e); done(null); }
    );
  }

  // ===== Хук на страницу описания =====
  function onFull(e) {
    if (e.type !== 'complite') return;
    var render = e.object.activity.render();
    var q = pickQuery(e.data.movie || {});
    ensureSlots(render);
    setValues(render, null, null);          // показываем "—" сразу
    fetchOMDb(q, function (res) {
      if (!res) return;
      setValues(render, res.critics, res.audience);
    });
  }

  // Подписываемся на событие Lampa
  if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('full', onFull);
  } else {
    log('Lampa environment not found');
  }

  // (Опционально) регистрируемся в списке плагинов, если есть API
  try {
    if (Lampa && Lampa.Plugins && Lampa.Plugins.register) {
      Lampa.Plugins.register('rt-erl-like', 'Rotten Tomatoes (OMDb Dual)', 'RT critics & audience via OMDb');
    }
  } catch (_) {}
})();
