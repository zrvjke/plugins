(function () {
    'use strict';
    
    // Check Lampa presence
    if (!window.Lampa) return;
    // Prevent multiple injection
    if (window.hideQualityGenrePluginInjected) return;
    window.hideQualityGenrePluginInjected = true;
    
    /**
     * Names of qualities that should be hidden.  This list is
     * caseвЂ‘insensitive and based on common quality markers used
     * by online releases (TS, CAM, BDRip, etc.).  The plugin will
     * keep the "TV" label (used to mark series) untouched.
     */
    var qualityNames = [
        'TS','CAM','HDRIP','BDRIP','HDR','HDCAM','HD','HDTV','HDCAMRIP',
        'CAMRIP','4K','8K','SCR','RAWHD','DVDRIP','DVDSCR','WEBDL',
        'WEB-DL','WEB DL','WEB','HDRIP','BD','FULLHD','HDTCR','HDTC'
    ];

    /**
     * Hide quality badges on all cards by inspecting the text
     * of the .card__type elements.  Only hides badges whose
     * content matches one of the qualityNames.  TV badges remain.
     */
    function hideQualityBadges(container) {
        var $ = window.$ || window.jQuery;
        if (!$) return;
        $(container).find('.card__type').each(function () {
            var text = $(this).text().trim().toUpperCase();
            if (qualityNames.indexOf(text) !== -1) {
                $(this).hide();
            }
        });
    }

    /**
     * Remove the quality line from the full description block and
     * hide the visual tag for quality.  Uses the Lampa language
     * translation for player_quality to find the appropriate span.
     */
    function hideQualityInFull() {
        var $ = window.$ || window.jQuery;
        if (!$) return;
        // Hide .tag--quality badge (visible only when quality is set)
        $('.tag--quality').hide();
        try {
            var qualityKey = window.Lampa.Lang.translate('player_quality');
            if (qualityKey) {
                // Remove spans in the info row that begin with "Quality:" (or translation)
                $('.full-start__info span, .full-start-new__info span').each(function () {
                    var txt = $(this).text().trim();
                    if (!txt) return;
                    var lower = txt.toLowerCase();
                    if (lower.indexOf(qualityKey.toLowerCase()) === 0) {
                        $(this).remove();
                    }
                });
            }
        } catch (e) {
            // If translation lookup fails, fallback to generic term
            $('.full-start__info span, .full-start-new__info span').each(function () {
                var txt = $(this).text().trim().toLowerCase();
                if (!txt) return;
                if (txt.indexOf('quality') === 0 || txt.indexOf('РєР°С‡РµСЃС‚РІРѕ') === 0) {
                    $(this).remove();
                }
            });
        }
    }

    /**
     * Remove the comments section after the actors block.  The reviews
     * component attaches a .full-reviews class on the scroll body.  We
     * remove its parent .items-line container entirely.
     */
    function hideComments() {
        var $ = window.$ || window.jQuery;
        if (!$) return;
        $('.full-reviews').each(function () {
            var parent = $(this).closest('.items-line');
            if (parent.length) parent.remove();
            else $(this).remove();
        });
    }

    /**
     * Add a semiвЂ‘transparent background to genre labels.  Genres are
     * typically placed in the information row of the full view as the
     * last span (with names separated by pipes or commas) and inside
     * the description tags block as .tag-count elements.  We add a
     * class to spans that look like genre lists (no digits and
     * contain at least one "|" or comma) and to tag-count elements.
     */
    function applyGenreBackground() {
        var $ = window.$ || window.jQuery;
        if (!$) return;
        // Add CSS once
        if (!document.getElementById('genre-bg-style')) {
            var style = document.createElement('style');
            style.id = 'genre-bg-style';
            style.textContent =
                '.genre-badge {\n' +
                '  background: rgba(0,0,0,0.4);\n' +
                '  padding: 0.2em 0.5em;\n' +
                '  margin-right: 0.3em;\n' +
                '  border-radius: 0.3em;\n' +
                '  display: inline-block;\n' +
                '  color: #fff;\n' +
                '  font-size: 0.95em;\n' +
                '}' +
                '.full-descr__tags .tag-count {\n' +
                '  background: rgba(0,0,0,0.4);\n' +
                '  border-radius: 0.3em;\n' +
                '  padding: 0.2em 0.5em;\n' +
                '  color: #fff;\n' +
                '}';
            document.head.appendChild(style);
        }
        // Process spans in the info row
        $('.full-start__info span, .full-start-new__info span').each(function () {
            var txt = $(this).text().trim();
            if (!txt) return;
            // Skip if already has a colon (runtime and season fields) or numbers
            if (txt.indexOf(':') !== -1) return;
            if (/\d/.test(txt)) return;
            // If text contains pipes or commas, treat as genres
            if (txt.indexOf('|') !== -1 || txt.indexOf(',') !== -1) {
                $(this).addClass('genre-badge');
            }
        });
        // Add badge class to each tag-count element (genres and other tags)
        $('.full-descr__tags .tag-count').addClass('genre-badge');
    }

    /**
     * Process the full view after it is fully constructed.  We
     * call our helper functions to hide quality, hide comments and
     * apply genre styles.
     */
    function processFullView() {
        hideQualityInFull();
        hideComments();
        applyGenreBackground();
    }

    /**
     * Start observing DOM mutations for cards to hide quality badges.
     */
    function observeCards() {
        // Initially hide quality badges on existing cards
        hideQualityBadges(document.body);
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    hideQualityBadges(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Listen for full view events to process details pages
    window.Lampa.Listener.follow('full', function (event) {
        // When full view is completed, we apply modifications
        if (event && event.type === 'complite') {
            // Slight delay to allow DOM to render
            setTimeout(processFullView, 50);
        }
    });

    // Begin observation of cards
    observeCards();

    // Register the plugin so it appears in the extension list
    window.Lampa.Plugin.create({
        name: 'Hide Quality & Comments + Genre Background',
        version: '1.0.0',
        type: 'card',
        icon: 'рџ› ',
        description: 'Hides quality info and comments in full view and cards, and adds semiвЂ‘transparent backgrounds to genres.'
    });

})();