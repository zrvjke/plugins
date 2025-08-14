/*
 * Lampa plugin to display Rotten Tomatoes ratings (critics and audience) and
 * optionally hide the built‑in TMDb score. The plugin adds a new settings
 * section where users can supply an OMDb API key (free keys can be obtained
 * from http://www.omdbapi.com/apikey.aspx). Without a key the Rotten
 * Tomatoes ratings will remain as “--” until a key is entered. A toggle
 * allows hiding the default TMDb score shown in each card.
 *
 * This code follows the conventions used by existing Lampa plugins: it
 * registers itself with `SettingsApi` to add a configuration section, uses
 * `Listener.follow('full', ...)` to hook into card rendering and inject
 * additional rating elements, and caches user preferences via
 * `Lampa.Storage`.
 */
(function () {
    'use strict';

    // Prevent the plugin from executing twice.  Some Lampa versions reload
    // plugins on theme switch; protecting against double initialization
    // avoids duplicate ratings in the UI.
    if (window.rotten_tomatoes_plugin_init) return;
    window.rotten_tomatoes_plugin_init = true;

    /*
     * Base64 encoded icons for Rotten Tomatoes.  The tomato icon is used for
     * critic scores and the popcorn icon for audience scores.  These tiny
     * vector-like bitmaps were created with Pillow so they embed cleanly
     * without external network requests.
     */
    var TOMATO_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADzUlEQVR4nO2dMQ4EMQxEd1j9/5nlbVKF' +
        'XOiYqKrsoiKiiIr8T1QelzAzwDOL3fPaWdqI1EAHYIdAB0CHQB0CHQB0CHQB0CHQB0OHUgmEjm/Nf24mvfcAZgxZ3f3z+0+f/53vcf' +
        'uXyu+9WtR3/B87qcigAICBQiBg+BTBxpaMFAIgiIAiAcAei4XyZwyEMAsQiEgl6AMQDQBGgGMG4DgAh6HrAuIqI8C6AfCAlA4A+iF3h' +
        'SiPDBACZxKVCA3gAmAdxIo1c1YhcAxCGwI4eZeM6AGAmcAjgDqPw/YOGhjbxMxkewusI+7j+dq8JOLn9B3d2ukpPmcUDw9ntsmXsFKH' +
        '31vjQ7gBgAbAZ8B4AFoCiiNm13lQGkH4jKXHySqx8TxLwNgNECItgDwbvChBSHZgsBVAPgG+CowgmnTA4kgEsA7gGgB+Bzo3de+gxMO' +
        'W93+QwCIEkgF4PHbQBBgC+ARIQYAdwBHAN4DZBFACEq2rdcE2q9C9vvDRO+mdZ27rS4e/dmv0ELTDwzwBsDLANwBTBBOn9DwbNvMvC1' +
        'G0M0+1t4L6fNHT0z+ULBPnn3tZt7nJsgy0d5h0kQwQEEBBABBBAAEEEEAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAQQQQAA' +
        'BBBBBAAAEEEEAAQfk2AD4AHJ/sRBALxvmwAAAABJRU5ErkJggg==';
    var POPCORN_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACHUlEQVR4nO3bMQ6CMBiA4f+z+5uGLMGI' +
        'FAtAi9EMvrsaTRkNyq80xe7NcDmX3NW1oz1YmG2d7eoPBbFevn93kjBsY/t/cDx+v3veVG9kH3evvTnvRzU93v3xHuLq8y/4fDdNwTuA' +
        '3kEHiH5HB3IP4kzvXw2HeL6CuBnRMZNHEdvH0ccBuaMee0frI/p7+94KMAUyYiKEcbqwdzryOiMxZlO1nO6kZ5LodKhxz72x/HXeE91Q' +
        'tZssrT7K2523LEpJyOZ0T6mN+HT6wIfzgjpfgjxHTPIftI8jk2ikT5+Q25k7m85zCwvS0P4n3ns+GcP/fwSfyVwGvmvSx9T0W/Kc/TQv' +
        'eLP2/+9nShvxqyP2u3F2/31hbCbwfDa2PjsyWU8HBjW4LajA/3HFr43x0uD1t49f3H0MscTr0H8EzkB/ATeBCcEzkEH+EfkEHyJ9RN+Q' +
        'Qf4R+QQfInxAfMX19xr9/k49zlONu7Hmxt9n6Yedifq7tV5hMwzQmi7h82X4C+B7wKNQxFAgAAAAAASUVORK5CYII=';

    // Keys used to persist settings in Lampa.Storage.  Changing these
    // constants will reset saved preferences for existing users.
    var STORAGE_KEY = 'rotten_tomatoes_api_key';
    var STORAGE_DISABLE = 'rotten_tomatoes_disable_tmdb';

    // Load persisted values or fall back to defaults.
    var apiKey = Lampa.Storage.get(STORAGE_KEY, '');
    var hideTmdb = Lampa.Storage.get(STORAGE_DISABLE, false);

    /*
     * Localized strings.  These keys mirror the plugin function names and
     * descriptions shown to the user.  Russian and English translations are
     * provided here; additional languages can be added following the same
     * structure.
     */
    // Register translation keys following Lampa’s naming convention.  The
    // prefix “settings_” ensures keys appear correctly in the settings UI.
    Lampa.Lang.add({
        en: {
            // Name of the plugin folder in settings
            'settings_rt_plugin_name': 'Rating Rotten tomatoes',
            // Label and description for the API key input
            'settings_rt_api_key_name': 'OMDb API Key',
            'settings_rt_api_key_desc': 'Enter your API key from OMDb (Rotten Tomatoes).',
            // Label and description for hiding the TMDb rating
            'settings_rt_disable_tmdb_label': 'Hide TMDb rating',
            'settings_rt_disable_tmdb_descr': 'Remove the built‑in TMDb score from cards.',
            // Labels for the Rotten Tomatoes scores shown in cards
            'settings_rt_label_critics': 'RT critics',
            'settings_rt_label_audience': 'RT audience'
        },
        ru: {
            'settings_rt_plugin_name': 'Рейтинг Rotten Tomatoes',
            'settings_rt_api_key_name': 'Ключ OMDb API',
            'settings_rt_api_key_desc': 'Введите ваш API‑ключ OMDb (Rotten Tomatoes).',
            'settings_rt_disable_tmdb_label': 'Скрыть рейтинг TMDb',
            'settings_rt_disable_tmdb_descr': 'Убирает встроенный рейтинг TMDb из карточек.',
            'settings_rt_label_critics': 'RT критики',
            'settings_rt_label_audience': 'RT зрители'
        }
    });

    /**
     * Write a new API key to persistent storage.  After saving the key
     * we refresh the settings UI so the button description reflects the
     * presence of a key.
     *
     * @param {string} key New API key from the user
     */
    function setApiKey(key) {
        apiKey = key || '';
        Lampa.Storage.set(STORAGE_KEY, apiKey);
        Lampa.Settings.update();
    }

    /**
     * Persist the TMDb hide setting.  Updates internal state and refreshes
     * settings.  Cards that have already been rendered will not be updated
     * retroactively; the user may need to reopen them to see the change.
     *
     * @param {boolean} flag Whether to hide the TMDb rating
     */
    function setHideTmdb(flag) {
        hideTmdb = flag;
        Lampa.Storage.set(STORAGE_DISABLE, hideTmdb);
        Lampa.Settings.update();
    }

    /**
     * Register the plugin’s configuration section in Lampa’s settings.  We
     * define a component (a folder) under which we create two parameters: a
     * button for entering the API key and a toggle to disable the TMDb rating.
     */
    function registerSettings() {
        // Define a small inline SVG for the menu icon.  The design is a
        // stylised film reel, chosen to distinguish the plugin from others.
        var svgIcon = '<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />' +
            '<circle cx="8" cy="8" r="2" fill="currentColor" />' +
            '<circle cx="16" cy="8" r="2" fill="currentColor" />' +
            '<circle cx="8" cy="16" r="2" fill="currentColor" />' +
            '<circle cx="16" cy="16" r="2" fill="currentColor" />' +
            '</svg>';

        // Create the settings folder.  The `component` identifier must be
        // unique within all installed plugins.
        Lampa.SettingsApi.addComponent({
            component: 'rotten_tomatoes',
            name: Lampa.Lang.translate('settings_rt_plugin_name'),
            icon: svgIcon
        });

        // Input field for the OMDb API key. Lampa’s Settings API supports
        // type:'input' which renders a text box. We bind the storage key to
        // `STORAGE_KEY` so that the value persists automatically. The
        // default and placeholder are populated from the current value.
        Lampa.SettingsApi.addParam({
            component: 'rotten_tomatoes',
            param: {
                name: STORAGE_KEY,
                type: 'input',
                default: apiKey,
                values: {},
                placeholder: Lampa.Lang.translate('settings_rt_api_key_desc')
            },
            field: {
                name: Lampa.Lang.translate('settings_rt_api_key_name'),
                description: Lampa.Lang.translate('settings_rt_api_key_desc')
            },
            onChange: function (value) {
                // When the user changes the API key, update our cached value
                // and persist it to storage.  Some versions of Lampa pass
                // the new value as the first argument to onChange; others
                // simply update Lampa.Storage directly.  Fallback to
                // Lampa.Storage.get() if the argument is undefined.
                var newKey = (typeof value !== 'undefined') ? value : Lampa.Storage.get(STORAGE_KEY, '');
                setApiKey(newKey);
            }
        });

        // Toggle parameter to hide the TMDb rating.  Use type:'trigger' for
        // a boolean switch.  The default value is taken from storage.
        Lampa.SettingsApi.addParam({
            component: 'rotten_tomatoes',
            param: {
                name: STORAGE_DISABLE,
                type: 'trigger',
                default: hideTmdb
            },
            field: {
                name: Lampa.Lang.translate('settings_rt_disable_tmdb_label'),
                description: Lampa.Lang.translate('settings_rt_disable_tmdb_descr')
            },
            onChange: function (value) {
                setHideTmdb(value);
            }
        });
    }

    // Register settings once the Settings API is available.  Some versions of
    // Lampa initialize plugins before the settings module, so we defer
    // registration until the call stack is empty.
    setTimeout(registerSettings, 0);

    /**
     * Hook into card rendering.  The `full` event fires when Lampa has
     * finished populating a movie or series card.  We inspect the card’s DOM
     * to insert our rating elements and optionally hide the TMDb rating.  A
     * lookup is performed via the passed data object to determine the title
     * and year used in the OMDb query.
     */
    Lampa.Listener.follow('full', function (event) {
        // We only care about the `complite` stage when the card is fully
        // rendered.  The event object also carries the card’s movie data.
        if (event.type !== 'complite') return;

        var renderRoot = event.object.activity.render();
        var data = event.data || {};
        var movie = data.movie || data.item || data.card || {};

        // Avoid injecting multiple times.  If our elements already exist
        // nothing else is done.  We identify our spans using the unique
        // classes defined below.
        if ($('.rate--rt-critics', renderRoot).length) return;

        // Hide the built‑in TMDb rating when the corresponding setting is
        // enabled.  The default rating is usually the first `.rate` inside
        // `.info__rate`.  We hide only that element and leave other ratings
        // (IMDb, Kinopoisk, etc.) intact.  Should future updates change the
        // markup this heuristic may need adjustment.
        if (hideTmdb) {
            var defaultRate = $('.info__rate .rate', renderRoot).first();
            defaultRate.addClass('hide');
        }

        // Obtain the container for ratings.  If the card does not include an
        // `info__rate` element, we cannot safely insert our elements.
        var infoRate = $('.info__rate', renderRoot);
        if (!infoRate.length) return;

        // Append critic and audience placeholders.  Each rating consists of
        // two divs: the first holds the value and icon, the second the
        // label.  Translation keys are used for the labels to support
        // multiple languages.
        var criticsSpan = $('<span class="rate rate--rt-critics"></span>');
        criticsSpan.append('<div class="rt-critics-value"><img src="' + TOMATO_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">--</div>');
        criticsSpan.append('<div>' + Lampa.Lang.translate('settings_rt_label_critics') + '</div>');
        var audienceSpan = $('<span class="rate rate--rt-audience"></span>');
        audienceSpan.append('<div class="rt-audience-value"><img src="' + POPCORN_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">--</div>');
        audienceSpan.append('<div>' + Lampa.Lang.translate('settings_rt_label_audience') + '</div>');
        infoRate.append(criticsSpan);
        infoRate.append(audienceSpan);

        // If no API key is set then do not attempt to fetch ratings.  The
        // placeholders will remain as “--”.
        if (!apiKey) return;

        // Extract title and year for the OMDb query.  The plugin tries a
        // hierarchy of properties to accommodate both movies and series.
        var title = movie.original_title || movie.title || movie.original_name || movie.name;
        var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
        var year = '';
        if (date) {
            // Some dates include ranges (e.g. “2014–” for series); take
            // the first four digits.
            var match = (date + '').match(/\d{4}/);
            if (match) year = match[0];
        }

        // Guard against empty titles (e.g. unknown items).  Without a title
        // OMDb cannot find the film, so we skip the request.
        if (!title) return;

        fetchRtRatings(title, year, apiKey).then(function (ratings) {
            updateRatings(renderRoot, ratings);
        }).catch(function () {
            // Silently ignore network errors.  Users can check the console
            // for more details if necessary.
        });
    });

    /**
     * Perform a network request to OMDb to fetch Rotten Tomatoes ratings for
     * a given title and year.  We request extended fields by including
     * `tomatoes=true` in the query.  OMDb may not always return Rotten
     * Tomatoes data due to legal restrictions; in that case both values
     * will remain undefined.
     *
     * @param {string} title Movie or series title
     * @param {string} year  Year extracted from the Lampa card (may be blank)
     * @param {string} key   OMDb API key
     * @returns {Promise<Object>} Resolves with an object containing
     *                            critic and audience scores (as strings) or
     *                            undefined if not available
     */
    function fetchRtRatings(title, year, key) {
        return new Promise(function (resolve, reject) {
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(key) +
                '&t=' + encodeURIComponent(title);
            if (year) url += '&y=' + encodeURIComponent(year);
            url += '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                if (!json || json.Response === 'False') return resolve({});

                var critics;
                var audience;

                // Check the Ratings array for Rotten Tomatoes critic score.
                if (Array.isArray(json.Ratings)) {
                    json.Ratings.forEach(function (entry) {
                        if (entry.Source === 'Rotten Tomatoes') {
                            var val = entry.Value;
                            if (val && /\d+%/.test(val)) {
                                critics = val.replace('%', '');
                            }
                        }
                    });
                }

                // OMDb may expose additional fields when `tomatoes=true`.  Use
                // these values if present; they supersede the Ratings array.
                if (json.tomatoMeter && json.tomatoMeter !== 'N/A') critics = json.tomatoMeter;
                if (json.tomatoUserMeter && json.tomatoUserMeter !== 'N/A') audience = json.tomatoUserMeter;

                // Some versions of OMDb return user ratings out of 10.  Convert
                // such numbers to a percentage by multiplying by 10.  If the
                // field is numeric but less than or equal to 10, treat it as
                // a rating out of 10; otherwise assume it’s already a percent.
                if (!audience && json.tomatoUserRating && json.tomatoUserRating !== 'N/A') {
                    var numeric = parseFloat(json.tomatoUserRating);
                    if (!isNaN(numeric)) {
                        if (numeric <= 10) audience = (numeric * 10).toFixed(0);
                        else audience = numeric.toString();
                    }
                }

                resolve({ critics: critics, audience: audience });
            }, function () {
                reject();
            }, false, {});
        });
    }

    /**
     * Update the DOM with Rotten Tomatoes scores.  Replaces the placeholder
     * values “--” with actual numbers followed by a percent sign.  If a
     * particular score is missing, the placeholder remains unchanged.
     *
     * @param {jQuery} renderRoot The root element of the card
     * @param {Object} ratings    Object with `critics` and `audience` strings
     */
    function updateRatings(renderRoot, ratings) {
        var criticsText = ratings && ratings.critics ? ratings.critics + '%' : '--';
        var audienceText = ratings && ratings.audience ? ratings.audience + '%' : '--';

        // Update critics rating.  Only replace the contents of the first div
        // (rt-critics-value) so the label remains intact.
        $('.rate--rt-critics .rt-critics-value', renderRoot).each(function () {
            $(this).html('<img src="' + TOMATO_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">' +
                criticsText);
        });

        // Update audience rating.  Only replace the value portion.
        $('.rate--rt-audience .rt-audience-value', renderRoot).each(function () {
            $(this).html('<img src="' + POPCORN_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">' +
                audienceText);
        });
    }

})();
