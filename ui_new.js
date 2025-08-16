/**
 * Lampa plugin: Remove movie duration from the info line
 *
 * This plugin removes unneeded metadata from the information line that
 * appears above the list of genres on a movie or series detail page.
 * For films, it strips the runtime (formatted like "02:14") that
 * appears on the left of the genre list.  For TV series, it removes
 * the blocks that show the number of seasons and episodes (e.g.
 * "РЎРµР·РѕРЅС‹: 1 В· РЎРµСЂРёРё: 8").  In the stock interface these items are
 * separated from the rest of the details by dots or bullets.  We do
 * not reposition or reformat themвЂ”our goal is to remove the elements
 * entirely, along with their adjacent separators.  This keeps the
 * remaining details intact while omitting the length of the film or
 * the season/episode counts for serials.
 *
 * The implementation relies on Lampa's event system.  When the
 * 'full' view finishes loading (the `complite` event) we scan the
 * details container for spans whose text matches a time in HH:MM
 * format and remove them.  We also remove the preceding or following
 * separator element (`full-start__split`/`full-start-new__split` or a
 * span containing a dot/bullet) to avoid leaving a stray dot at the
 * beginning of the genre list.  The plugin is selfвЂ‘contained and
 * activates itself automatically once Lampa has loaded.
 */

(function () {
    'use strict';

    /**
     * Remove runtime spans and their adjacent separators from the
     * details section.  This function will search both the legacy
     * (fullвЂ‘start__details) and the new (fullвЂ‘startвЂ‘new__details)
     * containers and perform the removal.
     */
    function removeDurationFromDetails() {
        // Collect all potential detail containers
        var $containers = $('.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info');
        $containers.each(function () {
            var $container = $(this);
            // Iterate over all span elements within the container
            $container.find('span').each(function () {
                var $span = $(this);
                var text = $span.text().trim();
                // Determine whether this span represents a runtime (HH:MM)
                // or season/episode information.  We treat any occurrence of
                // В«РЎРµР·РѕРЅВ», В«РЎРµР·РѕРЅС‹В», В«РЎРµСЂРёСЏВ», В«РЎРµСЂРёРёВ» or their plural forms as
                // indicating season/episode metadata.  This is more robust
                // than matching exact numeric formats and helps catch
                // variants like "1 СЃРµР·РѕРЅ 8 СЃРµСЂРёР№" or "РЎРµР·РѕРЅС‹: 3".
                var isTime = /^\d{1,2}:\d{2}$/.test(text);
                // Match keywords for seasons and episodes regardless of
                // order or punctuation.  The "i" flag makes the match
                // caseвЂ‘insensitive.
                var containsSeasonKeyword = /РЎРµР·РѕРЅ(?:С‹)?/i.test(text);
                var containsEpisodeKeyword = /РЎРµСЂ(?:РёСЏ|РёРё|РёР№)/i.test(text);
                var isSeason = containsSeasonKeyword;
                var isEpisode = containsEpisodeKeyword;
                if (isTime || isSeason || isEpisode) {
                    var $prev = $span.prev();
                    var $next = $span.next();
                    var isSeparator = function ($el) {
                        if (!$el || !$el.length) return false;
                        var cls = $el.attr('class') || '';
                        var txt = ($el.text() || '').trim();
                        return /full-start.*__split/.test(cls) || /^[\.В·вЂў|]$/.test(txt);
                    };
                    // Remove an adjacent separator to avoid stray dots
                    if (isSeparator($prev)) {
                        $prev.remove();
                    } else if (isSeparator($next)) {
                        $next.remove();
                    }
                    $span.remove();
                }
            });
        });
    }

    /**
     * Attach a MutationObserver to the provided element to ensure that
     * newly added spans matching the runtime format are removed.  This
     * observer reвЂ‘applies the removal logic whenever the children of
     * the details container change (e.g. when Lampa updates the info
     * panel asynchronously).
     *
     * @param {HTMLElement} element The container to observe
     */
    function observeDetails(element) {
        if (!element || !element.nodeType) return;
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function () {
                removeDurationFromDetails();
            });
        });
        observer.observe(element, { childList: true, subtree: true });
    }

    /**
     * Handler for the 'full' view completion event.  When a movie or
     * series detail page finishes loading, we invoke the removal and
     * attach observers to its details containers so that dynamic
     * updates cannot restore the removed runtime.
     *
     * @param {Object} data Event data from Lampa.Listener.follow
     */
    function handleFullEvent(data) {
        if (!data || data.type !== 'complite') return;
        // Slight delay to allow the DOM to finish rendering
        setTimeout(function () {
            removeDurationFromDetails();
            // Attach observers to each details container
            var containers = document.querySelectorAll('.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info');
            containers.forEach(function (el) {
                observeDetails(el);
            });
        }, 100);
    }

    /**
     * Initialise the plugin once Lampa is available.  We poll for
     * Lampa.Listener to appear on the global object and then register
     * our event handler.  This avoids race conditions where the
     * plugin is loaded before Lampa itself.
     */
    function waitForLampa() {
        if (typeof window !== 'undefined' && typeof window.Lampa !== 'undefined' && window.Lampa.Listener && typeof window.Lampa.Listener.follow === 'function') {
            // Register the handler for 'full' events
            window.Lampa.Listener.follow('full', handleFullEvent);
            // Also perform an initial removal in case the plugin loads
            // after the first detail page has already rendered
            setTimeout(function () {
                removeDurationFromDetails();
            }, 200);
        } else {
            // Try again shortly
            setTimeout(waitForLampa, 200);
        }
    }

    // Begin waiting for Lampa to be ready.  This call is executed
    // immediately when the plugin script is evaluated.
    waitForLampa();
})();
