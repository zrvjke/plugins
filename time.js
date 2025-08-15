// Lampa plugin: Hide quality information and style genres on detail cards.
//
// This plugin is inspired by the Interface MOD and RT Rating plugins. It hides
// quality markers such as 4K, WEBвЂ‘DL, HDRip, etc. from the movie/series
// information panel in the detail view (to the right of the poster) and
// applies a semiвЂ‘transparent background to genre and tag elements. Unlike
// previous attempts, this script avoids interfering with the list view and
// doesnвЂ™t touch the comments section. It uses only the necessary Lampa APIs
// and works in both TMDB and CUB sources, provided the markup follows
// LampaвЂ™s standard naming conventions.

(function () {
    'use strict';
    // Ensure Lampa exists and avoid multiple injections
    if (!window.Lampa || window.hideQualityGenrePluginInjected) return;
    window.hideQualityGenrePluginInjected = true;

    /**
     * Detect if a piece of text looks like a quality indicator (e.g., 4K, WEBвЂ‘DL,
     * HDRip, TS). Returns false for simple numbers (ratings) and for the вЂњTVвЂќ
     * label used on series cards.
     *
     * @param {string} text The text to evaluate
     * @returns {boolean} True if text is likely a quality string
     */
    function isQualityText(text) {
        if (!text) return false;
        var t = text.trim().toUpperCase();
        if (!t) return false;
        // Ignore pure numeric strings and the TV badge
        if (/^\d+(\.\d+)?$/.test(t) || t === 'TV') return false;
        // Known quality tokens
        var tokens = [
            '4K', '8K', 'HD', 'FHD', 'FULLHD', 'UHD', 'BD', 'BDRIP', 'HDRIP',
            'HDR', 'WEBDL', 'WEB-DL', 'WEB', 'WEBRIP', 'HDTV', 'TS', 'CAM',
            'CAMRIP', 'DVDRIP', 'DVDSCR', 'DVD', '360P', '480P', '720P',
            '1080P', '1440P', '2160P', 'HDR10'
        ];
        if (tokens.indexOf(t) !== -1) return true;
        // Also match tokens embedded in longer strings (e.g., вЂњBluRay 1080pвЂќ)
        return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|8K|2160P|1080P|720P|360P|480P)/i.test(t);
    }

    /**
     * Remove quality information from the detail view. This function hides the
     * `.tag--quality` element near the poster and removes spans in the info
     * section that represent quality lines (e.g., вЂњQuality: WEBвЂ‘DLвЂќ).
     */
    function removeQualityInfo() {
        try {
            // Remove the tag element near the poster
            document.querySelectorAll('.tag--quality').forEach(function (el) {
                el.remove();
            });
            // Determine the translated word for вЂњQualityвЂќ from LampaвЂ™s language API
            var qKey = '';
            try {
                qKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
            } catch (e) {
                qKey = '';
            }
            // Remove info rows containing quality
            var selectors = [
                '.full-start__info span',
                '.full-start-new__info span',
                '.full-descr__info span'
            ].join(',');
            document.querySelectorAll(selectors).forEach(function (span) {
                var text = (span.textContent || '').trim();
                if (!text) return;
                var lower = text.toLowerCase();
                if ((qKey && lower.startsWith(qKey)) || lower.startsWith('quality') || lower.startsWith('РєР°С‡РµСЃС‚РІРѕ')) {
                    span.remove();
                    return;
                }
                if (isQualityText(text)) {
                    span.remove();
                }
            });
        } catch (err) {
            // Silently ignore any errors
        }
    }

    /**
     * Apply a semiвЂ‘transparent background to genre and tag elements. A new
     * `.genre-badge` class is injected into the document to style these
     * elements.
     */
    function styleGenres() {
        // Inject CSS for genre badges if not already present
        if (!document.getElementById('hide-quality-genre-style')) {
            var styleEl = document.createElement('style');
            styleEl.id = 'hide-quality-genre-style';
            styleEl.textContent = [
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
            document.head.appendChild(styleEl);
        }
        // Tag candidate spans: no colon, no digits, and contain commas or pipes
        var infoSpans = document.querySelectorAll(
            '.full-start__info span, .full-start-new__info span, .full-descr__info span'
        );
        infoSpans.forEach(function (span) {
            var text = (span.textContent || '').trim();
            if (!text) return;
            if (text.indexOf(':') !== -1) return;
            if (/\d/.test(text)) return;
            if (text.indexOf(',') !== -1 || text.indexOf('|') !== -1) {
                span.classList.add('genre-badge');
            }
        });
        // Tag counters in the tags section
        document.querySelectorAll('.full-descr__tags .tag-count').forEach(function (el) {
            el.classList.add('genre-badge');
        });
    }

    /**
     * Handler for the `full` event. Once the detailed page is rendered, we wait
     * briefly to ensure DOM elements are present, then apply our modifications.
     *
     * @param {Object} event Event data from Lampa.Listener.follow
     */
    function onFull(event) {
        if (event && event.type === 'complite') {
            setTimeout(function () {
                removeQualityInfo();
                styleGenres();
            }, 200);
        }
    }

    // Register the listener for detail pages
    if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('full', onFull);
    }

    // Optionally register plugin metadata. This ensures the plugin appears in
    // LampaвЂ™s plugin list (when not loaded as a worker). Wrap in try/catch to
    // avoid errors on older versions.
    try {
        if (Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
            Lampa.Plugin.create({
                name: 'Hide Quality & Style Genres',
                version: '1.0.0',
                description: 'Removes quality info on detail cards and applies a semiвЂ‘transparent background to genres.',
                type: 'card',
                icon: '\uD83D\uDCC4'
            });
        }
    } catch (e) {
        // Do nothing if registration fails
    }
})();