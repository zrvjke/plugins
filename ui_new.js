/*
 * Lampa Plugin: Remove quality labels and colorize genres
 *
 * This plugin does two things:
 *   1. Hides the source/quality tags (WEBRip, TS, BDRip, 4K, etc.) that
 *      normally appear on movie and TV show cards as well as in the
 *      information panel on the detail page.
 *   2. Applies a semiвЂ‘transparent coloured background to each genre
 *      listed in the information panel.  Colours are based on common
 *      genres in both Russian and English.  If a genre is not
 *      explicitly mapped, a neutral semiвЂ‘transparent black backdrop is
 *      used instead.  Text colour is chosen for contrast.
 *
 * The implementation is deliberately self contained: it injects a
 * stylesheet to hide quality labels globally and hooks into LampaвЂ™s
 * `full` event to style the genres when a detail page is rendered.
 */

(function () {
    'use strict';
    // Bail out if Lampa is unavailable or the plugin has already been injected
    if (!window.Lampa || window.removeQualityGenrePluginInjected) return;
    window.removeQualityGenrePluginInjected = true;

    /**
     * Inject a global <style> element to hide quality badges in cards.
     *
     * The quality badges live inside `.card__quality` elements.  This
     * stylesheet sets their display to `none` so they are never visible
     * anywhere in the application.  Additional selectors can be added
     * here if other quality tags appear in future versions of Lampa.
     */
    function injectHideQualityStyle() {
        if (document.getElementById('remove-quality-genre-style')) return;
        var style = document.createElement('style');
        style.id = 'remove-quality-genre-style';
        style.textContent = [
            '/* Hide quality labels in movie/series cards */',
            '.card__quality,',
            '.card__view--quality {',
            '    display: none !important;',
            '}',
            '',
            '/* We do not hide anything in the info panel here; that is handled with JavaScript */'
        ].join('\n');
        document.head.appendChild(style);
    }

    /**
     * Mapping from genre names to a coloured background and text colour.
     *
     * The keys cover a selection of common genres in both English and
     * Russian.  The values mirror the palettes used in the original
     * `interface_mod_new.js` plugin.  For any genre not present in this
     * map, a neutral semiвЂ‘transparent black background with white text
     * will be used instead (defined in `getGenreColour`).
     */
    var GENRE_COLOURS = {
        // English genres
        'Action':            { bg: 'rgba(231,  76,  60, 0.8)', text: 'white' },
        'Adventure':         { bg: 'rgba( 39, 174,  96, 0.8)', text: 'white' },
        'Animation':         { bg: 'rgba(155,  89, 182, 0.8)', text: 'white' },
        'Comedy':            { bg: 'rgba(241, 196,  15, 0.8)', text: 'black' },
        'Crime':             { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'Documentary':       { bg: 'rgba( 22, 160, 133, 0.8)', text: 'white' },
        'Drama':             { bg: 'rgba(142,  68, 173, 0.8)', text: 'white' },
        'Family':            { bg: 'rgba( 46, 204, 113, 0.8)', text: 'white' },
        'Fantasy':           { bg: 'rgba(155,  89, 182, 0.8)', text: 'white' },
        'History':           { bg: 'rgba(211,  84,   0, 0.8)', text: 'white' },
        'Horror':            { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'Music':             { bg: 'rgba( 52, 152, 219, 0.8)', text: 'white' },
        'Mystery':           { bg: 'rgba( 52,  73,  94, 0.8)', text: 'white' },
        'Romance':           { bg: 'rgba(233,  30,  99, 0.8)', text: 'white' },
        'Science Fiction':   { bg: 'rgba( 41, 128, 185, 0.8)', text: 'white' },
        'TV Movie':          { bg: 'rgba(149, 165, 166, 0.8)', text: 'black' },
        'Thriller':          { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'War':               { bg: 'rgba(127, 140, 141, 0.8)', text: 'white' },
        'Western':           { bg: 'rgba(211,  84,   0, 0.8)', text: 'white' },
        // Russian equivalents
        'Р‘РѕРµРІРёРє':            { bg: 'rgba(231,  76,  60, 0.8)', text: 'white' },
        'РџСЂРёРєР»СЋС‡РµРЅРёСЏ':       { bg: 'rgba( 39, 174,  96, 0.8)', text: 'white' },
        'РњСѓР»СЊС‚С„РёР»СЊРј':        { bg: 'rgba(155,  89, 182, 0.8)', text: 'white' },
        'РљРѕРјРµРґРёСЏ':           { bg: 'rgba(241, 196,  15, 0.8)', text: 'black' },
        'РљСЂРёРјРёРЅР°Р»':          { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'Р”РѕРєСѓРјРµРЅС‚Р°Р»СЊРЅС‹Р№':    { bg: 'rgba( 22, 160, 133, 0.8)', text: 'white' },
        'Р”СЂР°РјР°':             { bg: 'rgba(142,  68, 173, 0.8)', text: 'white' },
        'РЎРµРјРµР№РЅС‹Р№':          { bg: 'rgba( 46, 204, 113, 0.8)', text: 'white' },
        'Р¤СЌРЅС‚РµР·Рё':           { bg: 'rgba(155,  89, 182, 0.8)', text: 'white' },
        'РСЃС‚РѕСЂРёСЏ':           { bg: 'rgba(211,  84,   0, 0.8)', text: 'white' },
        'РЈР¶Р°СЃС‹':             { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'РњСѓР·С‹РєР°':            { bg: 'rgba( 52, 152, 219, 0.8)', text: 'white' },
        'Р”РµС‚РµРєС‚РёРІ':          { bg: 'rgba( 52,  73,  94, 0.8)', text: 'white' },
        'РњРµР»РѕРґСЂР°РјР°':         { bg: 'rgba(233,  30,  99, 0.8)', text: 'white' },
        'Р¤Р°РЅС‚Р°СЃС‚РёРєР°':        { bg: 'rgba( 41, 128, 185, 0.8)', text: 'white' },
        'РўСЂРёР»Р»РµСЂ':           { bg: 'rgba(192,  57,  43, 0.8)', text: 'white' },
        'Р’РѕРµРЅРЅС‹Р№':           { bg: 'rgba(127, 140, 141, 0.8)', text: 'white' },
        'Р’РµСЃС‚РµСЂРЅ':           { bg: 'rgba(211,  84,   0, 0.8)', text: 'white' }
    };

    /**
     * Return the colour definition for a given genre.  If the genre
     * exists in the map, its colours are returned; otherwise a default
     * semiвЂ‘transparent black background with white text is used.  The
     * defaults mirror the fallback appearance in the original interface
     * modification plugin.
     *
     * @param {string} genre Name of the genre
     * @returns {Object} An object containing `bg` and `text` keys
     */
    function getGenreColour(genre) {
        return GENRE_COLOURS[genre] || { bg: 'rgba(0, 0, 0, 0.4)', text: 'white' };
    }

    /**
     * Regular expression used to identify quality descriptors.  If a
     * spanвЂ™s text matches this pattern, the span will be removed from
     * the info panel entirely.  The pattern covers typical source and
     * quality tags such as WEBRip, TS, BDRip, HDRip, 4K, 2160p, etc.
     */
    var QUALITY_REGEX = /\b(?:WEB\s?Rip|WEB|HDRip|HDTV|BluRay|DVDRip|BDRip|TS|Cam|4K|8K|2160p|1080p|720p)\b/i;

    /**
     * Style the genre elements within a details container.  This
     * function performs three steps:
     *   1. Remove any spans whose text appears to be a quality tag.
     *   2. Determine the list of genres from the movie object or by
     *      splitting spans on commas as a fallback.
     *   3. Apply background and text colour styles to spans that match
     *      those genres.
     *
     * @param {jQuery} $details jQuery collection pointing at the
     *                          details container(s)
     * @param {Object} movie    The Lampa movie object (contains `genres`)
     */
    function styleGenresInDetails($details, movie) {
        if (!$details || !$details.length) return;

        // 1. Remove quality tags inside the details panel
        $details.find('span').each(function () {
            var $span = window.$(this);
            var text = $span.text().trim();
            if (QUALITY_REGEX.test(text)) {
                $span.remove();
            }
        });

        // 2. Build a unique list of genres.  First attempt to read
        //    directly from the movie object, as that is the most
        //    reliable source.  Lampa sometimes stores genres as an
        //    array; sometimes as a commaвЂ‘delimited string.  If no
        //    genres are available, fall back to parsing commaвЂ‘separated
        //    text in the details itself.
        var genres = [];
        if (movie && movie.genres) {
            if (Array.isArray(movie.genres)) {
                genres = movie.genres.slice();
            } else if (typeof movie.genres === 'string') {
                movie.genres.split(',').forEach(function (g) {
                    var trimmed = g.trim();
                    if (trimmed) genres.push(trimmed);
                });
            }
        }
        if (genres.length === 0) {
            // Fallback: inspect each span and split on commas
            $details.find('span').each(function () {
                var txt = window.$(this).text().trim();
                if (!txt) return;
                if (txt.indexOf(',') !== -1) {
                    txt.split(',').forEach(function (g) {
                        var trimmed = g.trim();
                        if (trimmed && genres.indexOf(trimmed) === -1) genres.push(trimmed);
                    });
                } else if (genres.indexOf(txt) === -1) {
                    genres.push(txt);
                }
            });
        }

        // 3. Apply colours to spans that match the genre list
        $details.find('span').each(function () {
            var $span = window.$(this);
            var txt = $span.text().trim();
            if (!txt) return;
            // Some spans may contain multiple genres separated by commas.
            // In that case we wrap each into its own coloured badge.
            if (txt.indexOf(',') !== -1) {
                var parts = txt.split(',');
                var $wrapper = window.$('<span></span>').css({
                    'display': 'flex',
                    'flex-wrap': 'wrap',
                    'gap': '0.2em'
                });
                parts.forEach(function (part) {
                    var genreName = part.trim();
                    if (!genreName) return;
                    var col = getGenreColour(genreName);
                    var $badge = window.$('<span></span>').text(genreName).css({
                        'background-color': col.bg,
                        'color': col.text,
                        'border-radius': '0.3em',
                        'padding': '0.2em 0.5em',
                        'white-space': 'nowrap'
                    });
                    $wrapper.append($badge);
                });
                $span.replaceWith($wrapper);
            } else if (genres.indexOf(txt) !== -1) {
                var colour = getGenreColour(txt);
                $span.css({
                    'background-color': colour.bg,
                    'color': colour.text,
                    'border-radius': '0.3em',
                    'padding': '0.2em 0.5em',
                    'white-space': 'nowrap'
                });
            }
        });
    }

    /**
     * Initialise the plugin.  This sets up the stylesheet, hides
     * existing quality badges and installs an event listener for the
     * detail pages.  It also sets up a MutationObserver to hide
     * dynamically inserted quality badges in cards (e.g. when
     * scrolling through lists).
     */
    function initialise() {
        injectHideQualityStyle();

        // Immediately hide any quality badges that are already in the DOM
        window.$('.card__quality').hide();

        // Listen for the detail page being built.  Lampa emits a
        // `full` event when the user opens a movie or TV show.  We
        // process the details only when the event type is `complite`.
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite' || !event.data || !event.data.movie) return;
            var movie = event.data.movie;
            // `event.object.activity.render()` returns the root node for
            // the current view.  Use jQuery to locate the details
            // container; different templates use different class names.
            var $root = window.$(event.object.activity.render());
            var $details = $root.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
            if (!$details.length) {
                // Fallback: sometimes the title container holds the details
                $details = $root.find('.full-start-new__title, .full-start__title').parent();
                if (!$details.length) $details = $root;
            }
            styleGenresInDetails($details, movie);
        });

        // Observe DOM mutations to hide quality badges that appear
        // dynamically as lists are rendered or updated.
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                Array.prototype.forEach.call(mutation.addedNodes, function (node) {
                    if (!node || node.nodeType !== 1) return;
                    var $node = window.$(node);
                    // Hide quality badges in new elements
                    if ($node.hasClass('card__quality')) {
                        $node.hide();
                    }
                    $node.find('.card__quality').hide();
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // If jQuery is available on Lampa (it usually is) and the DOM is
    // ready, initialise immediately; otherwise wait a tick.  We also
    // respect LampaвЂ™s Settings system if present.  This ensures the
    // plugin does not run before the core application has been
    // initialised.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // Run slightly later to let Lampa finish initialisation
        setTimeout(initialise, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(initialise, 500);
        });
    }
})();
