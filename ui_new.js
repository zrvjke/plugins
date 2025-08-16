/**
 * Плагин для Lampa: Скрытие лишних деталей
 *  - Фильмы: удаляет HH:MM из строки деталей.
 *  - Сериалы: удаляет Сезоны/Серии + "Следующая … / Осталось дней: N" из строки деталей.
 *  - Удаляет секцию комментариев (по заголовкам/классам и между Актёры → Рекомендации/Коллекция).
 *  - Удаляет блоки сезонов (например, "Сезон 1").
 *  - Удаление из DOM + принудительный пересчёт для исключения фокуса/остановок при скролле.
 *
 * Версия: 1.7.7 (Unicode-safe, ES5)
 * Автор: Roman + Grok
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function textOf(node) { return (node && (node.textContent || node.innerText) || '').trim(); }
  function removeNode(n) { if (n && n.parentNode) n.parentNode.removeChild(n); }
  function isPureNumber(s) { return /^\d+$/.test((s || '').trim()); }
  function isTimeToken(s) { return /^\d{1,2}:\d{2}$/.test((s || '').trim()); }
  function norm(s) { return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function isSeparatorNode(el) {
    if (!el) return false;
    var cls = (el.className || '') + '';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(txt);
  }
  function cleanupLeadingSeparators(container) {
    if (!container) return;
    var first = container.firstElementChild;
    while (first && isSeparatorNode(first)) {
      removeNode(first);
      first = container.firstElementChild;
    }
  }
  // Принудительный пересчёт для исключения фокуса, усиленный
  function forceReflow() {
    try {
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
      var scrollers = document.querySelectorAll('.scroll, .content, .layout__body, .full, .full-start, .full-start-new');
      for (var i = 0; i < scrollers.length; i++) {
        var top = scrollers[i].scrollTop;
        scrollers[i].scrollTop = top + 1;
        scrollers[i].scrollTop = top;
      }
      // Дополнительно, если Lampa имеет кастомные события
      if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.send('full', {type: 'update'});
      }
    } catch (e) {}
  }

  // ---------- series tokens ----------
  var RU_SEASON = '(?:\\u0441\\u0435\\u0437\\u043e\\u043d(?:\\u0430|\\u044b|\\u043e\\u0432)?)';
  var RU_EPISODE = '(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u0441\\u0435\\u0440\\u0438\\u0438|\\u0441\\u0435\\u0440\\u0438\\u0439)';

  var RE_LABEL = new RegExp('^(?:' + RU_SEASON + '|' + RU_EPISODE + '|seasons?|episodes?)\\s*:?$', 'i');
  var RE_INLINE_SEASON = new RegExp('^(?:' + RU_SEASON + '|seasons?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_EPISODE = new RegExp('^(?:' + RU_EPISODE + '|episodes?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_NUM_FIRST_SEASON = new RegExp('^\\d+\\s*(?:' + RU_SEASON + '|seasons?)$', 'i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:' + RU_EPISODE + '|episodes?)$', 'i');

  function isSeriesLabelToken(t) { return !!t && RE_LABEL.test(norm(t)); }
  function isSeriesInlineToken(t) {
    return !!t && (RE_INLINE_SEASON.test(norm(t)) || RE_INLINE_EPISODE.test(norm(t)) ||
                   RE_INLINE_NUM_FIRST_SEASON.test(norm(t)) || RE_INLINE_NUM_FIRST_EPISODE.test(norm(t)));
  }

  // ---------- next-air tokens ----------
  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(t) {
    if (!t) return false;
    var s = norm(t);
    return /^\d{1,2}$/.test(s) || new RegExp('^' + RU_MONTH + '$', 'i').test(s) ||
           new RegExp('^' + EN_MONTH + '$', 'i').test(s) || /^\d{4}$/.test(s);
  }
  var RE_NEXT_LABEL = new RegExp('^(?:\\u0441\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449(?:\\u0430\\u044f|\\u0438\\u0439|\\u0435\\u0435|\\u0438\\u0435)?(?:\\s+(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u044d\\u043f\\u0438\\u0437\\u043e\\u0434))?|next(?:\\s+(?:episode|ep))?)\\s*:?\\s*$', 'i');
  var RE_REMAIN_LABEL = new RegExp('^(?:\\u043e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u043e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?[\\s\\d]+$', 'i');

  function isNextLabelToken(t) { return !!t && RE_NEXT_LABEL.test(norm(t)); }
  function isRemainLabelToken(t) { return !!t && RE_REMAIN_LABEL.test(norm(t)); }
  function isRemainInlineToken(t) { return !!t && RE_REMAIN_INLINE.test(norm(t)); }

  // ---------- details line cleanup ----------
  function stripTokensIn(container) {
    if (!container) return;
    var spans = container.querySelectorAll('span');
    var rm = [], i, s, txt;

    for (i = 0; i < spans.length; i++) {
      s = spans[i]; if (!s) continue; txt = textOf(s);

      // Movies: HH:MM
      if (isTimeToken(txt)) {
        var p1 = s.previousElementSibling, n1 = s.nextElementSibling;
        if (isSeparatorNode(p1)) rm.push(p1);
        if (isSeparatorNode(n1)) rm.push(n1);
        rm.push(s); continue;
      }
      // Series: inline seasons/episodes
      if (isSeriesInlineToken(txt)) {
        var p2 = s.previousElementSibling, n2 = s.nextElementSibling;
        if (isSeparatorNode(p2)) rm.push(p2);
        if (isSeparatorNode(n2)) rm.push(n2);
        rm.push(s); continue;
      }
      // Series: split "label" + number
      if (isSeriesLabelToken(txt)) {
        var left = s.previousElementSibling; if (isSeparatorNode(left)) rm.push(left);
        var n = s.nextElementSibling; if (isSeparatorNode(n)) { rm.push(n); n = s.nextElementSibling; }
        if (n && isPureNumber(textOf(n))) {
          var after = n.nextElementSibling; if (isSeparatorNode(after)) rm.push(after);
          rm.push(n);
        } else {
          var rsep = s.nextElementSibling; if (isSeparatorNode(rsep)) rm.push(rsep);
        }
        rm.push(s); continue;
      }
      // Series: "Next … / Days left: N"
      if (isNextLabelToken(txt) || isRemainInlineToken(txt)) {
        var pn = s.previousElementSibling; if (isSeparatorNode(pn)) rm.push(pn);
        rm.push(s);
        var cur = s.nextElementSibling, guard = 0;
        while (cur && guard++ < 20) {
          var tc = textOf(cur);
          if (isSeparatorNode(cur) || isDatePiece(tc) || isPureNumber(tc) ||
              isRemainInlineToken(tc) || isRemainLabelToken(tc)) { rm.push(cur); cur = cur.nextElementSibling; continue; }
          break;
        }
        continue;
      }
      if (isRemainLabelToken(txt)) {
        var pr = s.previousElementSibling; if (isSeparatorNode(pr)) rm.push(pr);
        var nr = s.nextElementSibling; if (isSeparatorNode(nr)) { rm.push(nr); nr = nr.nextElementSibling; }
        if (nr && isPureNumber(textOf(nr))) {
          var an = nr.nextElementSibling; if (isSeparatorNode(an)) rm.push(an);
          rm.push(nr);
        } else {
          var r2 = s.nextElementSibling; if (isSeparatorNode(r2)) rm.push(r2);
        }
        rm.push(s); continue;
      }
    }
    // dedup & remove
    var uniq = [], j; for (j = 0; j < rm.length; j++) if (uniq.indexOf(rm[j]) === -1) uniq.push(rm[j]);
    for (j = 0; j < uniq.length; j++) removeNode(uniq[j]);
    cleanupLeadingSeparators(container);
  }
  function scanDetails(root) {
    var scope = root || document, nodes = scope.querySelectorAll(SELECTORS_DETAILS), i;
    for (i = 0; i < nodes.length; i++) stripTokensIn(nodes[i]);
  }
  function observeDetails(el) {
    if (!el || el.getAttribute('data-hds-observed') === '1') return;
    var pend = false, mo = new MutationObserver(function() { if (pend) return; pend = true; setTimeout(function() { pend = false; stripTokensIn(el); }, 0); });
    mo.observe(el, { childList: true, subtree: true }); el.setAttribute('data-hds-observed', '1');
  }
  function attachDetailsObservers(root) {
    var nodes = (root || document).querySelectorAll(SELECTORS_DETAILS), i;
    for (i = 0; i < nodes.length; i++) observeDetails(nodes[i]);
  }

  // ---------- sections to remove (comments & seasons) ----------
  var RE_ACTORS = new RegExp('^(?:\\u0410\\u043a\\u0442\\u0451\\u0440\\u044b|\\u0410\\u043a\\u0442\\u0435\\u0440\\u044b|\\u0412\\s+\\u0440\\u043e\\u043b\\u044f\\u0445|actors?|cast)$', 'i');
  var RE_RECS = new RegExp('^(?:\\u0420\\u0435\\u043a\\u043e\\u043c\\u0435\\u043d\\u0434\\u0430\\u0446[^\\n\\r]*|recommendations?)$', 'i');
  var RE_COLL = new RegExp('^(?:\\u041a\\u043e\\u043b\\u043b\\u0435\\u043a\\u0446[^\\n\\r]*|collections?)$', 'i');
  var RE_COMM_HEAD = new RegExp('^(?:\\u043a\\u043e\\u043c\\u043c\\u0435\\u043d\\u0442\\u0430\\u0440\\u0438\\u0438|comments?|reviews|\\u043e\\u0442\\u0437\\u044b\\u0432\\u044b)$', 'i');
  var RE_SEASONS_HEAD = new RegExp('^(?:' + RU_SEASON + '(?:\\s*\\d+)?|seasons?(?:\\s*\\d+)?)$', 'i');

  var COMM_CLASS_SELECTOR = '[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]';

  function findFirstHeading(re, root) {
    var scope = root || document, nodes = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'), i, n, t;
    for (i = 0; i < nodes.length; i++) { n = nodes[i]; t = norm(textOf(n)); if (t && re.test(t)) return n; }
    return null;
  }
  function climbToSection(el, maxUp) {
    var up = el, steps = 0; maxUp = maxUp || 8;
    while (up && steps++ < maxUp) {
      if (up.parentElement && (up.previousElementSibling || up.nextElementSibling)) return up;
      up = up.parentElement;
    }
    return el;
  }
  function removeSectionNode(node) {
    if (!node) return;
    var prev = node.previousElementSibling;
    removeNode(node);
    // Зачистка пустых прокладок
    while (prev && norm(textOf(prev)) === '' && (!prev.children || prev.children.length === 0)) {
      var p = prev.previousElementSibling;
      removeNode(prev);
      prev = p;
    }
  }

  // A) По заголовку — удалить целую секцию комментариев
  function nukeCommentsByHeading(root) {
    var scope = root || document;
    var heads = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i, h, t, sec;
    for (i = 0; i < heads.length; i++) {
      h = heads[i]; t = norm(textOf(h));
      if (t && RE_COMM_HEAD.test(t)) {
        sec = climbToSection(h, 10);
        removeSectionNode(sec);
        // Удаляем цепочку следующих элементов, если они пустые или часть комментариев
        var cur = sec.nextElementSibling, guard = 0;
        while (cur && guard++ < 20) {
          if (norm(textOf(cur)) === '' || looksLikeComments(cur)) {
            var next = cur.nextElementSibling;
            removeSectionNode(cur);
            cur = next;
          } else {
            break;
          }
        }
      }
    }
  }

  function looksLikeComments(el) {
    if (!el) return false;
    if (el.querySelector(COMM_CLASS_SELECTOR)) return true;
    var head = el.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
    if (head && RE_COMM_HEAD.test(norm(textOf(head)))) return true;
    var plusBtn = el.querySelector('button,div,span');
    if (plusBtn && textOf(plusBtn) === '+') return true;
    return false;
  }

  // B) Удалить всё между «Актёры» ←→ первой из (Рекомендации|Коллекция)
  function nukeBetweenActorsAndNext(root) {
    var scope = root || document;
    var hActors = findFirstHeading(RE_ACTORS, scope);
    var hNext = findFirstHeading(RE_RECS, scope) || findFirstHeading(RE_COLL, scope);
    if (!hNext) {
      var any = scope.querySelectorAll(COMM_CLASS_SELECTOR), i;
      for (i = 0; i < any.length; i++) removeSectionNode(any[i]);
      return;
    }
    var secActors = hActors ? climbToSection(hActors, 10) : null;
    var secNext = climbToSection(hNext, 10);

    var cur = secNext.previousElementSibling, guard = 0;
    while (cur && guard++ < 80) {
      if (secActors && cur === secActors) break;
      var looks = looksLikeComments(cur);
      if (looks || (norm(textOf(cur)) === '' && (!cur.children || cur.children.length <= 1))) {
        var next = cur.previousElementSibling;
        removeSectionNode(cur);
        cur = next;
        continue;
      }
      break;
    }
  }

  // C) По классам/ID — добивка
  function nukeByClasses(root) {
    var scope = root || document, nodes = scope.querySelectorAll(COMM_CLASS_SELECTOR), i;
    for (i = 0; i < nodes.length; i++) removeSectionNode(nodes[i]);
  }

  // D) Секции сезонов (большой блок) — цепочное удаление до актёров
  function nukeSeasonsSections(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i, el, t, sec;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i]; t = norm(textOf(el));
      if (t && RE_SEASONS_HEAD.test(t)) {
        sec = climbToSection(el, 10);
        var cur = sec;
        var guard = 0;
        while (cur && guard++ < 20) {
          var h = cur.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
          if (h && RE_ACTORS.test(norm(textOf(h)))) {
            break;
          }
          var next = cur.nextElementSibling;
          removeSectionNode(cur);
          cur = next;
        }
      }
    }
  }

  function nukeAllNoise(root) {
    nukeCommentsByHeading(root);
    nukeBetweenActorsAndNext(root);
    nukeByClasses(root);
    nukeSeasonsSections(root);
    forceReflow();
  }

  // ---------- CSS safety net ----------
  function injectCssOnce() {
    if (document.getElementById('hds-comments-css')) return;
    var style = document.createElement('style');
    style.id = 'hds-comments-css';
    style.type = 'text/css';
    style.textContent =
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"],' +
      '.full [class*="review"], .full-start [class*="review"], .full-start-new [class*="review"],' +
      '.full [id*="review"], .full-start [id*="review"], .full-start-new [id*="review"]{' +
      'display:none !important; visibility:hidden !important; pointer-events:none !important;}' +
      '[data-hds-hidden]{display:none !important; visibility:hidden !important; pointer-events:none !important;}';
    document.head.appendChild(style);
  }

  // ---------- root observer ----------
  var rootObserved = false;
  function ensureRootObserver() {
    if (rootObserved || !document.body) return;
    var pend = false, mo = new MutationObserver(function() {
      if (pend) return; pend = true;
      setTimeout(function() {
        pend = false;
        scanDetails(document);
        nukeAllNoise(document);
        injectCssOnce();
      }, 30);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    rootObserved = true;
  }

  // ---------- events & boot ----------
  function handleFullEvent(e) {
    if (!e || !e.type) return;
    if (e.type === 'build' || e.type === 'open' || e.type === 'complite') {
      setTimeout(function() {
        scanDetails(document);
        attachDetailsObservers(document);
        nukeAllNoise(document);
        injectCssOnce();
        ensureRootObserver();
      }, 50);
    }
  }
  function subscribeOnce() {
    if (typeof window === 'undefined' || typeof window.Lampa === 'undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(function() {
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    }, 200);
    return true;
  }
  (function waitForLampa(tries) {
    tries = tries || 0;
    if (subscribeOnce()) return;
    if (tries < 200) setTimeout(function() { waitForLampa(tries + 1); }, 200);
    else setTimeout(function() {
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    }, 200);
  })();

})();
