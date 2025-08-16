/**
 * Lampa plugin: Hide Duration (movies) & Seasons/Episodes & Next-air (series)
 * Version: 1.3.1 (ASCII-safe, stabilized)
 * Author: Roman + ChatGPT
 *
 * Фильмы: скрывает HH:MM и соседний разделитель.
 * Сериалы: скрывает "Сезоны/Серии" (RU/EN) и блок "Следующая <дата> / Осталось дней: N"
 *          вместе с левым разделителем. Работает и если весь блок в одном <span>.
 *
 * Совместимость: full-start*, full-start-new*, события 'full' (build/open/complite),
 * MutationObserver без дублей, ES5, ASCII-safe (\uXXXX).
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

  // Метка без числа
  var RE_LABEL = new RegExp('^(?:' + RU_SEASON + '|' + RU_EPISODE + '|seasons?|episodes?)\\s*:?$', 'i');

  // Inline "метка + число" и "число + метка"
  var RE_INLINE_SEASON = new RegExp('^(?:' + RU_SEASON + '|seasons?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_EPISODE = new RegExp('^(?:' + RU_EPISODE + '|episodes?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_NUM_FIRST_SEASON = new RegExp('^\\d+\\s*(?:' + RU_SEASON + '|seasons?)$', 'i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:' + RU_EPISODE + '|episodes?)$', 'i');

  function isSeriesLabelToken(txt) {
    return !!txt && RE_LABEL.test(txt);
  }
  function isSeriesInlineToken(txt) {
    return !!txt && (
      RE_INLINE_SEASON.test(txt) ||
      RE_INLINE_EPISODE.test(txt) ||
      RE_INLINE_NUM_FIRST_SEASON.test(txt) ||
      RE_INLINE_NUM_FIRST_EPISODE.test(txt)
    );
  }

  // ----------------- "Next air" detection (ASCII-safe) -----------------

  // RU months (genitive)
  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  // EN months
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(txt) {
    if (!txt) return false;
    var t = (txt || '').trim().toLowerCase();
    return /^\d{1,2}$/.test(t) || new RegExp('^' + RU_MONTH + '$', 'i').test(t) ||
           new RegExp('^' + EN_MONTH + '$', 'i').test(t) || /^\d{4}$/.test(t);
  }

  // "Следующая/Следующий/Следующее/Следующие [серия/эпизод]?" / "Next [episode]?"
  var RE_NEXT_LABEL = new RegExp(
    '^(?:' +
      '\\u0421\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449' +
        '(?:\\u0430\\u044f|\\u0438\\u0439|\\u0435\\u0435|\\u0438\\u0435)?' +
        '(?:\\s+(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u044d\\u043f\\u0438\\u0437\\u043e\\u0434))?' +
      '|next(?:\\s+(?:episode|ep))?' +
    ')\\s*:?', 'i'
  );

  // "Осталось дней" / "Days left" (отдельная метка или inline с числом)
  var RE_REMAIN_LABEL = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?\\s*\\d+\\s*$', 'i');

  function isNextLabelToken(txt)   { return !!txt && RE_NEXT_LABEL.test(txt); }
  function isRemainLabelToken(txt) { return !!txt && RE_REMAIN_LABEL.test(txt); }
  function isRemainInlineToken(txt){ return !!txt && RE_REMAIN_INLINE.test(txt); }

  // ----------------- core per-container -----------------

  function stripTokensIn(container) {
    if (!container) return;

    var spans = container.querySelectorAll('span');
    var toRemove = [];
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

      // 2) СЕРИАЛЫ: inline "Сезоны/Серии"
      if (isSeriesInlineToken(txt)) {
        var p2 = span.previousElementSibling;
        var n2 = span.nextElementSibling;
        if (isSeparatorNode(p2)) toRemove.push(p2);
        else if (isSeparatorNode(n2)) toRemove.push(n2);
        toRemove.push(span);
        continue;
      }

      // 3) СЕРИАЛЫ: раздельные "Сезоны"/"Серии" + число
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

      // 4) СЕРИАЛЫ: "Следующая … / Осталось дней: N"
      // Может быть полностью в одном <span>, тогда просто убираем его целиком.
      if (isNextLabelToken(txt) || isRemainInlineToken(txt) ||
          (txt && /\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439/i.test(txt))) {
        var pN = span.previousElementSibling;
        if (isSeparatorNode(pN)) toRemove.push(pN); // левую точку перед блоком
        toRemove.push(span);

        // Если блок разбит на несколько спанов — подчистим всё справа:
        var cur = span.nextElementSibling;
        var guard = 0;
        while (cur && guard++ < 20) {
          var tcur = textOf(cur);
          if (isSeparatorNode(cur) || isDatePiece(tcur) ||
              isRemainInlineToken(tcur) || isRemainLabelToken(tcur) ||
              isPureNumber(tcur)) {
            toRemove.push(cur);
            cur = cur.nextElementSibling;
            continue;
          }
          break;
        }
        continue;
      }

      // 5) СЕРИАЛЫ: если «Осталось дней: N» встречается отдельно
      if (isRemainInlineToken(txt) || isRemainLabelToken(txt)) {
        var pR1 = span.previousElementSibling;
        var nR1 = span.nextElementSibling;
        if (isSeparatorNode(pR1)) toRemove.push(pR1);
        if (isSeparatorNode(nR1)) toRemove.push(nR1);

        // если это только метка, удалим и число после неё
        if (isRemainLabelToken(txt) && nR1 && isPureNumber(textOf(nR1))) {
          var afterNr = nR1.nextElementSibling;
          if (isSeparatorNode(afterNr)) toRemove.push(afterNr);
          toRemove.push(nR1);
        }
        toRemove.push(span);
        continue;
      }
    }

    // удаляем без дублей
    var uniq = [];
    for (i = 0; i < toRemove.length; i++) if (uniq.indexOf(toRemove[i]) === -1) uniq.push(toRemove[i]);
    for (i = 0; i < uniq.length; i++) removeNode(uniq[i]);

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
      setTimeout(function () {
        scan(document);
        attachObserversIn(document);
      }, 50);
    }
  }

  function subscribeOnce() {
    if (typeof window === 'undefined' || typeof window.Lampa === 'undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);

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
      setTimeout(function () { waitForLampa(tries + 1); }, 200);
    } else {
      setTimeout(function () {
        scan(document);
        attachObserversIn(document);
      }, 200);
    }
  })();

})();
