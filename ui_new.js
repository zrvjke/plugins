/**
 * Lampa plugin: Hide Duration (movies) & Seasons/Episodes & Next-air (series)
 * Version: 1.3.0 (ASCII-safe, stable)
 * Author: Roman + ChatGPT
 *
 * Что делает:
 *  - ФИЛЬМЫ: удаляет длительность HH:MM и соседний разделитель.
 *  - СЕРИАЛЫ:
 *      • удаляет "Сезоны/Серии" (RU/EN) — inline и разнесённые по спанам, с разделителями;
 *      • удаляет блок "Следующая <дата> / Осталось дней: N" (RU/EN), включая левый разделитель.
 *
 * Совместимость:
 *  - Селекторы full-start* и full-start-new*.
 *  - Реагирует на события 'full' (build/open/complite) и подчищает любые
 *    последующие перерисовки через MutationObserver (без дублей наблюдателей).
 *  - ES5, ASCII-safe (\uXXXX), без NodeList.forEach/Set/WeakSet.
 */

(function () {
  'use strict';

  var SELECTORS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ----------------- helpers -----------------

  function textOf(node) {
    return (node && (node.textContent || node.innerText) || '').trim();
  }

  function isTimeToken(s) {
    return /^\d{1,2}:\d{2}$/.test((s || '').trim());
  }

  // Разделитель: фирменные split-элементы или одиночные символы . • · | /
  function isSeparatorNode(el) {
    if (!el) return false;
    var cls = (el.className || '') + '';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(txt);
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function cleanupLeadingSeparators(container) {
    if (!container) return;
    var first = container.firstElementChild;
    while (first && isSeparatorNode(first)) {
      removeNode(first);
      first = container.firstElementChild;
    }
  }

  function isPureNumber(txt) {
    return /^\d+$/.test((txt || '').trim());
  }

  // ----------------- series detection (ASCII-safe) -----------------

  // RU "сезон(а|ы|ов)?"
  var RU_SEASON = '(?:\\u0441\\u0435\\u0437\\u043e\\u043d(?:\\u0430|\\u044b|\\u043e\\u0432)?)';
  // RU "серия|серии|серий"
  var RU_EPISODE = '(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u0441\\u0435\\u0440\\u0438\\u0438|\\u0441\\u0435\\u0440\\u0438\\u0439)';

  // Метка без числа: "Сезоны:" / "Серии:" / "Seasons:" / "Episodes:"
  var RE_LABEL = new RegExp('^(?:' + RU_SEASON + '|' + RU_EPISODE + '|seasons?|episodes?)\\s*:?$', 'i');

  // Inline "метка + число": "Сезоны: 3", "Seasons 3", "Серии 8"
  var RE_INLINE_SEASON = new RegExp('^(?:' + RU_SEASON + '|seasons?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_EPISODE = new RegExp('^(?:' + RU_EPISODE + '|episodes?)\\s*:?\\s*\\d+$', 'i');

  // Inline "число + метка": "3 сезона", "8 серий", "3 seasons", "8 episodes"
  var RE_INLINE_NUM_FIRST_SEASON = new RegExp('^\\d+\\s*(?:' + RU_SEASON + '|seasons?)$', 'i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:' + RU_EPISODE + '|episodes?)$', 'i');

  function isSeriesLabelToken(txt) {
    if (!txt) return false;
    return RE_LABEL.test(txt);
  }

  function isSeriesInlineToken(txt) {
    if (!txt) return false;
    return RE_INLINE_SEASON.test(txt) ||
           RE_INLINE_EPISODE.test(txt) ||
           RE_INLINE_NUM_FIRST_SEASON.test(txt) ||
           RE_INLINE_NUM_FIRST_EPISODE.test(txt);
  }

  // ----------------- "Next air" detection (ASCII-safe) -----------------

  // RU months (genitive): января ... декабря
  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  // EN months (short/full)
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(txt) {
    if (!txt) return false;
    var t = (txt || '').trim().toLowerCase();
    return /^\d{1,2}$/.test(t) ||                 // day number
           new RegExp('^' + RU_MONTH + '$', 'i').test(t) ||
           new RegExp('^' + EN_MONTH + '$', 'i').test(t) ||
           /^\d{4}$/.test(t);                      // year
  }

  // "Следующая ..." / "Next ..."
  var RE_NEXT_LABEL = new RegExp('^(?:\\u0421\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449[\\u0430\\u0438\\u0435]?|next)\\b\\s*:?', 'i');

  // "Осталось дней: N" / "Days left: N"
  var RE_REMAIN_LABEL = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?\\s*\\d+\\s*$', 'i');

  function isNextLabelToken(txt) {
    if (!txt) return false;
    return RE_NEXT_LABEL.test(txt);
  }
  function isRemainLabelToken(txt) {
    if (!txt) return false;
    return RE_REMAIN_LABEL.test(txt);
  }
  function isRemainInlineToken(txt) {
    if (!txt) return false;
    return RE_REMAIN_INLINE.test(txt);
  }

  // ----------------- core per-container -----------------

  function stripTokensIn(container) {
    if (!container) return;

    var spans = container.querySelectorAll('span');
    var toRemove = []; // массив, потом дедуп
    var i, span, txt;

    for (i = 0; i < spans.length; i++) {
      span = spans[i];
      if (!span) continue;

      txt = textOf(span);

      // 1) ФИЛЬМЫ: время HH:MM
      if (isTimeToken(txt)) {
        var p1 = span.previousElementSibling;
        var n1 = span.nextElementSibling;
        if (isSeparatorNode(p1)) toRemove.push(p1);
        else if (isSeparatorNode(n1)) toRemove.push(n1);
        toRemove.push(span);
        continue;
      }

      // 2) СЕРИАЛЫ: inline токены (метка+число или число+метка)
      if (isSeriesInlineToken(txt)) {
        var p2 = span.previousElementSibling;
        var n2 = span.nextElementSibling;
        if (isSeparatorNode(p2)) toRemove.push(p2);
        else if (isSeparatorNode(n2)) toRemove.push(n2);
        toRemove.push(span);
        continue;
      }

      // 3) СЕРИАЛЫ: раздельные спаны "Сезоны" [split?] "3"
      if (isSeriesLabelToken(txt)) {
        var leftSep = span.previousElementSibling;
        if (isSeparatorNode(leftSep)) toRemove.push(leftSep);

        var n = span.nextElementSibling;
        if (isSeparatorNode(n)) { toRemove.push(n); n = span.nextElementSibling; }

        if (n && isPureNumber(textOf(n))) {
          var afterNum = n.nextElementSibling;
          if (isSeparatorNode(afterNum)) toRemove.push(afterNum);
          toRemove.push(n);
        } else {
          var rsep = span.nextElementSibling;
          if (isSeparatorNode(rsep)) toRemove.push(rsep);
        }

        toRemove.push(span);
        continue;
      }

      // 4) СЕРИАЛЫ: "Следующая <дата> ..."  (RU/EN)
      if (isNextLabelToken(txt)) {
        var pN = span.previousElementSibling;
        if (isSeparatorNode(pN)) toRemove.push(pN); // левую точку перед блоком

        // Удаляем сам лейбл
        toRemove.push(span);

        // Удаляем последовательные кусочки даты и разделители (/, split)
        var cur = span.nextElementSibling;
        var guard = 0;
        while (cur && guard++ < 10) { // ограничим, чтобы не съесть лишнее
          var tcur = textOf(cur);
          if (isSeparatorNode(cur) || isDatePiece(tcur)) {
            toRemove.push(cur);
            cur = cur.nextElementSibling;
            continue;
          }
          break;
        }
        continue;
      }

      // 5) СЕРИАЛЫ: "Осталось дней: N"
      if (isRemainInlineToken(txt)) {
        var pR1 = span.previousElementSibling;
        var nR1 = span.nextElementSibling;
        if (isSeparatorNode(pR1)) toRemove.push(pR1);
        else if (isSeparatorNode(nR1)) toRemove.push(nR1);
        toRemove.push(span);
        continue;
      }
      if (isRemainLabelToken(txt)) {
        var pR = span.previousElementSibling;
        if (isSeparatorNode(pR)) toRemove.push(pR);

        // возможен split после метки
        var nr = span.nextElementSibling;
        if (isSeparatorNode(nr)) { toRemove.push(nr); nr = span.nextElementSibling; }

        // число дней
        if (nr && isPureNumber(textOf(nr))) {
          var afterNr = nr.nextElementSibling;
          if (isSeparatorNode(afterNr)) toRemove.push(afterNr);
          toRemove.push(nr);
        } else {
          var rsep2 = span.nextElementSibling;
          if (isSeparatorNode(rsep2)) toRemove.push(rsep2);
        }

        toRemove.push(span);
        continue;
      }
    }

    // удаляем без дублей
    var uniq = [];
    for (i = 0; i < toRemove.length; i++) {
      if (uniq.indexOf(toRemove[i]) === -1) uniq.push(toRemove[i]);
    }
    for (i = 0; i < uniq.length; i++) removeNode(uniq[i]);

    // финальная подчистка: если контейнер теперь начинается с разделителя
    cleanupLeadingSeparators(container);
  }

  function scan(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(SELECTORS);
    var i;
    for (i = 0; i < nodes.length; i++) stripTokensIn(nodes[i]);
  }

  // ----------------- observers (без дублей) -----------------

  function observeDetails(element) {
    if (!element || element.getAttribute('data-hds-observed') === '1') return;

    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      // подождём тик, чтобы собрать пачку изменений
      setTimeout(function () {
        pending = false;
        stripTokensIn(element);
      }, 0);
    });

    obs.observe(element, { childList: true, subtree: true });
    element.setAttribute('data-hds-observed', '1');
  }

  function attachObserversIn(root) {
    var nodes = (root || document).querySelectorAll(SELECTORS);
    var i;
    for (i = 0; i < nodes.length; i++) observeDetails(nodes[i]);
  }

  // ----------------- Lampa events & boot -----------------

  function handleFullEvent(e) {
    if (!e || !e.type) return;
    if (e.type === 'build' || e.type === 'open' || e.type === 'complite') {
      // даём DOM «устаканиться»
      setTimeout(function () {
        scan(document);
        attachObserversIn(document);
      }, 50);
    }
  }

  function subscribeOnce() {
    if (typeof window === 'undefined' || typeof window.Lampa === 'undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);

    // первичный проход (если уже открыта карточка)
    setTimeout(function () {
      scan(document);
      attachObserversIn(document);
    }, 200);

    return true;
  }

  (function waitForLampa(tries) {
    tries = tries || 0;
    if (subscribeOnce()) return;
    if (tries < 200) {
      setTimeout(function () { waitForLampa(tries + 1); }, 200); // до ~40 сек
    } else {
      // запасной одноразовый проход
      setTimeout(function () {
        scan(document);
        attachObserversIn(document);
      }, 200);
    }
  })();

})();
