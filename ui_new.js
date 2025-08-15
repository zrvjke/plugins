// Lampa plugin: Hide quality information and style genres on detail cards.
//
// This plugin is inspired by the Interface MOD and RT Rating plugins. It hides
// quality markers (4K, WEBвЂ‘DL, HDRip, etc.) from the movie/series information
// panel in the detail view (to the right of the poster) and applies a
// semiвЂ‘transparent background to genre and tag elements. It also removes
// season and episode counters on TV series and cleans up bullet separators
// that become orphaned after removal. The plugin does not interfere with
// comments or list views. It registers itself with Lampa when possible.

(function () {
    'use strict';
    // Ensure Lampa exists and avoid multiple injections
    if (!window.Lampa || window.hideQualityGenrePluginInjected) return;
    window.hideQualityGenrePluginInjected = true;

    /**
     * Determine if the given text is likely a quality indicator.
     * We exclude simple numeric ratings and the вЂњTVвЂќ label.
     *
     * @param {string} text
     * @returns {boolean}
     */
    function isQualityText(text) {
        if (!text) return false;
        var t = text.trim().toUpperCase();
        if (!t) return false;
        if (/^\d+(\.\d+)?$/.test(t) || t === 'TV') return false;
        var tokens = [
            '4K', '8K', 'HD', 'FHD', 'FULLHD', 'UHD', 'BD', 'BDRIP', 'HDRIP',
            'HDR', 'WEBDL', 'WEB-DL', 'WEB', 'WEBRIP', 'HDTV', 'TS', 'CAM',
            'CAMRIP', 'DVDRIP', 'DVDSCR', 'DVD', '360P', '480P', '720P',
            '1080P', '1440P', '2160P', 'HDR10'
        ];
        if (tokens.indexOf(t) !== -1) return true;
        return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|8K|2160P|1080P|720P|360P|480P)/i.test(t);
    }

    /**
     * Remove quality, season and episode information from the detail panel.
     * Also remove bullet separators directly preceding removed entries.
     */
    function removeQualityInfo() {
        try {
            // Remove the quality tag near the poster
            document.querySelectorAll('.tag--quality').forEach(function (el) {
                el.remove();
            });
            // Localized вЂњqualityвЂќ word from Lampa
            var qKey = '';
            try {
                qKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
            } catch (e) {
                qKey = '';
            }
            // Patterns for season and episode counters
            var seasonPrefixes = ['СЃРµР·РѕРЅ', 'СЃРµР·РѕРЅС‹', 'seasons', 'season'];
            var episodePrefixes = ['СЃРµСЂРёРё', 'СЃРµСЂРёСЏ', 'episodes', 'episode'];
            // Candidate spans in the info sections
            var selectors = [
                '.full-start__info span',
                '.full-start-new__info span',
                '.full-descr__info span'
            ].join(',');
            document.querySelectorAll(selectors).forEach(function (span) {
                var text = (span.textContent || '').trim();
                if (!text) return;
                var lower = text.toLowerCase();
                var remove = false;
                // Remove lines beginning with вЂњqualityвЂќ (localized, English or Russian)
                if ((qKey && lower.startsWith(qKey)) || lower.startsWith('quality') || lower.startsWith('РєР°С‡РµСЃС‚РІРѕ')) {
                    remove = true;
                }
                // Remove season/episode counters
                seasonPrefixes.forEach(function (p) {
                    if (lower.startsWith(p)) remove = true;
                });
                episodePrefixes.forEach(function (p) {
                    if (lower.startsWith(p)) remove = true;
                });
                // Remove explicit quality tokens
                if (isQualityText(text)) {
                    remove = true;
                }
                if (remove) {
                    // Remove any bullet separator immediately preceding this span
                    var prev = span.previousSibling;
                    // Skip whitespace
                    while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                        prev = prev.previousSibling;
                    }
                    // Remove bullet characters (вЂў, В· or .) if present
                    if (prev && prev.nodeType === Node.TEXT_NODE) {
                        var ptxt = prev.textContent.trim();
                        if (ptxt === 'вЂў' || ptxt === 'В·' || ptxt === '.') {
                            prev.remove();
                        }
                    } else if (prev && prev.nodeType === Node.ELEMENT_NODE) {
                        var etxt = (prev.textContent || '').trim();
                        if (etxt === 'вЂў' || etxt === 'В·' || etxt === '.') {
                            prev.remove();
                        }
                    }
                    span.remove();
                }
            });
        } catch (err) {
            // Ignore errors
        }
    }

    /**
     * Apply a semiвЂ‘transparent background to genre and tag elements.
     */
    function styleGenres() {
        // Inject style if not yet present
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
        // Assign the class to likely genre spans (commaвЂ‘ or pipeвЂ‘separated lists without colons or digits)
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
        // Assign the class to tag counters
        document.querySelectorAll('.full-descr__tags .tag-count').forEach(function (el) {
            el.classList.add('genre-badge');
        });
    }

    /**
     * Handler for the `full` event.
     * @param {Object} event
     */
    function onFull(event) {
        if (event && event.type === 'complite') {
            setTimeout(function () {
                removeQualityInfo();
                styleGenres();
            }, 200);
        }
    }

    // Register listener
    if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('full', onFull);
    }

    // Register plugin metadata
    try {
        if (Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
            Lampa.Plugin.create({
                name: 'Hide Quality & Style Genres',
                version: '1.1.0',
                description: 'Removes quality, season and episode info on detail cards and styles genre tags.',
                type: 'card',
                icon: '\uD83D\uDD2D'
            });
        }
    } catch (e) {
        // Ignore registration errors
    }
})();


