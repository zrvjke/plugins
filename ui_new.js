// Lampa plugin: Hide quality labels, remove comments and quality info, and add backgrounds to genres
// This version fixes the undefined Lampa.Plugin error and works without jQuery.
(function() {
  'use strict';

  // Ensure Lampa is present and guard against double-injection
  if (!window.Lampa) return;
  if (window.hideQualityGenrePluginFixedInjected) return;
  window.hideQualityGenrePluginFixedInjected = true;

  /**
   * Hide quality badges on card previews. Keeps the 'TV' badge but
   * hides any other quality indicators such as 4K, BD, TS, CAM, etc.
   *
   * @param {Node} node Optional subtree to limit the search area
   */
  function hideCardQualityBadges(node) {
    var scope = node || document;
    // Many quality badges live inside .card__type. Select all such elements.
    var elements = scope.querySelectorAll('.card__type');
    elements.forEach(function(el) {
      var text = (el.textContent || '').trim().toUpperCase();
      // Skip empty labels and the 'TV' label for series
      if (!text || text.startsWith('TV')) return;
      // Otherwise hide this element
      el.style.display = 'none';
    });
  }

  /**
   * Remove quality information from the full details page. This hides
   * any `.tag--quality` elements and removes information rows that start
   * with the word "Quality" (translated or in English/Russian) or contain
   * typical quality tokens such as 4K, HDRip, WEB, TS, etc.
   */
  function removeQualityInfo() {
    // Hide quality tags near the poster
    document.querySelectorAll('.tag--quality').forEach(function(tag) {
      tag.style.display = 'none';
    });
    // Gather translation for "quality" if available
    var qualityKey = '';
    try {
      if (window.Lampa && Lampa.Lang) {
        qualityKey = Lampa.Lang.translate('player_quality') || '';
      }
    } catch (err) {
      qualityKey = '';
    }
    qualityKey = (qualityKey || '').toLowerCase();
    // Patterns to detect quality strings
    var qualityRegex = /\b(4K|BD|BDRIP|HDRIP|WEB|WEBDL|WEB-DL|WEBRIP|HDTV|TS|CAM|DVDRIP|DVDSCR|DVD|360P|480P|720P|1080P|2160P)\b/i;
    var selectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(selectors).forEach(function(span) {
      var txt = (span.textContent || '').trim();
      if (!txt) return;
      var lower = txt.toLowerCase();
      // Remove if the row begins with the translated word for "quality" or the English/Russian word for quality
      if (qualityKey && lower.indexOf(qualityKey) === 0) {
        span.remove();
      } else if (lower.indexOf('quality') === 0 || lower.indexOf('РєР°С‡РµСЃС‚РІРѕ') === 0) {
        span.remove();
      } else if (qualityRegex.test(txt)) {
        // Remove rows containing quality tokens
        span.remove();
      }
    });
  }

  /**
   * Remove the comments section from the full details page. Lampa wraps
   * the comments list inside `.full-reviews` within an `.items-line`
   * container. If found, remove the entire parent block to avoid leaving
   * an empty section header. If not, remove the reviews container itself.
   */
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

  /**
   * Inject CSS for genre badges and apply a semi-transparent background
   * to genre labels in the full details view. We assign the class
   * `.genre-badge` to spans that look like comma-separated lists (genres)
   * and to `.tag-count` elements in the tags section.
   */
  function styleGenres() {
    // Inject our custom CSS only once
    if (!document.getElementById('hide-quality-genre-style')) {
      var style = document.createElement('style');
      style.id = 'hide-quality-genre-style';
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
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }
    // Apply to genre spans in the info row
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function(span) {
      var text = (span.textContent || '').trim();
      if (!text) return;
      // Exclude rows with colons (like "Date:" or "Countries:") and numbers (duration)
      if (text.indexOf(':') !== -1) return;
      if (/\d/.test(text)) return;
      // If it contains commas or pipes, assume it's a genre list and style it
      if (text.indexOf(',') !== -1 || text.indexOf('|') !== -1) {
        span.classList.add('genre-badge');
      }
    });
    // Apply to tags count elements in the tags section
    document.querySelectorAll('.full-descr__tags .tag-count').forEach(function(el) {
      el.classList.add('genre-badge');
    });
  }

  /**
   * Handler for the completion of the full card view. Runs
   * modifications after a short delay to allow the DOM to render.
   */
  function onFullComplete() {
    removeQualityInfo();
    removeCommentsSection();
    styleGenres();
  }

  /**
   * Observe the document for added nodes and hide quality badges as
   * elements appear (useful for lazy-loaded cards and lists). Also run
   * initial hiding on existing nodes.
   */
  function observeCards() {
    // Immediately hide on existing cards
    hideCardQualityBadges(document.body);
    // Observe for future additions
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            hideCardQualityBadges(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Hook into the "full" event that fires when a card view finishes
  window.Lampa.Listener.follow('full', function(event) {
    if (event && event.type === 'complite') {
      // Run after a small delay to ensure the DOM is ready
      setTimeout(onFullComplete, 100);
    }
  });

  // Start observing cards for quality badge hiding
  observeCards();

  // Optionally register this plugin in the Lampa plugin list if the API exists
  if (window.Lampa.Plugin && typeof window.Lampa.Plugin.create === 'function') {
    window.Lampa.Plugin.create({
      name: 'Hide Quality & Comments + Genre Background (fixed)',
      version: '1.0.2',
      type: 'card',
      // Use a simple paintbrush emoji as the icon; browsers will handle this safely
      icon: '\uD83D\uDD8D',
      description: 'Hides non-TV quality badges, removes quality info and comments, and adds semi-transparent backgrounds to genre labels.'
    });
  }
})();
