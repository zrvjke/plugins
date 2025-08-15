// Lampa plugin for CUB interface: hide quality badges and info, remove comment sections, and add semiвЂ‘transparent backgrounds to genres.
// This plugin is designed after a careful study of Lampa's source code and various community plugins. It uses heuristics
// rather than strict class names to detect and remove quality information (BDRip, 4K, etc.) and comments, and
// to apply a consistent background to genre tags. It works by scanning both list cards and full detail pages.

(function() {
  'use strict';
  // Ensure we have access to Lampa and prevent multiple injections
  if (!window.Lampa || window.hideQualityCubPluginInjected) return;
  window.hideQualityCubPluginInjected = true;

  /**
   * Determine whether a string looks like a quality badge (e.g., 4K, WEBвЂ‘DL, HDRip, etc.).
   * Returns false for numeric ratings or the TV label.
   *
   * @param {string} text The text to evaluate.
   * @returns {boolean} True if the text looks like a quality indicator.
   */
  function isQualityText(text) {
    if (!text) return false;
    var t = text.trim().toUpperCase();
    if (!t) return false;
    // Exclude purely numeric strings (ratings) and the TV badge
    if (/^\d+(\.\d+)?$/.test(t) || t === 'TV') return false;
    // Known quality tokens
    var list = [
      '4K', '8K', 'HD', 'FHD', 'FULLHD', 'UHD', 'BD', 'BDRIP', 'HDRIP', 'HDR',
      'WEBDL', 'WEB-DL', 'WEB', 'WEBRIP', 'HDTV', 'TS', 'CAM', 'CAMRIP',
      'DVDRIP', 'DVDSCR', 'DVD', '360P', '480P', '720P', '1080P', '2160P',
      '1440P', 'HDR10'
    ];
    if (list.indexOf(t) !== -1) return true;
    // Match tokens inside longer strings (e.g., "BluRay 1080p")
    return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|8K|2160P|1080P|720P|360P|480P)/i.test(t);
  }

  /**
   * Hide quality badges on list cards. Scans spans and divs inside `.card` elements and hides
   * those whose inner text matches a quality pattern.
   *
   * @param {Element} [root=document] Optional root element to limit the search scope.
   */
  function hideQualityBadges(root) {
    var scope = root || document;
    var elements = scope.querySelectorAll('.card span, .card div');
    elements.forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (isQualityText(txt)) {
        el.style.display = 'none';
      }
    });
  }

  /**
   * Remove quality information and comment sections from the full detail view. This function
   * runs after a detail view is fully constructed. It hides `.tag--quality`, removes
   * information rows that start with "Quality" (or its translations) or contain quality tokens,
   * removes known comment containers, and removes sections headed by words like
   * "Comments" or "РћС‚Р·С‹РІС‹".
   */
  function cleanFullView() {
    try {
      // Hide the quality tag near the poster
      document.querySelectorAll('.tag--quality').forEach(function(tag) {
        tag.remove();
      });
      // Remove info rows in various sections
      var selectors = [
        '.full-start__info span',
        '.full-start-new__info span',
        '.full-descr__info span'
      ].join(',');
      document.querySelectorAll(selectors).forEach(function(span) {
        var text = (span.textContent || '').trim();
        if (!text) return;
        var lower = text.toLowerCase();
        // Try to get translation of "player_quality"
        var qKey = '';
        try {
          qKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
        } catch (e) {
          qKey = '';
        }
        if ((qKey && lower.startsWith(qKey)) || lower.startsWith('quality') || lower.startsWith('РєР°С‡РµСЃС‚РІРѕ')) {
          span.remove();
          return;
        }
        if (isQualityText(text)) {
          span.remove();
        }
      });
      // Remove comment containers by class
      document.querySelectorAll('.full-reviews, .full__reviews').forEach(function(el) {
        var parent = el.closest('.items-line');
        if (parent) parent.remove(); else el.remove();
      });
      // Also remove sections whose heading looks like "Comments" or "РћС‚Р·С‹РІС‹"
      document.querySelectorAll('h2, h3, .full-descr__title, .section-title').forEach(function(heading) {
        var text = (heading.textContent || '').trim();
        if (/РєРѕРјРјРµРЅС‚|comment|РѕС‚Р·С‹РІ/i.test(text)) {
          var container = heading.closest('.items-line') || heading.parentNode;
          if (container) container.remove();
        }
      });
    } catch (err) {
      // swallow errors to avoid breaking the page
    }
  }

  /**
   * Apply a semiвЂ‘transparent background to genre and tag elements. We identify
   * candidate spans that likely contain genres (no colon, no digits, and contain
   * commas or pipes) and tag counters in `.full-descr__tags`.
   */
  function styleGenres() {
    // Inject style only once
    if (!document.getElementById('cub-genre-style')) {
      var st = document.createElement('style');
      st.id = 'cub-genre-style';
      st.textContent = [
        '.genre-badge {',
        '  background: rgba(0,0,0,0.4);',
        '  padding: 0.2em 0.5em;',
        '  border-radius: 0.3em;',
        '  color: #fff;',
        '  margin-right: 0.3em;',
        '  display: inline-block;',
        '  font-size: 0.95em;',
        '}',
        '.full-descr__tags .tag-count {',
        '  background: rgba(0,0,0,0.4);',
        '  border-radius: 0.3em;',
        '  padding: 0.2em 0.5em;',
        '  color: #fff;',
        '}',
      ].join('\n');
      document.head.appendChild(st);
    }
    // Apply class to likely genre spans
    var infoSpans = document.querySelectorAll(
      '.full-start__info span, .full-start-new__info span, .full-descr__info span'
    );
    infoSpans.forEach(function(span) {
      var text = (span.textContent || '').trim();
      if (!text) return;
      if (text.indexOf(':') !== -1) return;
      if (/\d/.test(text)) return;
      if (text.indexOf(',') !== -1 || text.indexOf('|') !== -1) {
        span.classList.add('genre-badge');
      }
    });
    // Apply class to tag counters
    document.querySelectorAll('.full-descr__tags .tag-count').forEach(function(el) {
      el.classList.add('genre-badge');
    });
  }

  /**
   * Callback for the "full" event indicating that a detail view has been opened. We use
   * a short timeout to ensure the view is fully rendered before cleaning and styling.
   *
   * @param {Object} event Event data passed by Lampa.Listener.follow
   */
  function onFull(event) {
    if (event && event.type === 'complite') {
      setTimeout(function() {
        cleanFullView();
        styleGenres();
      }, 250);
    }
  }

  // Register the full event listener if available
  if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
    Lampa.Listener.follow('full', onFull);
  }

  // Initial hiding on page load
  hideQualityBadges();
  // Observe DOM changes to hide newly added quality badges
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) hideQualityBadges(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Register plugin metadata if API is available (optional). If not present, the
  // plugin will still function but won't show up in the Plugins list.
  try {
    if (window.Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
      Lampa.Plugin.create({
        name: 'Hide Quality & Comments',
        version: '1.0.3',
        description: 'Hides quality badges and info, removes comments, and styles genres (CUB).',
        type: 'card',
        icon: '\uD83D\uDCF2'
      });
    }
  } catch (e) {
    // ignore if registration fails
  }
})();
