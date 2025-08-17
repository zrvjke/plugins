/*
 * Runtime Red — минимальный плагин для Lampa.
 * Показывает ПРИМЕРНОЕ время серии (для сериалов) и длительность фильмов.
 * Время всегда выделяется красным цветом.
 *
 * Автор: ChatGPT (GPT-5 Thinking)
 * Версия: 1.0.0
 */

(function () {
  'use strict';

  if (!window.Lampa) return;

  var PLUGIN_ID = 'runtime-red';
  var STYLE_ID  = 'runtime-red-style';

  // --------- helpers ---------
  function avg(arr) {
    if (!arr || !arr.length) return 0;
    var sum = 0, n = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = parseInt(arr[i], 10);
      if (isFinite(v) && v > 0 && v <= 200) { // отбрасываем мусорные значения
        sum += v;
        n++;
      }
    }
    return n ? Math.round(sum / n) : 0;
  }

  function minutesToText(min) {
    min = parseInt(min, 10) || 0;
    if (min <= 0) return '';
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h > 0 && m > 0) return h + ' ч ' + m + ' мин';
    if (h > 0)           return h + ' ч';
    return m + ' мин';
  }

  // приблизительная длительность серии для сериалов
  function approxEpisodeRuntime(movie) {
    // TMDB чаще всего заполняет episode_run_time: [43, 45, ...]
    if (Array.isArray(movie && movie.episode_run_time) && movie.episode_run_time.length) {
      var a = avg(movie.episode_run_time);
      if (a) return a;
    }

    // иногда есть last_episode_to_air.runtime
    if (movie && movie.last_episode_to_air && movie.last_episode_to_air.runtime) {
      var le = parseInt(movie.last_episode_to_air.runtime, 10);
      if (isFinite(le) && le > 0) return le;
    }

    // реже — runtime у объектов episodes/seasons (если Lampa их подгрузила)
    if (movie && Array.isArray(movie.seasons)) {
      var pool = [];
      for (var i = 0; i < movie.seasons.length; i++) {
        var s = movie.seasons[i];
        if (s && Array.isArray(s.episodes)) {
          for (var j = 0; j < s.episodes.length; j++) {
            var ep = s.episodes[j];
            if (ep && ep.runtime) pool.push(ep.runtime);
          }
        }
      }
      var b = avg(pool);
      if (b) return b;
    }

    return 0;
  }

  function movieRuntime(movie) {
    // обычные фильмы: movie.runtime (минуты)
    var r = parseInt(movie && movie.runtime, 10);
    if (isFinite(r) && r > 0) return r;

    // иногда приходит array runtime (крайне редко)
    if (Array.isArray(movie && movie.runtime) && movie.runtime.length) {
      var a = avg(movie.runtime);
      if (a) return a;
    }
    return 0;
  }

  function isTv(movie) {
    // признаки сериала
    if (!movie) return false;
    if (movie.media_type === 'tv') return true;
    if (movie.first_air_date && !movie.release_date) return true;
    if (movie.number_of_seasons || movie.episode_run_time) return true;
    return false;
  }

  // вставка/обновление бейджа
  function upsertBadge(container, text) {
    if (!text) return;
    // пробуем найти зону с "деталями"
    var details = container.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
    var host;
    if (details.length) {
      host = details.eq(0);
    } else {
      // резерв: под заголовком
      host = container.find('.full-start-new__title, .full-start__title').parent();
      if (!host.length) host = container; // последний шанс
    }

    // удаляем старый экземпляр
    host.find('.runtime-red__badge').remove();

    var badge = $('<span class="runtime-red__badge"></span>').text(text);
    // если это блок с элементами <span>, поддержим визуально
    if (host.hasClass('full-start-new__details') || host.hasClass('full-start__details')) {
      // добавим расстояние
      badge.css({marginLeft: '0.5em'});
    } else {
      // иначе просто разместим на новой строке рядом
      badge.css({display: 'inline-block', marginLeft: '0.5em'});
    }

    // Вставляем:
    // 1) если в host уже есть элементы, добавим в конец,
    // 2) иначе просто аппендим.
    if (host.children().length) host.append(badge);
    else host.append(badge);
  }

  // --------- styles ---------
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      '.runtime-red__badge{',
      '  background: #e74c3c;',
      '  color: #fff;',
      '  display: inline-block;',
      '  padding: .18em .6em;',
      '  border-radius: .35em;',
      '  line-height: 1.2;',
      '  font-size: 1.05em;',
      '  white-space: nowrap;',
      '}'
    ].join('');
    document.head.appendChild(css);
  }

  // --------- main logic ---------
  function onFull(e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity || !e.data || !e.data.movie) return;
    try {
      var movie = e.data.movie || {};
      var root  = $(e.object.activity.render());
      var text  = '';

      if (isTv(movie)) {
        var approx = approxEpisodeRuntime(movie);
        if (approx > 0) text = '≈ ' + minutesToText(approx);
      } else {
        var min = movieRuntime(movie);
        if (min > 0) text = minutesToText(min);
      }

      if (text) upsertBadge(root, text);
    } catch (err) {
      // тихо, чтобы не ломать страницу
      console && console.warn && console.warn('['+PLUGIN_ID+']', err);
    }
  }

  // подписка
  Lampa.Listener.follow('full', onFull);

  // регистрация в списке плагинов (чтобы было видно в настройках)
  try {
    Lampa.Plugin.create(PLUGIN_ID, function(plugin) {
      plugin.run = function () {};
      plugin.destroy = function () {};
    });
  } catch (e) { /* старые версии Lampa могут не иметь Plugin.create — это нормально */ }

  console.log('[%s] loaded', PLUGIN_ID);
})();
