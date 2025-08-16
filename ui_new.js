/**
 * Lampa plugin: Remove movie duration & series tokens (seasons/episodes)
 * Version: 1.1.0
 * Author: Roman + ChatGPT
 *
 * Удаляет:
 *  - у фильмов: токен времени HH:MM (напр., 02:14) + соседний разделитель;
 *  - у сериалов: "Сезоны: N" / "Серии: M" (и их варианты на RU/EN) + соседние разделители.
 *
 * Работает на старой и новой вёрстке (full-start*, full-start-new*),
 * страхуется от повторных дорисовок (MutationObserver) и реагирует на события 'full'.
 */

(function () {
  'use strict';

  var SELECTORS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------- helpers --------------------------------------------------------

  function textOf(node) {
    return (node && (node.textContent || node.innerText) || '').trim();
  }

  function isTimeToken(s) {
    return /^\d{1,2}:\d{2}$/.test((s || '').trim());
  }

  // Разделитель: фирменные классы Lampa или одиночные символы . • · |
  function isSeparatorNode(el) {
    if (!el) return false;
    var cls = (el.className || '') + '';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|]$/.test(txt);
  }

  // RU/EN варианты "Сезоны/Сезон/Сезонов" / "Серии/Серия/Серий" / "Season(s)" / "Episode(s)"
  function isSeriesLabelToken(txt) {
    if (!txt) return false;
    var t = txt.toLowerCase();
    // допускаем двоеточие на конце
    if (/(^|\s)(сезон(ы|ов)?|серия|серии|серий)\s*:?$/.test(t)) return true;
    if (/(^|\s)(season|seasons|episode|episodes)\s*:?$/.test(t)) return true;
    return false;
  }

  // Единичный спан, где уже вместе "Сезоны: 3" / "Seasons 3"
  function isSeriesInlineToken(txt) {
    if (!txt) return false;
    var t = txt.toLowerCase();
    // RU
    if (/^сезон(ы|ов)?\s*:?\s*\d+$/i.test(t)) return true;
    if (/^сер(ия|ии|ий)\s*:?\s*\d+$/i.test(t)) return true;
    // EN
    if (/^season(s)?\s*:?\s*\d+$/i.test(t)) return true;
    if (/^episode(s)?\s*:?\s*\d+$/i.test(t)) return true;
    return false;
  }

  function isPureNumber(txt) {
    return /^\d+$/.test((txt || '').trim());
  }

  function removeNode(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }

  // Удалить разделитель слева или справа от указанного узла (если есть)
  function removeAdjacentSeparator(node) {
    if (!node) return;
    var prev = node.previousElementSibling;
    var next = node.nextElementSibling;
    if (isSeparatorNode(prev)) { removeNode(prev); return; }
    if (isSeparatorNode(next)) { removeNode(next); return; }
  }

  // Если после удалений остался разделитель в начале контейнера — подчистим
  function cleanupLeadingSeparators(container) {
    if (!container) return;
    var first = container.firstElementChild;
    while (first && isSeparatorNode(first)) {
      removeNode(first);
      first = container.firstElementChild;
    }
  }

  // ---------- core: pass over container -------------------------------------

  function stripTokensIn(container) {
    if (!container) return;

    // Собираем к удалению, чтобы не путаться со сменой соседей во время прохода
    var toRemove = new Set();
    var toCleanLeading = false;

    var spans = container.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      if (!span || toRemove.has(span)) continue;

      var txt = textOf(span);

      // 1) Фильмы: время HH:MM
      if (isTimeToken(txt)) {
        var prev = span.previousElementSibling;
        var next = span.nextElementSibling;
        if (isSeparatorNode(prev)) toRemove.add(prev);
        else if (isSeparatorNode(next)) toRemove.add(next);
        toRemove.add(span);
        toCleanLeading = true;
        continue;
      }

      // 2) Сериалы: inline-токен ("Сезоны: 3" / "Seasons 3" / "Серии 8")
      if (isSeriesInlineToken(txt)) {
        removeAdjacentSeparator(span); // сразу, чтобы корректно убирать крайние точки
        toRemove.add(span);
        toCleanLeading = true;
        continue;
      }

      // 3) Сериалы: раздельные спаны "Сезоны:" + "3"
      if (isSeriesLabelToken(txt)) {
        // Сепаратор слева от метки
        var leftSep = span.previousElementSibling;
        if (isSeparatorNode(leftSep)) toRemove.add(leftSep);

        // Число может быть в следующем спане
        var num = span.nextElementSibling;
        if (num && isPureNumber(textOf(num))) {
          // Сепаратор справа от числа
          var rightSep = num.nextElementSibling;
          if (isSeparatorNode(rightSep)) toRemove.add(rightSep);
          toRemove.add(num);
        } else {
          // Если числа нет, попробуем убрать разделитель справа от метки
          var rightSep2 = span.nextElementSibling;
          if (isSeparatorNode(rightSep2)) toRemove.add(rightSep2);
        }

        toRemove.add(span);
        toCleanLeading = true;
        continue;
      }
    }

    // Удаляем накопленное
    toRemove.forEach(removeNode);

    if (toCleanLeading) cleanupLeadingSeparators(container);
  }

  function scan(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll(SELECTORS);
    nodes.forEach(stripTokensIn);
  }

  // ---------- observers (без дублей) ----------------------------------------

  var observed = new WeakSet();

  function observeDetails(element) {
    if (!element || observed.has(element)) return;

    var pending = false;
    var obs = new MutationObserver(function (muts) {
      // Лёгкий дебаунс, чтобы дождаться пачки мутаций
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        setTimeout(function () {
          pending = false;
          stripTokensIn(element);
        }, 0);
      });
    });

    obs.observe(element, { childList: true, subtree: true });
    observed.add(element);
  }

  function attachObserversIn(root) {
    var nodes = (root || document).querySelecto


