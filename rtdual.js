(function () {
  'use strict';

  // ---- Константы/ключи хранения
  var COMP_ID = 'rtdual';
  var STORAGE_KEY = 'rtdual_settings'; // { api_key: string, hide_tmdb: bool }
  var OMDB = 'https://www.omdbapi.com/';
  var cache = Object.create(null);

  // ---- Настройки
  function getSettings() {
    return Lampa.Storage.get(STORAGE_KEY, { api_key: '', hide_tmdb: false });
  }
  function setSettings(s) {
    Lampa.Storage.set(STORAGE_KEY, s);
  }

  // Добавляем пункт в "Настройки" -> "Остальное"
  Lampa.SettingsApi.addComponent({
    component: COMP_ID,
    name: 'Rotten Tomatoes (OMDb)',
    icon: '🍅',
    category: 'more',
    onRender: function (body) {
      var s = getSettings();

      body.append(Lampa.Template.get('settings_input', {
        title: 'OMDb API ключ',
        name: 'omdb_key',
        type: 'text',
        value: s.api_key
      }));

      body.append(Lampa.Template.get('settings_switch', {
        title: 'Скрывать рейтинг TMDb',
        name: 'hide_tmdb',
        value: !!s.hide_tmdb
      }));
    },
    onChange: function (name, value) {
      var s = getSettings();
      if (name === 'omdb_key') {
        s.api_key = String(value || '').trim();
        setSettings(s);
      }
      if (name === 'hide_tmdb') {
        s.hide_tmdb = !!value;
        setSettings(s);
      }
    }
  });

  // ---- Вспомогалки сети
  function fetchJSON(url) {
    return fetch(url).then(function (r) { return r.json(); }).catch(function(){ return null; });
  }
  function fetchTEXT(url) {
    return fetch(url).then(function (r) { return r.text(); }).catch(function(){ return ''; });
  }

  // ---- Получение рейтингов
  async function getRtRatings(opts) {
    var s = getSettings();
    if (!s.api_key) return { error: 'NO_KEY' };

    var imdb = opts.imdb || '';
    var title = opts.title || '';
    var year = opts.year || '';

    var cacheKey = imdb || (title + '|' + year);
    if (cache[cacheKey]) return cache[cacheKey];

    var qs = imdb ? ('i=' + encodeURIComponent(imdb))
                  : ('t=' + encodeURIComponent(title) + (year ? '&y=' + encodeURIComponent(year) : ''));

    var data = await fetchJSON(OMDB + '?apikey=' + s.api_key + '&' + qs + '&plot=short&r=json');
    if (!data || data.Error) return { error: 'OMDB_ERROR' };

    // Tomatometer из массива Ratings
    var tomatometer = null;
    if (Array.isArray(data.Ratings)) {
      var rt = data.Ratings.find(function (r) { return r.Source === 'Rotten Tomatoes'; });
      if (rt && rt.Value) tomatometer = rt.Value; // "92%"
    }

    // Audience Score попробуем вынуть со страницы RT, если ссылка есть
    var audience = null;
    if (data.Website && /rottentomatoes\.com/i.test(data.Website)) {
      var html = await fetchTEXT(data.Website);
      var m = html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
      if (m) audience = m[1] + '%';
    }

    var result = { tomatometer: tomatometer, audience: audience };
    cache[cacheKey] = result;
    return result;
  }

  // ---- Вставка рейтинга в карточку
  function injectRating(root, t, a) {
    // не дублировать
    if (root.find('.rtdual-rating').length) return;

    var value = (t ? ('🍅 ' + t) : '🍅 —') + '  ' + (a ? ('🍿 ' + a) : '🍿 —');

    // В строку с рейтингами, как остальные источники
    var html =
      '<div class="rating rtdual-rating">' +
        '<div class="source">Rotten Tomatoes</div>' +
        '<div class="value">' + value + '</div>' +
      '</div>';

    var host = root.find('.full--rating');
    if (host.length) host.append(html);
    else root.find('.full-info').append('<div class="rtdual-rating" style="margin-top:8px;color:#fff;">' + value + '</div>');
  }

  // ---- Скрыть TMDb при необходимости
  function hideTmdbIfNeeded(root) {
    var s = getSettings();
    if (!s.hide_tmdb) return;

    root.find('.full--rating .rating').each(function () {
      var $r = $(this);
      var text = ($r.find('.source,.title').text() || '').toLowerCase();
      if (text.indexOf('tmdb') !== -1) $r.remove();
    });
  }

  // ---- Основной хук
  Lampa.Listener.follow('full', function (e) {
    if (e.type !== 'complite') return;

    var body = e.body || $(document); // на всякий
    var card = e.data && (e.data.movie || e.data.tv || e.data) || {};

    var imdb = card.imdb_id || card.imdb || '';
    var title = card.title || card.name || '';
    var year  = card.release_year || card.year || '';

    hideTmdbIfNeeded(body);

    if (!imdb && !title) return;

    getRtRatings({ imdb: imdb, title: title, year: year }).then(function (res) {
      if (res && res.error === 'NO_KEY') {
        if (!window.__rtdual_warned) {
          window.__rtdual_warned = true;
          Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках (Остальное).');
        }
        return;
      }
      if (!res || res.error) return;
      injectRating(body, res.tomatometer, res.audience);
    });
  });
})();
