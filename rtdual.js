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

    // Функция создания секции настроек
    function createSettingsComponent() {
        var root = document.createElement('div');
        root.className = 'about';
        root.style.padding = '10px 0';

        // API Key field
        var apiDiv = document.createElement('div');
        apiDiv.className = 'settings-param selector';
        var apiName = document.createElement('div');
        apiName.className = 'settings-param__name';
        apiName.textContent = 'OMDb API ключ';
        var apiValue = document.createElement('div');
        apiValue.className = 'settings-param__value';
        var apiInput = document.createElement('input');
        apiInput.type = 'text';
        apiInput.placeholder = 'Введите ваш OMDb API ключ (omdbapi.com)';
        apiInput.value = RottenTomatoes.settings.apikey;
        apiInput.style.width = '100%';
        apiInput.style.padding = '5px';
        apiInput.addEventListener('input', function () {
            RottenTomatoes.settings.apikey = this.value;
            Lampa.Storage.set('rotten_tomatoes_apikey', this.value);
            console.log('API Key updated to:', this.value);
            Lampa.Noty.show('API ключ сохранен');
        });
        apiValue.appendChild(apiInput);
        apiDiv.appendChild(apiName);
        apiDiv.appendChild(apiValue);
        root.appendChild(apiDiv);

        // TMDB toggle
        var tmdbDiv = document.createElement('div');
        tmdbDiv.className = 'settings-param selector';
        var tmdbName = document.createElement('div');
        tmdbName.className = 'settings-param__name';
        tmdbName.textContent = 'Скрывать рейтинг TMDb в карточке';
        var tmdbValue = document.createElement('div');
        tmdbValue.className = 'settings-param__value';
        var tmdbLabel = document.createElement('label');
        var tmdbCheckbox = document.createElement('input');
        tmdbCheckbox.type = 'checkbox';
        tmdbCheckbox.checked = RottenTomatoes.settings.disable_tmdb;
        tmdbCheckbox.addEventListener('change', function () {
            RottenTomatoes.settings.disable_tmdb = this.checked;
            Lampa.Storage.set('rotten_tomatoes_disable_tmdb', this.checked);
            applyStyles();
            console.log('TMDB disabled:', this.checked);
            Lampa.Noty.show(this.checked ? 'TMDb будет скрыт' : 'TMDb будет показан');
        });
        tmdbLabel.appendChild(tmdbCheckbox);
        tmdbLabel.appendChild(document.createTextNode(' Включить'));
        tmdbValue.appendChild(tmdbLabel);
        tmdbDiv.appendChild(tmdbName);
        tmdbDiv.appendChild(tmdbValue);
        root.appendChild(tmdbDiv);

        // Help info
        var helpDiv = document.createElement('div');
        helpDiv.className = 'settings-param selector';
        var helpName = document.createElement('div');
        helpName.className = 'settings-param__name';
        helpName.textContent = 'Где взять ключ OMDb?';
        var helpValue = document.createElement('div');
        helpValue.className = 'settings-param__value';
        helpValue.textContent = 'Получите бесплатный ключ на omdbapi.com (Email → API Key)';
        helpDiv.appendChild(helpName);
        helpDiv.appendChild(helpValue);
        root.appendChild(helpDiv);

        return root;
    }

    // Добавление пункта в настройки
    function mountSettingsEntry() {
        function attachOnce() {
            var menu = document.querySelector('.settings .menu .list, .settings .menu__list, .settings .scroll .list');
            if (!menu) return;

            if (menu.querySelector('[data-rt="rotten_tomatoes"]')) return;

            var item = document.createElement('div');
            item.className = 'selector';
            item.setAttribute('data-rt', 'rotten_tomatoes');
            item.innerHTML = '<div class="name">🍅 Rotten Tomatoes</div>';

            item.addEventListener('click', function () {
                var modalContent = createSettingsComponent();
                Lampa.Modal.open({
                    title: 'Rotten Tomatoes Settings',
                    html: modalContent,
                    onBack: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle('settings_component');
                    }
                });
                console.log('Modal opened with content:', modalContent.innerHTML);
            });

            menu.appendChild(item);
        }

        attachOnce();
        Lampa.Listener.follow('settings', function (e) {
            if (e.type === 'open') setTimeout(attachOnce, 50);
        });
    }

    // Применение стилей для отключения TMDB
    function applyStyles() {
        var style = document.getElementById('rotten_tomatoes_styles');
        if (style) style.remove();
        if (RottenTomatoes.settings.disable_tmdb) {
            style = document.createElement('style');
            style.id = 'rotten_tomatoes_styles';
            style.textContent = '.card__rate--tmdb, .full--rating .rating-tmdb { display: none !important; }';
            document.head.appendChild(style);
        }
        console.log('Styles applied, TMDB disabled:', RottenTomatoes.settings.disable_tmdb);
    }

    // Изначальное применение стилей
    applyStyles();

    // Получение данных из OMDb
    function getOMDbData(movie, callback) {
        var apikey = RottenTomatoes.settings.apikey;
        if (!apikey) {
            console.log('No API key provided, ratings will not load');
            return;
        }

        var imdb_id = movie.imdb_id || movie.imdbId;
        var url = imdb_id ? 'http://www.omdbapi.com/?apikey=' + apikey + '&i=' + imdb_id + '&tomatoes=true' : 'http://www.omdbapi.com/?apikey=' + apikey + '&t=' + encodeURIComponent(movie.title || movie.name) + '&y=' + (movie.year || '') + '&tomatoes=true';

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

    // Добавление рейтинга в элемент
    function addRating(element, data) {
        if (!data) return;

        var critic_color = parseInt(data.critic) >= 60 ? '#32CD32' : '#FF4500';
        var audience_color = parseInt(data.audience) >= 60 ? '#32CD32' : '#FF4500';

        var html = '<span class="rt-rating critic" style="margin-left: 5px; color: ' + critic_color + '; font-size: 0.9em;">🍅 ' + data.critic + '%</span>';
        html += '<span class="rt-rating audience" style="margin-left: 5px; color: ' + audience_color + '; font-size: 0.9em;">🍿 ' + data.audience + '%</span>';

        var target = element.querySelector('.card__rate, .card__rating, .full--rating, .full--info .rating');
        if (target) {
            target.insertAdjacentHTML('beforeend', html);
        }
    }

    // Слушатели для карточек
    Lampa.Listener.follow('hover', function (e) {
        if (e.type === 'card') {
            var card = e.card;
            if (!card.querySelector('.rt-rating')) {
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
            if (!body.querySelector('.rt-rating')) {
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
        mountSettingsEntry();
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

    window.rotten_tomatoes = RottenTomatoes;
})();
