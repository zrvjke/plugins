(function () {
    'use strict';

    // Основной объект плагина
    var RottenTomatoes = {
        name: 'rotten_tomatoes',
        version: '1.0.0',
        settings: {
            apikey: Lampa.Storage.get('rotten_tomatoes_apikey', ''),
            disable_tmdb: Lampa.Storage.get('rotten_tomatoes_disable_tmdb', false)
        }
    };

    // Функция для создания секции настроек
    function createSettingsComponent() {
        var html = $('<div class="settings-category rotten-tomatoes-settings"><div class="settings-param selector"><div class="settings-param__name">Rotten Tomatoes (OMDb)</div><div class="settings-param__value"></div></div></div>');

        // Поле для ввода API ключа
        var apiInput = $('<div class="settings-param selector"><div class="settings-param__name">OMDb API Key</div><div class="settings-param__value"><input type="text" placeholder="Введите ваш OMDb API ключ (бесплатно на omdbapi.com)" value="' + RottenTomatoes.settings.apikey + '"></div></div>');
        apiInput.find('input').on('input', function () {
            RottenTomatoes.settings.apikey = $(this).val();
            Lampa.Storage.set('rotten_tomatoes_apikey', $(this).val());
            console.log('API Key updated:', $(this).val());
        });
        html.find('.settings-param__value').eq(0).append(apiInput);

        // Переключатель для отключения TMDB
        var disableToggle = $('<div class="settings-param selector"><div class="settings-param__name">Отключить рейтинг TMDB в карточках</div><div class="settings-param__value"><div class="toggle"><input type="checkbox" ' + (RottenTomatoes.settings.disable_tmdb ? 'checked' : '') + '><span></span></div></div></div>');
        disableToggle.find('input').on('change', function () {
            RottenTomatoes.settings.disable_tmdb = $(this).is(':checked');
            Lampa.Storage.set('rotten_tomatoes_disable_tmdb', $(this).is(':checked'));
            applyStyles();
            console.log('TMDB disabled:', $(this).is(':checked'));
        });
        html.append(disableToggle);

        return html;
    }

    // Добавление секции в настройки
    Lampa.Settings.main(function (element) {
        var settings = createSettingsComponent();
        element.append(settings);
        console.log('Rotten Tomatoes settings added to main settings at:', new Date().toISOString());
    });

    // Альтернативный способ через Lampa.Settings.api (если поддерживается)
    Lampa.Settings.api.add('rotten_tomatoes', {
        subtitle: 'Настройки для Rotten Tomatoes через OMDb',
        params: [
            {
                name: 'apikey',
                title: 'OMDb API Key',
                type: 'input',
                value: RottenTomatoes.settings.apikey,
                placeholder: 'Введите ваш OMDb API ключ (бесплатно на omdbapi.com)',
                onChange: function (value) {
                    RottenTomatoes.settings.apikey = value;
                    Lampa.Storage.set('rotten_tomatoes_apikey', value);
                    console.log('API Key changed via api:', value);
                }
            },
            {
                name: 'disable_tmdb',
                title: 'Отключить рейтинг TMDB в карточках',
                type: 'toggle',
                value: RottenTomatoes.settings.disable_tmdb,
                onChange: function (value) {
                    RottenTomatoes.settings.disable_tmdb = value;
                    Lampa.Storage.set('rotten_tomatoes_disable_tmdb', value);
                    applyStyles();
                    console.log('TMDB disabled via api:', value);
                }
            }
        ]
    });

    // Функция для применения стилей отключения TMDB
    function applyStyles() {
        $('#rotten_tomatoes_styles').remove();
        if (RottenTomatoes.settings.disable_tmdb) {
            var style = document.createElement('style');
            style.id = 'rotten_tomatoes_styles';
            style.innerHTML = '.card__rate--tmdb, .full--rating .rating-tmdb { display: none !important; }';
            document.head.appendChild(style);
        }
    }

    // Изначальное применение стилей
    applyStyles();

    // Функция для получения данных из OMDb
    function getOMDbData(movie, callback) {
        var apikey = RottenTomatoes.settings.apikey;
        if (!apikey) return;

        var imdb_id = movie.imdb_id || movie.imdbId;
        var url;

        if (imdb_id) {
            url = 'http://www.omdbapi.com/?apikey=' + apikey + '&i=' + imdb_id + '&tomatoes=true';
        } else {
            var title = movie.original_title || movie.original_name || movie.title || movie.name;
            var year = movie.year || (movie.release_date ? movie.release_date.substring(0, 4) : '') || (movie.first_air_date ? movie.first_air_date.substring(0, 4) : '');
            url = 'http://www.omdbapi.com/?apikey=' + apikey + '&t=' + encodeURIComponent(title) + (year ? '&y=' + year : '') + '&tomatoes=true';
        }

        var cache_key = 'rt_' + (imdb_id || encodeURIComponent(title) + '_' + year);
        var cache = Lampa.Storage.cache('rt_rating', 500, {});
        var timestamp = new Date().getTime();

        if (cache[cache_key] && (timestamp - cache[cache_key].timestamp) < 86400000) {
            return callback(cache[cache_key].data);
        }

        var network = new Lampa.Reguest();
        network.clear();
        network.timeout(15000);
        network.silent(url, function (json) {
            if (json.Response === 'True' && json.tomatoMeter) {
                var data = {
                    critic: json.tomatoMeter,
                    audience: json.tomatoUserMeter || json.tomatoAudienceRating || 0
                };
                cache[cache_key] = {
                    data: data,
                    timestamp: timestamp
                };
                Lampa.Storage.set('rt_rating', cache);
                callback(data);
            } else {
                callback(null);
            }
        }, function (a, c) {
            Lampa.Noty.show('Rotten Tomatoes: ' + network.errorDecode(a, c));
        }, false, {
            dataType: 'json'
        });
    }

    // Функция для добавления рейтинга в элемент
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

    // Слушатель для карточек в списке (hover/карточка)
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

    // Слушатель для полной карточки
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

    // Запуск плагина
    function startPlugin() {
        window.rotten_tomatoes_plugin = true;
    }

    if (!window.rotten_tomatoes_plugin) startPlugin();

    // Регистрация в манифесте
    if (Lampa.Manifest && Lampa.Manifest.plugins) {
        Lampa.Manifest.plugins['rotten_tomatoes'] = {
            name: 'Rotten Tomatoes',
            version: RottenTomatoes.version,
            description: 'Добавляет рейтинги Rotten Tomatoes в карточки'
        };
    }

    // Экспорт объекта
    window.rotten_tomatoes = RottenTomatoes;
})();
