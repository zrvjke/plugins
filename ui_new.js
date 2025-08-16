/**
 * Lampa plugin: Remove movie duration from the info line
 *
 * This plugin strips the runtime (formatted like 02:14) from the
 * information line that appears above the list of genres on a movie's
 * detail page.  In the stock interface the runtime is shown on the
 * left of the genre list and separated from the following values by a
 * dot or bullet.  The modified version of the вЂњInterface MODвЂќ plugin
 * by bywolf88 moves the runtime to the end of the line and reвЂ‘formats
 * it.  Our goal is different: we do not reposition or reformat the
 * runtime at allвЂ”we simply remove the runtime element entirely,
 * along with its adjacent separator.  This keeps the rest of the
 * details intact while omitting the length of the film.
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
                // Match times of the form "02:14" or "2:05"
                if (/^\d{1,2}:\d{2}$/.test(text)) {
                    // Attempt to remove a separator before or after the time
                    var $prev = $span.prev();
                    var $next = $span.next();
                    // Separator spans often have class full-start__split or
                    // full-start-new__split.  Sometimes the separator is
                    // simply a dot (".") or bullet ("вЂў") in its own span.
                    var isSeparator = function ($el) {
                        if (!$el || !$el.length) return false;
                        var cls = $el.attr('class') || '';
                        var txt = ($el.text() || '').trim();
                        return /full-start.*__split/.test(cls) || /^[\.В·вЂў|]$/.test(txt);
                    };
                    // Remove the separator either before or after the time
                    if (isSeparator($prev)) {
                        $prev.remove();
                    } else if (isSeparator($next)) {
                        $next.remove();
                    }
                    // Remove the time span itself
                    $span.remove();
                }
            });
        });
    }

    /**
     * Initialize the plugin by hooking into Lampa's event system.  We
     * listen for the 'full' view to complete loading.  When that
     * happens we schedule a short timeout to give the DOM time to
     * render and then perform the removal.
     */
    function initPlugin() {
        // Guard against missing globals
        if (typeof Lampa === 'undefined' || !Lampa.Listener) return;
        Lampa.Listener.follow('full', function (data) {
            if (data && data.type === 'complite') {
                // Use a slight delay to ensure the DOM is ready
                setTimeout(removeDurationFromDetails, 50);
            }
        });
    }

    // Some builds of Lampa expose an `appready` flag once initial
    // startup completes.  If it's already ready we initialise
    // immediately; otherwise we wait until the DOMContentLoaded event.
    if (window.appready) {
        initPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', initPlugin);
    }
})();
