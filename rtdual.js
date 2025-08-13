(function () {
    'use strict';

    var RottenTomatoes = {
        name: 'rotten_tomatoes',
        version: '1.0.0',
        settings: {
            apikey: Lampa.Storage.get('rotten_tomatoes_apikey', ''),
            disable_tmdb: Lampa.Storage.get('rotten_tomatoes_disable_tmdb', false)
        }
    };

    function createSettingsComponent() {
        var html = $('<div class="settings-category"><div class="settings-param selector"><div class="settings-param__name">Rotten Tomatoes (OMDb)</div><div class="settings-param__value"></div></div></div>');

        var apiInput = $('<div class="settings-param selector"><div class="settings-param__name">OMDb API Key</div><div class="settings-param__value"><input type="text" placeholder="Введите ваш OMDb API ключ (omdbapi.com)" value="' + RottenTomatoes.settings.apikey + '"></div></div>');
        apiInput.find('input').on('input', function () {
            RottenTomatoes.settings.apikey = $(this).val();
            Lampa.Storage.set('rotten_tomatoes_apikey', $(this).val());
            console.log('API Key updated to:', $(this).val());
        });
        html.find('.settings-param__value').eq(0).append(apiInput);

        var disableToggle = $('<div class="settings-param selector"><div class="settings-param__name">Отключить рейтинг TMDB</div><div class="settings-param__value"><label><input type="checkbox" ' + (RottenTomatoes.settings.disable_tmdb ? 'checked' : '') + '> Включить</label></div></div>');
        disableToggle.find('input').on('change', function () {
            RottenTomatoes.settings.disable_tmdb = $(this).is(':checked');
            Lampa.Storage.set('rotten_tomatoes_disable_tmdb', $(this).is(':checked'));
            applyStyles();
            console.log('TMDB disabled:', $(this).is(':checked'));
        });
        html.append(disableToggle);

        return html;
    }

    function mountSettingsEntry() {
        const attachOnce = () => {
            const menu = document.querySelector('.settings .menu .list, .settings .menu__list, .settings .scroll .list');
            if (!menu) return;

            if (menu.querySelector(`[data-rt="rotten_tomatoes"]`)) return;

            const item = document.createElement('div');
            item.className = 'selector';
            item.setAttribute('data-rt', 'rotten_tomatoes');
            item.innerHTML = `<div class="name">🍅 Rotten Tomatoes</div>`;

            item.addEventListener('click', function () {
                const root = document.createElement('div');
                root.appendChild(createSettingsComponent());
                Lampa.Modal.open({
                    title: 'Rotten Tomatoes Settings',
                    html: root,
                    onBack: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle('settings_component');
                    }
                });
            });
            menu.appendChild(item);
        };

        attachOnce();
        Lampa.Listener.follow('settings', (e) => {
            if (e.type === 'open') setTimeout(attachOnce, 50);
        });
    }

    function applyStyles() {
        $('#rotten_tomatoes_styles').remove();
        if (RottenTomatoes.settings.disable_tmdb) {
            var style = document.createElement('style');
            style.id = 'rotten_tomatoes_styles';
            style.innerHTML = '.card__rate--tmdb, .full--rating .rating-tmdb { display: none !important; }';
            document.head.appendChild(style);
        }
        console.log('Styles applied, TMDB disabled:', RottenTomatoes.settings.disable_tmdb);
    }

    applyStyles();

    function getOMDbData(movie, callback) {
        var apikey = RottenTomatoes.settings.apikey;
        if (!apikey) {
            console.log('No API key provided, ratings will not load');
            return;
        }

        var imdb_id = movie.imdb_id || movie.imdbId;
        var url = imdb_id ? `http://www.omdbapi.com/?apikey=${apikey}&i=${imdb_id}&tomatoes=true` : `http://www.omdbapi.com/?apikey=${apikey}&t=${encodeURIComponent(movie.title || movie.name)}&y=${movie.year || ''}&tomatoes=true`;

        var cache_key = 'rt_' + (imdb_id || encodeURIComponent(movie.title + '_' + (movie.year || '')));
        var cache = Lampa.Storage.cache('rt_rating', 500, {});
        var timestamp = new Date().getTime();

        if (cache[cache_key] && (timestamp - cache[cache_key].timestamp) < 86400000) {
            callback(cache[cache_key].data);
        } else {
            var network = new Lampa.Reguest();
            network.clear();
            network.timeout(15000);
            network.silent(url, function (json) {
                if (json.Response === 'True' && json.tomatoMeter) {
                    var data = {
                        critic: json.tomatoMeter,
                        audience: json.tomatoUserMeter || json.tomatoAudienceRating || 0
                    };
                    cache[cache_key] = { data: data, timestamp: timestamp };
                    Lampa.Storage.set('rt_rating', cache);
                    callback(data);
                } else {
                    callback(null);
                }
            }, function (a, c) {
                Lampa.Noty.show('Rotten Tomatoes: ' + network.errorDecode(a, c));
            }, false, { dataType: 'json' });
        }
    }

    function addRating(element, data) {
        if (!data) return;

        var critic_color = parseInt(data.critic) >= 60 ? '#32CD32' : '#FF4500';
        var audience_color = parseInt(data.audience) >= 60 ? '#32CD32' : '#FF4500';

        var html = '<span class="rt-rating critic" style="margin-left: 5px; color: ' + critic_color + '; font-size: 0.9em;">🍅 ' + data.critic + '%</span>';
        html += '<span class="rt-rating audience" style="margin-left: 5px; color: ' + audience_color + '; font-size: 0.9em;">🍿 ' + data.audience + '%</span>';

        var target = element.find('.card__rate, .card__rating, .full--rating, .full--info .rating');
        if (target.length) {
            target.append(html);
        }
    }

    Lampa.Listener.follow('hover', function (e) {
        if (e.type === 'card') {
            var card = $(e.card);
            if (card.find('.rt-rating').length === 0) {
                var movie = e.item;
                getOMDbData(movie, function (data) {
                    if (data) addRating(card, data);
                });
            }
        }
    });

    Lampa.Listener.follow('full', function (e) {
        if (e.type === 'complite') {
            var body = e.object.activity.render();
            if (body.find('.rt-rating').length === 0) {
                var movie = e.data.movie;
                getOMDbData(movie, function (data) {
                    if (data) addRating(body, data);
                });
            }
        }
    });

    function startPlugin() {
        window.rotten_tomatoes_plugin = true;
        mountSettingsEntry();
    }

    if (!window.rotten_tomatoes_plugin) startPlugin();

    if (Lampa.Manifest && Lampa.Manifest.plugins) {
        Lampa.Manifest.plugins['rotten_tomatoes'] = {
            name: 'Rotten Tomatoes',
            version: RottenTomatoes.version,
            description: 'Добавляет рейтинги Rotten Tomatoes в карточки'
        };
    }

    window.rotten_tomatoes = RottenTomatoes;
})();
