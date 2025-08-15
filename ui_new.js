// Lampa plugin: hide quality badges, remove quality info/comments, style genre badges
// This script attempts to be as robust as possible by using broad selectors
// and by guarding against missing APIs. It will hide quality tags such as
// "4K", "BD", "HDRip", etc. from both list cards and the detail page, remove
// the quality information row in the detail view, remove the comments section,
// and apply a semiвЂ‘transparent background to genre and tag elements.

(function () {
  'use strict';
  // Prevent multiple injections and ensure Lampa exists
  if (!window.Lampa || window.hideQualityFinalPluginInjected) return;
  window.hideQualityFinalPluginInjected = true;

  /**
   * Determine whether a given text represents a quality indicator.
   * Accepts many common tokens used in Lampa for video quality.
   * Numeric values or the TV label are ignored.
   *
   * @param {string} text Text content to evaluate
   * @returns {boolean} True if the text looks like a quality badge
   */
  function looksLikeQuality(text) {
    if (!text) return false;
    var t = text.trim().toUpperCase();
    if (!t) return false;
    // Skip purely numeric (ratings) and the TV badge
    if (/^\d+(\.\d+)?$/.test(t) || t === 'TV') return false;
    // Common quality tokens
    var tokens = [
      '4K', '8K', 'HD', 'FHD', 'FULLHD', 'UHD', 'BD', 'BDRIP', 'HDRIP', 'HDR',
      'WEBDL', 'WEB-DL', 'WEBRIP', 'WEB', 'HDTV', 'TS', 'CAM', 'CAMRIP',
      'DVDRIP', 'DVDSCR', 'DVD', '360P', '480P', '720P', '1080P', '2160P',
      '1440P', 'HDR10'
    ];
    if (tokens.indexOf(t) !== -1) return true;
    // Also allow matching inside longer strings, like "BluRay 1080p"
    return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|8K|2160P|1080P|720P|360P|480P)/i.test(t);
  }

  /**
   * Hide quality badges in list cards. It scans through spans and divs
   * inside `.card` elements and hides those whose text matches a quality pattern.
   *
   * @param {Element} [root=document] Optional root element to limit the search
   */
  function hideCardQuality(root) {
    var scope = root || document;
    var candidates = scope.querySelectorAll('.card span, .card div');
    candidates.forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (looksLikeQuality(txt)) {
        // Only hide the element if it hasn't been hidden yet
        if (el.style && el.style.display !== 'none') {
          el.style.display = 'none';
        }
      }
    });
  }

  /**
   * Remove quality information from the full detail view. This hides the
   * `.tag--quality` element near the poster and removes info rows that start
   * with "Quality" (or its translation) or contain quality tokens.
   */
  function removeQualityRow() {
    // Hide tag near poster
    document.querySelectorAll('.tag--quality').forEach(function (tag) {
      tag.remove();
    });
    // Remove info spans that start with translated "quality" or contain tokens
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function (span) {
      var text = (span.textContent || '').trim();
      if (!text) return;
      var lower = text.toLowerCase();
      // Determine the translation of "player_quality" if available
      var qualityKey = '';
      try {
        qualityKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
      } catch (e) {
        qualityKey = '';
      }
      // Remove if starts with translated or English/Russian word for quality
      if ((qualityKey && lower.indexOf(qualityKey) === 0) ||
          lower.indexOf('quality') === 0 ||
          lower.indexOf('РєР°С‡РµСЃС‚РІРѕ') === 0) {
        span.remove();
        return;
      }
      // Remove if it contains quality tokens
      if (looksLikeQuality(text)) {
        span.remove();
      }
    });
  }

  /**
   * Remove the comments section from the full detail view. It targets
   * elements with classes `.full-reviews` or `.full__reviews` and removes
   * their parent `.items-line` if present.
   */
  function hideComments() {
    var reviews = document.querySelectorAll('.full-reviews, .full__reviews');
    reviews.forEach(function (review) {
      var parent = review.closest('.items-line');
      if (parent) parent.remove();
      else review.remove();
    });
  }

  /**
   * Apply semiвЂ‘transparent backgrounds to genre and tag elements. It
   * injects a style block only once and adds the `genre-badge` class to
   * appropriate spans and tag counts.
   */
  function applyGenreStyles() {
    // Inject style once
    var styleId = 'hide-quality-final-style';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = [
        '.genre-badge {',
        '  background: rgba(0, 0, 0, 0.4);',
        '  padding: 0.2em 0.5em;',
        '  border-radius: 0.3em;',
        '  color: #fff;',
        '  margin-right: 0.3em;',
        '  display: inline-block;',
        '  font-size: 0.95em;',
        '}',
        '.full-descr__tags .tag-count {',
        '  background: rgba(0, 0, 0, 0.4);',
        '  border-radius: 0.3em;',
        '  padding: 0.2em 0.5em;',
        '  color: #fff;',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }
    // Apply to genre spans: those without colon, digits, but containing commas or pipes
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function (span) {
      var txt = (span.textContent || '').trim();
      if (!txt) return;
      if (txt.indexOf(':') !== -1) return;
      if (/\d/.test(txt)) return;
      if (txt.indexOf(',') !== -1 || txt.indexOf('|') !== -1) {
        span.classList.add('genre-badge');
      }
    });
    // Apply to tag counters
    document.querySelectorAll('.full-descr__tags .tag-count').forEach(function (el) {
      el.classList.add('genre-badge');
    });
  }

  /**
   * Handler to run when the full view is completely constructed. It removes
   * quality info, hides comments, and styles genres.
   */
  function onFullComplete() {
    removeQualityRow();
    hideComments();
    applyGenreStyles();
  }

  // Listen for the "full" event (card detail ready). Use a delay to ensure
  // all DOM nodes are present before manipulation.
  if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
    Lampa.Listener.follow('full', function (event) {
      if (event && event.type === 'complite') {
        setTimeout(onFullComplete, 200);
      }
    });
  }

  // Initial invocation and DOM observation for dynamically added cards
  hideCardQuality();
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) {
          hideCardQuality(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Register the plugin in Lampa if possible. This call is optional but
  // allows the plugin to show up in the plugin list. We wrap it in a try
  // block to avoid errors in versions where this API is absent or changed.
  try {
    if (window.Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
      Lampa.Plugin.create({
        name: 'Hide Quality & Comments',
        version: '1.0.2',
        description: 'Hides quality badges/info, removes comments, and styles genres.',
        type: 'card',
        icon: '\uD83D\uDEAB' // simple emoji icon to identify the plugin
      });
    }
  } catch (e) {
    // ignore failures
  }
})();

