// Lampa plugin for TMDB interface: hide quality labels, remove quality info and comments,
// and add semi-transparent backgrounds to genres.
// This version uses broader selectors to target TMDB and guards against undefined APIs.
(function() {
  'use strict';

  // Bail out if Lampa is not available or script already injected
  if (typeof window === 'undefined' || !window.Lampa) return;
  if (window.hideQualityTmdbPluginInjected) return;
  window.hideQualityTmdbPluginInjected = true;

  // Helper to determine if text content is a quality label
  function isQualityLabel(text) {
    if (!text) return false;
    var t = text.trim().toUpperCase();
    if (!t) return false;
    // Skip purely numeric values (ratings)
    if (/^\d+(\.\d+)?$/.test(t)) return false;
    // Skip series indicator
    if (t === 'TV') return false;
    // List of quality tokens
    var qualities = [
      '4K', '8K', 'HD', 'FHD', 'FULLHD', 'UHD', 'BD', 'BDRIP', 'HDRIP', 'HDR',
      'WEBDL', 'WEB-DL', 'WEBDL', 'WEB', 'WEBRIP', 'HDTV', 'TS', 'CAM', 'CAMRIP',
      'DVDRIP', 'DVDSCR', 'DVD', '360P', '480P', '720P', '1080P', '2160P', 'HDR10'
    ];
    if (qualities.includes(t)) return true;
    // Also match tokens within text (e.g., "BluRay 1080p")
    return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|1080P|720P|360P|480P)/i.test(t);
  }

  // Hide quality badges on any card by checking inner text of elements
  function hideQualityBadges(node) {
    var scope = node || document;
    // Potential elements containing quality labels
    var elements = scope.querySelectorAll('.card span, .card div');
    elements.forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (isQualityLabel(txt)) {
        el.style.display = 'none';
      }
    });
  }

  // Remove quality information from the full details page
  function removeQualityInfo() {
    // Hide tags near the poster
    document.querySelectorAll('.tag--quality').forEach(function(tag) {
      tag.style.display = 'none';
    });
    // Remove spans that start with translated "Quality" or contain quality tokens
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function(span) {
      var txt = (span.textContent || '').trim();
      if (!txt) return;
      var lower = txt.toLowerCase();
      // Check translation of "quality"
      var qualityKey = '';
      try {
        qualityKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
      } catch (e) {
        qualityKey = '';
      }
      // Remove if starts with translated or English/Russian word for quality
      if ((qualityKey && lower.indexOf(qualityKey) === 0) || lower.indexOf('quality') === 0 || lower.indexOf('РєР°С‡РµСЃС‚РІРѕ') === 0) {
        span.remove();
        return;
      }
      // Remove if contains quality tokens
      if (isQualityLabel(txt)) {
        span.remove();
      }
    });
  }

  // Remove comments section from the full details page
  function removeCommentsSection() {
    var reviews = document.querySelectorAll('.full-reviews, .full__reviews');
    reviews.forEach(function(review) {
      var parent = review.closest('.items-line');
      if (parent) {
        parent.remove();
      } else {
        review.remove();
      }
    });
  }

  // Apply semi-transparent background to genres and tags
  function styleGenres() {
    if (!document.getElementById('hide-quality-tmdb-style')) {
      var style = document.createElement('style');
      style.id = 'hide-quality-tmdb-style';
      style.textContent = [
        '.genre-badge {',
        '  background: rgba(0,0,0,0.4);',
        '  padding: 0.2em 0.5em;',
        '  margin-right: 0.3em;',
        '  border-radius: 0.3em;',
        '  display: inline-block;',
        '  color: #fff;',
        '  font-size: 0.95em;',
        '}',
        '.full-descr__tags .tag-count {',
        '  background: rgba(0,0,0,0.4);',
        '  border-radius: 0.3em;',
        '  padding: 0.2em 0.5em;',
        '  color: #fff;',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }
    // Apply to genre spans in info row: spans without colon and no digits and containing commas
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function(span) {
      var text = (span.textContent || '').trim();
      if (!text) return;
      if (text.indexOf(':') !== -1) return;
      if (/\d/.test(text)) return;
      if (text.indexOf(',') !== -1 || text.indexOf('|') !== -1) {
        span.classList.add('genre-badge');
      }
    });
    // Apply to tag counts in tag section
    document.querySelectorAll('.full-descr__tags .tag-count').forEach(function(el) {
      el.classList.add('genre-badge');
    });
  }

  // Handler called when full view is ready
  function onFullComplete() {
    removeQualityInfo();
    removeCommentsSection();
    styleGenres();
  }

  // Observe DOM for new cards and hide quality badges
  function observeCards() {
    hideQualityBadges(document.body);
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            hideQualityBadges(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Listen to the "full" event when a card view is opened
  if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
    Lampa.Listener.follow('full', function(event) {
      if (event && event.type === 'complite') {
        setTimeout(onFullComplete, 100);
      }
    });
  }

  // Start observing cards
  observeCards();

  // Register plugin metadata if API available
  if (window.Lampa && Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
    Lampa.Plugin.create({
      name: 'Hide Quality & Comments (TMDB)',
      version: '1.0.0',
      description: 'Hides quality badges and info, removes comments, and styles genres on TMDB interface.',
      type: 'card',
      icon: '\uD83D\uDC12' // decorative emoji
    });
  }
})();

