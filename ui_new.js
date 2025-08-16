/**
 * Lampa plugin: Hide Details Noise
 *  - Duration (movies)
 *  - Seasons/Episodes + Next-air (series)
 *  - Comments section (entire block between Actors and Recommendations/Collection)
 *
 * Version: 1.6.0 (ASCII-safe, stable)
 * Author: Roman + ChatGPT
 *
 * Совместимость:
 *  - Селекторы full-start*, full-start-new*.
 *  - События 'full' (build/open/complite) + MutationObserver (без дублей).
 *  - ES5, без NodeList.forEach/Set/WeakSet; RU-строки в регэкспах — через \uXXXX.
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ----------------- helpers -----------------

  function textOf(node) { return (node && (node.textContent || node.innerText) || '').trim(); }
  function removeNode(node){ if (node && node.parentNode) node.parentNode.removeChild(node); }
  function hideNode(node){ if (!node) return; node.style.display = 'none'; node.setAttribute('data-hds-hidden','1'); }
  function isPureNumber(txt){ return /^\d+$/.test((txt || '').trim()); }
  function contains(a,b){ try { return !!(a && b && a.contains(b)); } catch(e){ return false; } }

  function isTimeToken(s){ return /^\d{1,2}:\d{2}$/.test((s || '').trim()); }

  // Разделитель: сплиты Лампы или одиночные символы . • · | /
  function isSeparatorNode(el){
    if (!el) return false;
    var cls = (el.className || '') + '';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(txt);
  }

  function cleanupLeadingSeparators(container){
    if (!container) return;
    var first = container.firstElementChild;
    while (first && isSeparatorNode(first)) {
      removeNode(first);
      first = container.firstElementChild;
    }
  }

  // ----------------- series detection (ASCII-safe) -----------------

  var RU_SEASON  = '(?:\\u0441\\u0435\\u0437\\u043e\\u043d(?:\\u0430|\\u044b|\\u043e\\u0432)?)';
  var RU_EPISODE = '(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u0441\\u0435\\u0440\\u0438\\u0438|\\u0441\\u0435\\u0440\\u0438\\u0439)';

  var RE_LABEL = new RegExp('^(?:' + RU_SEASON + '|' + RU_EPISODE + '|seasons?|episodes?)\\s*:?$', 'i');
  var RE_INLINE_SEASON  = new RegExp('^(?:' + RU_SEASON + '|seasons?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_EPISODE = new RegExp('^(?:' + RU_EPISODE + '|episodes?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_NUM_FIRST_SEASON  = new RegExp('^\\d+\\s*(?:' + RU_SEASON + '|seasons?)$', 'i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:' + RU_EPISODE + '|episodes?)$', 'i');

  function isSeriesLabelToken(txt){ return !!txt && RE_LABEL.test(txt); }
  function isSeriesInlineToken(txt){
    return !!txt && (
      RE_INLINE_SEASON.test(txt) ||
      RE_INLINE_EPISODE.test(txt) ||
      RE_INLINE_NUM_FIRST_SEASON.test(txt) ||
      RE_INLINE_NUM_FIRST_EPISODE.test(txt)
    );
  }

  // ----------------- "Next air" detection (ASCII-safe) -----------------

  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(txt){
    if (!txt) return false;
    var t = (txt || '').trim().toLowerCase();
    return /^\d{1,2}$/.test(t) ||
           new RegExp('^' + RU_MONTH + '$', 'i').test(t) ||
           new RegExp('^' + EN_MONTH + '$', 'i').test(t) ||
           /^\d{4}$/.test(t);
  }

  var RE_NEXT_LABEL = new RegExp(
    '^(?:' +
      '\\u0421\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449' +
        '(?:\\u0430\\u044f|\\u0438\\u0439|\\u0435\\u0435|\\u0438\\u0435)?' +
        '(?:\\s+(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u044d\\u043f\\u0438\\u0437\\u043e\\u0434))?' +
      '|next(?:\\s+(?:episode|ep))?' +
    ')\\s*:?', 'i'
  );
  var RE_REMAIN_LABEL  = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?\\s*\\d+\\s*$', 'i');

  function isNextLabelToken(txt){ return !!txt && RE_NEXT_LABEL.test(txt); }
  function isRemainLabelToken(txt){ return !!txt && RE_REMAIN_LABEL.test(txt); }
  function isRemainInlineToken(txt){ return !!txt && RE_REMAIN_INLINE.test(txt); }

  // ----------------- details line cleanup -----------------

  function stripTokensIn(container){
    if (!container) return;

    var spans = container.querySelectorAll('span');
    var toRemove = [];
    var i, span, txt;

    for (i = 0; i < spans.length; i++) {
      span = spans[i];
      if (!span) continue;
      txt = textOf(span);

      // фильмы: HH:MM
      if (isTimeToken(txt)) {
        var p1 = span.previousElementSibling, n1 = span.nextElementSibling;
        if (isSeparatorNode(p1)) toRemove.push(p1); else if (isSeparatorNode(n1)) toRemove.push(n1);
        toRemove.push(span);
        continue;
      }

      // сериалы: inline сезоны/серии
      if (isSeriesInlineToken(txt)) {
        var p2 = span.previousElementSibling, n2 = span.nextElementSibling;
        if (isSeparatorNode(p2)) toRemove.push(p2); else if (isSeparatorNode(n2)) toRemove.push(n2);
        toRemove.push(span);
        continue;
      }

      // сериалы: раздельные "Сезоны|Серии" + число
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

      // сериалы: "Следующая … / Осталось дней: N"
      if (isNextLabelToken(txt) || isRemainInlineToken(txt)) {
        var pN = span.previousElementSibling;
        if (isSeparatorNode(pN)) toRemove.push(pN);
        toRemove.push(span);

        var cur = span.nextElementSibling, guard = 0;
        while (cur && guard++ < 20) {
          var tcur = textOf(cur);
          if (isSeparatorNode(cur) || isDatePiece(tcur) ||
              isRemainInlineToken(tcur) || isRemainLabelToken(tcur) || isPureNumber(tcur)) {
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

    // удалить без дублей
    var uniq = [], j;
    for (j = 0; j < toRemove.length; j++) if (uniq.indexOf(toRemove[j]) === -1) uniq.push(toRemove[j]);
    for (j = 0; j < uniq.length; j++) removeNode(uniq[j]);

    cleanupLeadingSeparators(container);
  }

  function scanDetails(root){
    var scope = root || document;
    var nodes = scope.querySelectorAll(SELECTORS_DETAILS);
    var i; for (i = 0; i < nodes.length; i++) stripTokensIn(nodes[i]);
  }

  function observeDetails(element){
    if (!element || element.getAttribute('data-hds-observed') === '1') return;
    var pending = false;
    var obs = new MutationObserver(function(){
      if (pending) return; pending = true;
      setTimeout(function(){ pending = false; stripTokensIn(element); }, 0);
    });
    obs.observe(element, { childList: true, subtree: true });
    element.setAttribute('data-hds-observed','1');
  }

  function attachDetailsObservers(root){
    var nodes = (root || document).querySelectorAll(SELECTORS_DETAILS);
    var i; for (i = 0; i < nodes.length; i++) observeDetails(nodes[i]);
  }

  // ----------------- comments section killer -----------------

  var RE_ACTORS = /^(?:\u0410\u043a\u0442\u0435\u0440\u044b|\u0410\u043a\u0442\u0451\u0440\u044b|\u0412\u0020\u0440\u043e\u043b\u044f\u0445|actors?|cast)$/i;
  var RE_RECS   = /^(?:\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446[^\n\r]*|recommendations?)$/i;
  var RE_COLL   = /^(?:\u041a\u043e\u043b\u043b\u0435\u043a\u0446[^\n\r]*|collections?)$/i;
  var RE_COMM_WORD = /(?:\u041a\u043e\u043c\u043c\u0435\u043d\u0442|\bcomments?\b)/i;

  function findFirstHeading(re, root){
    var scope = root || document;
    var nodes = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');
    var i, n, t;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i]; t = textOf(n);
      if (t && re.test(t)) return n;
    }
    return null;
  }

  function climbToSection(el, maxUp){
    var up = el, steps = 0; maxUp = maxUp || 8;
    while (up && steps++ < maxUp){
      if (up.parentElement && (up.previousElementSibling || up.nextElementSibling)) return up;
      up = up.parentElement;
    }
    return el;
  }

  function looksLikeComments(el){
    if (!el) return false;
    if (el.querySelector('[class*="comment"],[id*="comment"]')) return true;
    var head = el.querySelector('h1,h2,h3,h4,h5,h6,div,span');
    if (head && RE_COMM_WORD.test(textOf(head))) return true;
    var plusBtn = el.querySelector('button,div,span');
    if (plusBtn && textOf(plusBtn) === '+') return true;
    return false;
  }

  // Прячем всё между секцией «Актёры» и ближайшей из «Рекомендации» или «Коллекция»
  function hideBlockBetweenActorsAndNext(root){
    var scope = root || document;
    var headA = findFirstHeading(RE_ACTORS, scope);
    if (!headA) {
      // запасной путь: снести явные comments-контейнеры
      var any = scope.querySelectorAll('[class*="comment"],[id*="comment"]');
      var i; for (i = 0; i < any.length; i++) hideNode(any[i]);
      // и заголовки "Комментарии"
      var heads = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span');
      for (i = 0; i < heads.length; i++) { if (RE_COMM_WORD.test(textOf(heads[i]))) hideNode(heads[i]); }
      return;
    }

    var secA = climbToSection(headA, 10);

    // Идем вперёд по соседям до ближайшего заголовка "Рекомендации" ИЛИ "Коллекция"
    var cursor = secA.nextElementSibling;
    var guard = 0;
    while (cursor && guard++ < 80) {
      // если текущий узел содержит заголовок "Рекомендации" или "Коллекция" — стоп
      var head = cursor.querySelector ? cursor.querySelector('h1,h2,h3,h4,h5,h6,div,span') : null;
      var title = head ? textOf(head) : '';
      if ((title && (RE_RECS.test(title) || RE_COLL.test(title))) ||
          (head && (RE_RECS.test(textOf(head)) || RE_COLL.test(textOf(head))))) {
        break;
      }

      // скрываем блоки, похожие на комментарии, и любые пустые/служебные отступы
      if (looksLikeComments(cursor) ||
          cursor.querySelector && cursor.querySelector('[class*="comment"],[id*="comment"]') ||
          (textOf(cursor) === '' && (!cursor.children || cursor.children.length <= 1))) {
        hideNode(cursor);
        cursor = cursor.nextElementSibling;
        continue;
      }

      // если это явно другая содержательная секция — остановимся, чтобы не снести лишнего
      var hasClearHeader = head && textOf(head) && !RE_COMM_WORD.test(textOf(head));
      if (hasClearHeader) break;

      cursor = cursor.nextElementSibling;
    }
  }

  // CSS-заплатка: вырубить всё, где встречается "comment" в классах/ID (только в карточке full)
  function injectCssOnce(){
    if (document.getElementById('hds-comments-css')) return;
    var style = document.createElement('style');
    style.id = 'hds-comments-css';
    style.type = 'text/css';
    style.textContent =
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"]{display:none !important;}';
    document.head.appendChild(style);
  }

  // Корневой наблюдатель — чтобы блок не возвращался
  var rootObserved = false;
  function ensureRootObserver(){
    if (rootObserved || !document.body) return;
    var pending = false;
    var obs = new MutationObserver(function(){
      if (pending) return; pending = true;
      setTimeout(function(){
        pending = false;
        hideBlockBetweenActorsAndNext(document);
        injectCssOnce();
      }, 50);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    rootObserved = true;
  }

  // ----------------- Lampa events & boot -----------------

  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type === 'build' || e.type === 'open' || e.type === 'complite') {
      setTimeout(function(){
        scanDetails(document);
        attachDetailsObservers(document);
        hideBlockBetweenActorsAndNext(document);
        injectCssOnce();
        ensureRootObserver();
      }, 50);
    }
  }

  function subscribeOnce(){
    if (typeof window === 'undefined' || typeof window.Lampa === 'undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);

    setTimeout(function(){
      scanDetails(document);
      attachDetailsObservers(document);
      hideBlockBetweenActorsAndNext(document);
      injectCssOnce();
      ensureRootObserver();
    }, 200);

    return true;
  }

  (function waitForLampa(tries){
    tries = tries || 0;
    if (subscribeOnce()) return;
    if (tries < 200) {
      setTimeout(function(){ waitForLampa(tries + 1); }, 200);
    } else {
      setTimeout(function(){
        scanDetails(document);
        attachDetailsObservers(document);
        hideBlockBetweenActorsAndNext(document);
        injectCssOnce();
        ensureRootObserver();
      }, 200);
    }
  })();

})();

