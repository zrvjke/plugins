/*
 * Lampa Plugin: Hide quality labels and add a semiвЂ‘transparent backdrop to genres
 *
 * This plugin removes quality/source tags (WEBRip, TS, BDRip, 4K, etc.)
 * from movie/series cards and the information panel, then applies a
 * uniform semiвЂ‘transparent black background to each genre listed on
 * the detail page.  The genres are detected from the movie object
 * provided by Lampa where possible; if unavailable, text is split on
 * commas in the information panel itself.  Each genre is wrapped
 * separately when multiple genres are listed together.  The goal is
 * similar to the genre styling in ui_new.js but uses a single
 * semiвЂ‘transparent background (no perвЂ‘genre colours) like the
 * RottenВ Tomatoes rating blocks (rgba(0,0,0,0.4))гЂђ271215840515611вЂ L59-L64гЂ‘.
 */

(function () {
    'use strict';
    // Ensure the plugin only runs once and only when Lampa is available
    if (!window.Lampa || window.semitransparentGenrePluginInjected) return;
    window.semitransparentGenrePluginInjected = true;

    /**
     * Inject a stylesheet to globally hide quality/source labels on cards.
     * Quality badges are contained in `.card__quality` elements and
     * occasionally appear as a modifier on `.card__view` (the preview
     * overlay).  This CSS hides them everywhere in the interface.
     */
    function injectHideQualityStyle() {
        if (document.getElementById('semigenre-hide-quality-style')) return;
        var style = document.createElement('style');
        style.id = 'semigenre-hide-quality-style';
        style.textContent = [
            '/* Hide quality/source labels in movie/series cards */',
            '.card__quality,',
            '.card__view--quality {',
            '    display: none !important;',
            '}',
            ''
        ].join('\n');
        document.head.appendChild(style);
    }

    /**
     * Regular expression used to detect quality or source descriptors
     * embedded in spans.  Matches common tags such as WEBRip, HDRip,
     * BluRay, BDRip, TS, CAM, 4K, etc.  Any span matching this pattern
     * will be removed from the information panel entirely.
     */
    var QUALITY_PATTERN = /\b(?:WEB\s?Rip|WEB|HDRip|HDTV|BluRay|DVDRip|BDRip|TS|CAM|4K|8K|2160p|1080p|720p)\b/i;

    /**
     * Apply a uniform semiвЂ‘transparent style to a jQuery element
     * representing a single genre.  The background colour mirrors
     * RottenВ Tomatoes blocks (`rgba(0,0,0,0.4)`)гЂђ271215840515611вЂ L59-L64гЂ‘ and the text is white.
     *
     * @param {jQuery} $el The element to style
     */
    function applyGenreStyle($el) {
        $el.css({
            'background-color': 'rgba(0, 0, 0, 0.4)',
            'color': '#fff',
            'border-radius': '0.3em',
            'padding': '0.2em 0.5em',
            'white-space': 'nowrap',
            'margin-right': '0.2em'
        });
    }

    /**
     * Style the genres in the details panel.  Removes quality tags,
     * builds a unique list of genres from the movie object (or
     * fallback parsing), then wraps/composes spans so that each
     * individual genre receives a semiвЂ‘transparent backdrop.  NonвЂ‘genre
     * items (such as ratings or duration) are left untouched.
     *
     * @param {jQuery} $details  The container holding detail spans
     * @param {Object} movie     The movie object from Lampa
     */
    function styleGenres($details, movie) {
        if (!$details || !$details.length) return;
        // 1. Remove quality/source tags from the details panel
        $details.find('span').each(function () {
            var $span = window.$(this);
            var txt = $span.text().trim();
            if (QUALITY_PATTERN.test(txt)) {
                $span.remove();
            }
        });

        // 2. Build a list of genres from the movie object if available
        var genreList = [];
        if (movie && movie.genres) {
            if (Array.isArray(movie.genres)) {
                genreList = movie.genres.map(function (g) { return String(g).trim(); });
            } else if (typeof movie.genres === 'string') {
                movie.genres.split(',').forEach(function (g) {
                    var t = g.trim();
                    if (t) genreList.push(t);
                });
            }
        }

        // 3. Fallback: if no genres available via movie object, parse spans
        if (genreList.length === 0) {
            $details.find('span').each(function () {
                var text = window.$(this).text().trim();
                if (!text) return;
                if (text.indexOf(',') !== -1) {
                    text.split(',').forEach(function (part) {
                        var trimmed = part.trim();
                        if (trimmed && genreList.indexOf(trimmed) === -1) genreList.push(trimmed);
                    });
                } else if (genreList.indexOf(text) === -1) {
                    genreList.push(text);
                }
            });
        }

        // 4. Iterate over spans and apply styling.  When multiple genres
        //    appear in one span separated by commas, wrap each in its
        //    own badge.  Only style spans whose text matches our genre
        //    list to avoid altering nonвЂ‘genre details like year or
        //    ratings.
        $details.find('span').each(function () {
            var $span = window.$(this);
            var text = $span.text().trim();
            if (!text) return;
            if (text.indexOf(',') !== -1) {
                var parts = text.split(',');
                var $wrapper = window.$('<span></span>').css({
                    'display': 'flex',
                    'flex-wrap': 'wrap',
                    'gap': '0.2em'
                });
                parts.forEach(function (part) {
                    var trimmed = part.trim();
                    if (!trimmed) return;
                    var $badge = window.$('<span></span>').text(trimmed);
                    applyGenreStyle($badge);
                    $wrapper.append($badge);
                });
                $span.replaceWith($wrapper);
            } else {
                // Only style if the span text is recognised as a genre
                // either via the movie object or by simple heuristics
                var isGenre = false;
                if (genreList.indexOf(text) !== -1) {
                    isGenre = true;
                } else {
                    // Heuristic: treat as genre if it starts with a
                    // Latin or Cyrillic letter and contains no digits.
                    // Avoid using Unicode property escapes for wider
                    // compatibility with older JavaScript engines.
                    if (/^[A-Za-z\u0400-\u04FF][^\d]*$/.test(text)) {
                        isGenre = true;
                    }
                }
                if (isGenre) {
                    applyGenreStyle($span);
                }
            }
        });
    }

    /**
     * Initialise the plugin: hide quality tags, then hook into
     * LampaвЂ™s `full` event to style genres on detail pages.  A
     * MutationObserver hides any dynamically inserted quality tags.
     */
    function init() {
        injectHideQualityStyle();
        // Hide existing quality badges immediately
        window.$('.card__quality').hide();
        // Listen for detail pages being built
        Lampa.Listener.follow('full', function (e) {
            if (!e || e.type !== 'complite' || !e.data || !e.data.movie) return;
            var movie = e.data.movie;
            var $root = window.$(e.object.activity.render());
            var $details = $root.find(
                '.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info'
            );
            if (!$details.length) {
                // Fallback: some templates attach details to the title
                $details = $root.find('.full-start-new__title, .full-start__title').parent();
                if (!$details.length) $details = $root;
            }
            styleGenres($details, movie);
        });
        // Observe DOM mutations to hide newly added quality badges
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                Array.prototype.forEach.call(mutation.addedNodes, function (node) {
                    if (!node || node.nodeType !== 1) return;
                    var $node = window.$(node);
                    if ($node.hasClass('card__quality')) {
                        $node.hide();
                    }
                    $node.find('.card__quality').hide();
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Run initialisation once the DOM and Lampa are ready.  We wait
    // briefly because Lampa often finishes bootstrapping a little after
    // DOMContentLoaded.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 500);
        });
    }
})();
