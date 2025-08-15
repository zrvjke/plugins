// Lampa plugin: Hide quality, duration, seasons/episodes information and style genres on detail cards.
//
// This plugin removes quality markers (4K, WEBвЂ‘DL, HDRip, etc.), the runtime/duration
// line, and season/episode counters from the right-hand information panel of
// movie and series detail pages. It also removes any bullet separators that
// remain after removing these items, and applies a semiвЂ‘transparent
// background to genre and tag elements to make them stand out. The plugin
// does not alter the list view or comments section.

(function () {
    'use strict';
    // Prevent duplicate injection
    if (!window.Lampa || window.hideQualityGenrePluginInjected) return;
    window.hideQualityGenrePluginInjected = true;

    /**
     * Detect if a string looks like a quality indicator.
     * @param {string} text
     * @returns {boolean}
     */
    function isQualityText(text) {
        if (!text) return false;
        var t = text.trim().toUpperCase();
        if (!t) return false;
        // Pure numeric strings and TV badge are not quality
        if (/^\d+(\.\d+)?$/.test(t) || t === 'TV') return false;
        var tokens = [
            '4K','8K','HD','FHD','FULLHD','UHD','BD','BDRIP','HDRIP','HDR',
            'WEBDL','WEB-DL','WEB','WEBRIP','HDTV','TS','CAM','CAMRIP','DVDRIP',
            'DVDSCR','DVD','360P','480P','720P','1080P','1440P','2160P','HDR10'
        ];
        if (tokens.indexOf(t) !== -1) return true;
        return /(BLURAY|HDRIP|WEB\s?DL|WEBRIP|HDTV|DVDRIP|TS|CAM|4K|8K|2160P|1080P|720P|360P|480P)/i.test(t);
    }

    /**
     * Determine whether a string is the duration line. It checks for known
     * prefixes like "РІСЂРµРјСЏ", "РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ", etc., or for patterns that
     * resemble durations (e.g. contains "РјРёРЅ" with digits).
     * @param {string} text
     * @returns {boolean}
     */
    function isDurationText(text) {
        if (!text) return false;
        var lower = text.trim().toLowerCase();
        var prefixes = ['РІСЂРµРјСЏ', 'РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ', 'РїСЂРѕРґРѕР»Р¶РёС‚РµР»СЊРЅРѕСЃС‚СЊ', 'runtime', 'duration'];
        for (var i = 0; i < prefixes.length; i++) {
            if (lower.startsWith(prefixes[i])) return true;
        }
        // Contains digits and Russian/English minute/hour abbreviations
        if (/\d/.test(lower) && /(РјРёРЅ|РјРёРЅ\.|min|m|С‡|h)/.test(lower)) {
            return true;
        }
        return false;
    }

    /**
     * Remove quality, duration, season and episode lines from info sections and
     * clean up bullet separators.
     */
    function removeInfoLines() {
        try {
            // Remove quality tag near poster
            document.querySelectorAll('.tag--quality').forEach(function (el) { el.remove(); });
            // Localized translation for "player_quality"
            var qKey = '';
            try {
                qKey = (Lampa.Lang.translate('player_quality') || '').toLowerCase();
            } catch (e) { qKey = ''; }
            var seasonPrefixes = ['СЃРµР·РѕРЅ', 'СЃРµР·РѕРЅС‹', 'seasons', 'season'];
            var episodePrefixes = ['СЃРµСЂРёРё', 'СЃРµСЂРёСЏ', 'episodes', 'episode'];
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
                // Quality line detection
                if ((qKey && lower.startsWith(qKey)) || lower.startsWith('quality') || lower.startsWith('РєР°С‡РµСЃС‚РІРѕ')) {
                    remove = true;
                }
                // Duration detection
                if (isDurationText(text)) remove = true;
                // Season/Episode detection
                seasonPrefixes.forEach(function (p) { if (lower.startsWith(p)) remove = true; });
                episodePrefixes.forEach(function (p) { if (lower.startsWith(p)) remove = true; });
                // Quality token detection
                if (isQualityText(text)) remove = true;
                if (remove) {
                    // Remove preceding bullet separators (вЂў, В·, .)
                    var prev = span.previousSibling;
                    while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                        prev = prev.previousSibling;
                    }
                    if (prev) {
                        var ptxt = '';
                        if (prev.nodeType === Node.TEXT_NODE) {
                            ptxt = prev.textContent.trim();
                        } else if (prev.nodeType === Node.ELEMENT_NODE) {
                            ptxt = (prev.textContent || '').trim();
                        }
                        if (ptxt === 'вЂў' || ptxt === 'В·' || ptxt === '.') {
                            prev.remove();
                        }
                    }
                    span.remove();
                }
            });
        } catch (err) {
            // Ignore errors during removal
        }
    }

    /**
     * Apply semiвЂ‘transparent backgrounds to genre and tag elements.
     */
    function styleGenres() {
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
        document.querySelectorAll('.full-descr__tags .tag-count').forEach(function (el) {
            el.classList.add('genre-badge');
        });
    }

    /**
     * Event handler for detail page completion.
     */
    function onFull(event) {
        if (event && event.type === 'complite') {
            setTimeout(function () {
                removeInfoLines();
                styleGenres();
            }, 200);
        }
    }

    if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('full', onFull);
    }

    try {
        if (Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
            Lampa.Plugin.create({
                name: 'Hide Quality/Duration & Style Genres',
                version: '1.2.0',
                description: 'Hides quality, runtime, seasons and episodes from detail cards and applies a semiвЂ‘transparent background to genres.',
                type: 'card',
                icon: '\uD83D\uDD2D'
            });
        }
    } catch (e) {
        // Ignore registration errors
    }
})();
