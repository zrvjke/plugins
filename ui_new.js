// Lampa plugin: Hide quality labels, remove comments, and style genres
// This script hides quality badges on cards (except the "TV" badge),
// removes quality information and the comments section from the full
// description page, and adds a semiвЂ‘transparent background to genre
// labels. It uses vanilla JavaScript and MutationObserver so it
// doesn't depend on jQuery being available.
(function() {
  'use strict';

  // Ensure Lampa is present and guard against duplicate injection
  if (!window.Lampa) return;
  if (window.hideQualityGenrePluginNativeInjected) return;
  window.hideQualityGenrePluginNativeInjected = true;

  /**
   * Hide quality badges on card previews. We keep badges that
   * contain "TV" (for TV shows) and hide all others such as 4K,
   * CAM, TS, WEB DL, etc. This works regardless of the text case.
   */
  function hideCardTypeBadges(node) {
    // Query all card type elements within the given node (or document)
    var scope = node || document;
    var elements = scope.querySelectorAll('.card__type');
    elements.forEach(function(el) {
      var text = el.textContent.trim().toUpperCase();
      if (text && text.indexOf('TV') !== 0) {
        el.style.display = 'none';
      }
    });
  }

  /**
   * Remove quality information from the full view. This hides the
   * quality tag (.tag--quality) and removes any spans in the info
   * row that begin with the translated word for "Quality:" or its
   * English/Russian equivalents.
   */
  function removeQualityFromFull() {
    // Hide tag if present
    document.querySelectorAll('.tag--quality').forEach(function(tag) {
      tag.style.display = 'none';
    });
    // Determine translation key for "quality" if available
    var qualityKey = '';
    try {
      if (window.Lampa && Lampa.Lang) {
        qualityKey = Lampa.Lang.translate('player_quality') || '';
      }
    } catch (err) {
      qualityKey = '';
    }
    qualityKey = qualityKey.toLowerCase();
    var selectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(selectors).forEach(function(span) {
      var txt = span.textContent.trim();
      if (!txt) return;
      var lower = txt.toLowerCase();
      // Remove if starts with translated quality key or generic words
      if (qualityKey && lower.indexOf(qualityKey) === 0) {
        span.remove();
      } else if (lower.indexOf('quality') === 0 || lower.indexOf('РєР°С‡РµСЃС‚РІРѕ') === 0) {
        span.remove();
      }
    });
  }

  /**
   * Remove the comments section after the actors block. Lampa uses a
   * scroll container with class .full-reviews for the comments list.
   * We remove its closest .items-line container if it exists; otherwise
   * we remove the .full-reviews element itself.
   */
  function removeCommentsSection() {
    var reviews = document.querySelectorAll('.full-reviews');
    reviews.forEach(function(review) {
      var parent = review.closest('.items-line');
      if (parent) parent.remove(); else review.remove();
    });
  }

  /**
   * Inject CSS for genre badges and apply the class to appropriate
   * elements in the full view. We target spans in the info row
   * containing pipes or commas (likely lists of genres) and
   * elements with class .tag-count inside the tags block.
   */
  function styleGenres() {
    // Inject CSS once
    if (!document.getElementById('genre-badge-style')) {
      var style = document.createElement('style');
      style.id = 'genre-badge-style';
      style.textContent =
        '.genre-badge {\n' +
        '  background: rgba(0,0,0,0.4);\n' +
        '  padding: 0.2em 0.5em;\n' +
        '  margin-right: 0.3em;\n' +
        '  border-radius: 0.3em;\n' +
        '  display: inline-block;\n' +
        '  color: #fff;\n' +
        '  font-size: 0.95em;\n' +
        '}\n' +
        '.full-descr__tags .tag-count {\n' +
        '  background: rgba(0,0,0,0.4);\n' +
        '  border-radius: 0.3em;\n' +
        '  padding: 0.2em 0.5em;\n' +
        '  color: #fff;\n' +
        '}';
      document.head.appendChild(style);
    }
    // Apply to spans in the info row
    var infoSelectors = '.full-start__info span, .full-start-new__info span';
    document.querySelectorAll(infoSelectors).forEach(function(span) {
      var text = span.textContent.trim();
      if (!text) return;
      // Skip entries with colon or digits (runtime/season or numbers)
      if (text.indexOf(':') !== -1) return;
      if (/\d/.test(text)) return;
      // If contains commas or pipes, treat as genre list
      if (text.indexOf(',') !== -1 || text.indexOf('|') !== -1) {
        span.classList.add('genre-badge');
      }
    });
    // Apply to tag-count elements
    document.querySelectorAll('.full-descr__tags .tag-count').forEach(function(el) {
      el.classList.add('genre-badge');
    });
  }

  /**
   * Execute modifications on the full view after it finishes loading.
   */
  function processFullView() {
    removeQualityFromFull();
    removeCommentsSection();
    styleGenres();
  }

  /**
   * Observe added nodes to hide quality badges. We immediately
   * process existing nodes and then watch for new cards appended to
   * the document. This covers dynamic lists and lazy loading.
   */
  function observeCardLabels() {
    // Initial run
    hideCardTypeBadges(document.body);
    // Observe future mutations
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          hideCardTypeBadges(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Listen for the "full" event (complete rendering of a details page)
  window.Lampa.Listener.follow('full', function(event) {
    if (event && event.type === 'complite') {
      // Delay slightly to allow the DOM to render completely
      setTimeout(processFullView, 100);
    }
  });

  // Start observing card labels on initial load
  observeCardLabels();

  // Register plugin so it appears in the plugin list
  window.Lampa.Plugin.create({
    name: 'Hide Quality & Comments + Genre Background (native)',
    version: '1.0.1',
    type: 'card',
    icon: 'рџ’ѕ',
    description: 'Hides non-TV quality badges, removes quality information and comments, and styles genre labels.'
  });
})();
