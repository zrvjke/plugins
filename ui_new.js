/**
 * Lampa plugin: Hide Details Noise
 *  - Duration (movies)
 *  - Seasons/Episodes + Next-air (series)
 *  - Comments block (both movies & series)
 *
 * Version: 1.4.0 (ASCII-safe, stable)
 * Author: Roman + ChatGPT
 *
 * Совместимость:
 *  - Старые/новые селекторы: full-start*, full-start-new*.
 *  - События 'full' (build/open/complite) + MutationObserver (без дублей).
 *  - ES5, без NodeList.forEach/Set/WeakSet; все RU-строки в регэкспах — через \uXXXX.
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ----------------- helpers -----------------

  function textOf(node) {
    return (node && (node.textContent || node.innerText) || '').trim();
  }

  function isTimeToken(s) {
    return /^\d{1,2}:\d{2}$/.test((s || '').trim());
  }

  // Разделитель: сплиты Лампы или одиночные символы . • · | /
  function isSeparatorNode(el) {
    if (!el) return false;
    var cls = (el.className || '') + '';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(txt);
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function hideNode(node) {
    if (!node) return;
    node.style.display = 'none';
    node.setAttribute('data-hds-hidden', '1');
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

  // RU months (genitive) и EN months
  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(txt) {
    if (!txt) return false;
    var t = (txt || '').trim().toLowerCase();
    return /^\d{1,2}$/.test(t) ||
           new RegExp('^' + RU_MONTH + '$', 'i').test(t) ||
           new RegExp('^' + EN_MONTH + '$', 'i').test(t) ||
           /^\d{4}$/.test(t);
  }

  // "Следующая/Следующий/Следующее/Следующие [серия/эпизод]" / "Next (episode)"
  var RE_NEXT_LABEL = new RegExp(
    '^(?:' +
      '\\u0421\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449' +
        '(?:\\u0430\\u044f|\\u0438\\u0439|\\u0435\\u0435|\\u0438\\u0435)?' +
        '(?:\\s+(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u044d\\u043f\\u0438\\u0437\\u043e\\u0434))?' +
      '|next(?:\\s+(?:episode|ep))?' +
    ')\\s*:?', 'i'
  );

  // "Осталось дней" / "Days left"
  var RE_REMAIN_LABEL = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?\\s*\\d+\\s*$', 'i');

  function isNextLabelToken(txt)   { return !!txt && RE_NEXT_LABEL.test(txt); }
  function isRemainLabelToken(txt) { return !!txt && RE_REMAIN_LABEL.test(txt); }
  function isRemainInlineToken(txt){ return !!txt && RE_REMAIN_INLINE.test(txt); }

  // ----------------- comments block detection -----------------

  // Заголовок "Комментарии"/"Comments"
  var RE_COMMENTS_HEAD = new RegExp('^(?:\\u041a\\u043e\\u043c\\u043c\\u0435\\u043d\\u0442\\u0430\\u0440\\u0438\\u0438|comments?)$', 'i');

  function hideCommentsBlocks(root) {
    var scope = root || document;

    // 1) Прячем любые контейнеры с классами/ID, содержащими "comment"
    var nodes = scope.querySelectorAll('[class*="comment"], [id*="comment"]');
    var i, n;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.getAttribute('data-hds-hidden') === '1') continue;
      hideNode(n);
    }

    // 2) Прячем заголовки "Комментарии" и их секции целиком
    var heads = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    for (i = 0; i < heads.length; i++) {
      var h = heads[i];
      var t = textOf(h);
      if (!t) continue;
      if (RE_COMMENTS_HEAD.test(t)) {
        hideNode(h);
        // поднимаемся максимум на 4 уровня и прячем ближайший «секционный» контейнер, в котором есть *comment*
        var up = h, steps = 0;
        while (up && steps++ < 4) {
          if (up.querySelector && up.querySelector('[class*="comment"], [id*="comment"]')) {
            hideNode(up);
            break;
          }
          up = up.parentElement;
        }
      }
    }
  }

  // ----------------- core per-container (details line) -----------------

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

      // 2) СЕРИАЛЫ: inline "Сезоны/Серии" (обе формы)
      if (isSeriesInlineToken(txt)) {
        var p2 = span.previousElementSibling;
        var n2 = span.nextElementSibling;
        if (isSeparatorNode(p2)) toRemove.push(p2);
        else if (isSeparatorNode(n2)) toRemove.push(n2);
        toRemove.push(span);
        continue;
      }

      // 3) СЕРИАЛЫ: раздельные "Сезоны|Серии" + число
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
      if (isNextLabelToken(txt) || isRemainInlineToken(txt)) {
        var pN = span.previousElementSibling;
        if (isSeparatorNode(pN)) toRemove.push(pN);
        toRemove.push(span);

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

      if (isRemainLabelToken(txt)) {
        var pR = span.previousElementSibling;
        if (isSeparatorNode(pR)) toRemove.push(pR);

        var r = span.nextElementSibling;
        if (isSeparatorNode(r)) { toRemove.push(r); r = span.nextElementSibling; }

        if (r && isPureNumber(textOf(r))) {
          var afterR = r.nextElementSibling;
          if (isSeparatorNode(afterR)) toRemove.push(afterR);
          toRemove.push(r);
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
    for (i = 0; i < toRemove.length; i++) if (uniq.indexOf(toRemove[i]) === -1) uniq.push(toRemove[i]);
    for (i = 0; i < uniq.length; i++) removeNode(uniq[i]);

    cleanupLeadingSeparators(container);
  }

  function scanDetails(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(SELECTORS_DETAILS);
    var i;
    for (i = 0; i < nodes.length; i++) stripTokensIn(nodes[i]);
  }

  // ----------------- observers -----------------

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

  function attachDetailsObservers(root) {
    var nodes = (root || document).querySelectorAll(SELECTORS_DETAILS);
    var i;
    for (i = 0; i < nodes.length; i++) observeDetails(nodes[i]);
  }

  // Корневой наблюдатель для комментариев (и прочих поздних вставок)
  var rootObserved = false;
  function ensureRootObserver() {
    if (rootObserved || !document.body) return;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        hideCommentsBlocks(document);
      }, 50);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    rootObserved = true;
  }

  // ----------------- Lampa events & boot -----------------

  function handleFullEvent(e) {
    if (!e || !e.type) return;
    if (e.type === 'build' || e.type === 'open' || e.type === 'complite') {
      setTimeout(function () {
        scanDetails(document);
        attachDetailsObservers(document);
        hideCommentsBlocks(document);
        ensureRootObserver();
      }, 50);
    }
  }

  function subscribeOnce() {
    if (typeof window === 'undefined' || typeof window.Lampa === 'undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);

    // первичный проход (если уже открыта карточка)
    setTimeout(function () {
      scanDetails(document);
      attachDetailsObservers(document);
      hideCommentsBlocks(document);
      ensureRootObserver();
    }, 200);

    return true;
  }

  (function waitForLampa(tries) {
    tries = tries || 0;
    if (subscribeOnce()) return;
    if (tries < 200) {
      setTimeout(function () { waitForLampa(tries + 1); }, 200);
    } else {
      // запасной одноразовый проход
      setTimeout(function () {
        scanDetails(document);
        attachDetailsObservers(document);
        hideCommentsBlocks(document);
        ensureRootObserver();
      }, 200);
    }
  })();

})();

