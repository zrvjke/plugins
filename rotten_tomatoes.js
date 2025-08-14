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
    Lampa.Lang.add({
        en: {
            'rt_plugin_name': 'Rotten Tomatoes (OMDb)',
            'rt_plugin_descr': 'Adds critics and audience scores from Rotten Tomatoes and optionally hides the TMDb rating.',
            'rt_api_key_label': 'API key for OMDb',
            'rt_api_key_descr': 'Enter a valid OMDb API key to fetch Rotten Tomatoes scores. Without a key the plugin will display “--”.',
            'rt_enter_api_prompt': 'Enter your OMDb API key:',
            'rt_disable_tmdb_label': 'Hide TMDb rating',
            'rt_disable_tmdb_descr': 'Remove the built‑in TMDb score from cards.'
        },
        ru: {
            'rt_plugin_name': 'Rotten Tomatoes (OMDb)',
            'rt_plugin_descr': 'Добавляет оценки критиков и зрителей Rotten Tomatoes и позволяет скрывать рейтинг TMDb.',
            'rt_api_key_label': 'API‑ключ OMDb',
            'rt_api_key_descr': 'Введите действительный API‑ключ OMDb для загрузки оценок Rotten Tomatoes. Без ключа плагин будет отображать «--».',
            'rt_enter_api_prompt': 'Введите ваш API‑ключ OMDb:',
            'rt_disable_tmdb_label': 'Скрыть рейтинг TMDb',
            'rt_disable_tmdb_descr': 'Убирает встроенный рейтинг TMDb из карточек.'
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
            name: Lampa.Lang.translate('rt_plugin_name'),
            icon: svgIcon
        });

        // Button parameter to prompt for the API key.  We deliberately use
        // type:'button' because Lampa’s API does not currently support text
        // inputs.  A modal prompt is used to ask the user for their key.
        Lampa.SettingsApi.addParam({
            component: 'rotten_tomatoes',
            param: {
                name: 'rt_api_button',
                type: 'button',
                component: 'rt_api_button'
            },
            field: {
                name: Lampa.Lang.translate('rt_api_key_label'),
                description: Lampa.Lang.translate('rt_api_key_descr')
            },
            onChange: function () {
                // Use the native prompt; this works both in the web and desktop
                // versions of Lampa.  Prepopulate with the existing key.  If
                // the user cancels, no changes are made.
                var result = prompt(Lampa.Lang.translate('rt_enter_api_prompt'), apiKey || '');
                if (result !== null) setApiKey(result.trim());
            }
        });

        // Toggle parameter to hide the TMDb rating.  When switched the
        // preference is persisted; the actual hiding logic runs in the
        // `onCardRender` handler below.
        Lampa.SettingsApi.addParam({
            component: 'rotten_tomatoes',
            param: {
                name: 'rt_hide_tmdb',
                type: 'trigger',
                default: hideTmdb
            },
            field: {
                name: Lampa.Lang.translate('rt_disable_tmdb_label'),
                description: Lampa.Lang.translate('rt_disable_tmdb_descr')
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

        // Append critic and audience placeholders.  We use spans with
        // distinctive classes to facilitate later updates.  The icons are
        // inline images sized to match existing Lampa ratings.
        var criticsHTML = '<span class="rate rate--rt-critics"><span>' +
            '<img src="' + TOMATO_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">--' +
            '</span></span>';
        var audienceHTML = '<span class="rate rate--rt-audience"><span>' +
            '<img src="' + POPCORN_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">--' +
            '</span></span>';
        infoRate.append(criticsHTML + audienceHTML);

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

        // Update critics rating
        $('.rate--rt-critics span', renderRoot).each(function () {
            $(this).html('<img src="' + TOMATO_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">' +
                criticsText);
        });

        // Update audience rating
        $('.rate--rt-audience span', renderRoot).each(function () {
            $(this).html('<img src="' + POPCORN_ICON + '" style="height:1em;width:1em;margin-right:0.2em;vertical-align:-0.1em;">' +
                audienceText);
        });
    }

})();
