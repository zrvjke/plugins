(function() {
  'use strict';

  // Настройки для ссылок на источник данных
  var SRC_GIST = 'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json';
  var SRC_JSDELIVR = 'https://cdn.jsdelivr.net/gh/zrvjke/plugins@main/kp-watched.json';
  var SRC_RAW_GH = 'https://raw.githubusercontent.com/zrvjke/plugins/main/kp-watched.json';

  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  var DEBUG = true;

  function noty(s) { try { if (DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); } catch (e) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Утилиты для работы с LocalStorage
  function readLS(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }

  function writeLS(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  // Загрузка данных с fallback-URL
  function fetchJSON(url, cb, eb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function() {
      if (x.readyState !== 4) return;
      if (x.status >= 200 && x.status < 300) {
        var txt = x.responseText || '';
        try { cb(JSON.parse(txt)); } catch (e) { eb && eb('parse'); }
      } else eb && eb('http ' + x.status);
    };
    x.onerror = function() { eb && eb('network'); };
    x.send();
  }

  // Основная функция для рендеринга флагов "просмотрено" / "не просмотрено"
  function renderAll(watched) {
    var list = findDetailsContainers();
    if (!list.length) { noty('details not found, retry…'); return false; }
    list.forEach(function(c) { renderInto(c, watched); });
    return true;
  }

  // Рендер флага в контейнер
  function renderInto(cont, watched) {
    if (!cont) return;
    var flag = cont.querySelector('.hds-watch-flag');
    if (!flag) {
      flag = document.createElement('span');
      flag.className = 'hds-watch-flag';
      flag.setAttribute('tabindex', '-1');
      cont.insertBefore(flag, cont.firstChild);
    }
    flag.setAttribute('data-state', watched ? 'watched' : 'unwatched');
    flag.textContent = watched ? '+ Просмотрено' : '– Не просмотрено';
    ensureSplitAfter(flag);
  }

  // Функция для отслеживания событий
  function onFull(e) {
    if (!e) return;
    if (e.type === 'build' || e.type === 'open' || e.type === 'complite') {
      noty('full:' + e.type);
      setTimeout(function() { kickoffWithRetries(0); observeBodyOnce(); }, 140);
    }
  }

  // Главная функция запуска
  function kickoffOnce() {
    var meta = activeMeta();
    if (!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    if (!renderAll(false)) return;

    withRemote(function() {
      var r = matchFromRemote(meta);
      if (r.ok) { renderAll(true); enableToggle(meta, r.key); noty('match: ' + r.src); return; }
      enableToggle(meta, r.key); // останется минус, но с локальным тумблером
    });
  }

  // Запуск плагина
  function boot() {
    if (!window.Lampa || !Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull); // Здесь подписка на событие "full"
    return true;
  }

  (function wait(i) { i = i || 0; if (boot()) return; if (i < 200) setTimeout(function() { wait(i + 1); }, 200); })();
})();




