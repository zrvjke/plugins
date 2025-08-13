(function () {
    'use strict';

    var storageKey = 'rtdual_settings';

    function getSettings() {
        return Lampa.Storage.get(storageKey, { api_key: '', hide_tmdb: false });
    }

    function saveSettings(data) {
        Lampa.Storage.set(storageKey, data);
    }

    function applyRatings() {
        var settings = getSettings();
        if (!settings.api_key) return;

        // Перехватываем событие отображения карточки фильма
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' && e.data && e.data.movie) {
                var movie = e.data.movie;
                var imdb_id = movie.imdb_id;

                if (!imdb_id) return;

                var url = 'https://www.omdbapi.com/?apikey=' + settings.api_key + '&i=' + imdb_id;
                Lampa.Utils.request(url, function (json) {
                    if (json && json.Ratings) {
                        var rtRating = json.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                        if (rtRating) {
                            var rateBlock = document.createElement('div');
                            rateBlock.className = 'rate__item';
                            rateBlock.innerHTML = '<div class="rate__icon">🍅</div><div class="rate__value">' + rtRating.Value + '</div>';
                            document.querySelector('.rate')?.appendChild(rateBlock);
                        }
                        if (settings.hide_tmdb) {
                            document.querySelectorAll('.rate__item').forEach(el => {
                                if (el.textContent.includes('TMDB')) el.remove();
                            });
                        }
                    }
                }, function () {
                    console.log('RTDual: Ошибка запроса к OMDb');
                });
            }
        });
    }

    function settingsComponent() {
        var settings = getSettings();

        var form = $('<div class="about"><div class="selector">API Key OMDb</div></div>');
        var input = $('<input type="text" placeholder="Введите API ключ OMDb" style="width:100%;padding:10px;margin:10px 0;">');
        input.val(settings.api_key);
        input.on('input', function () {
            settings.api_key = this.value.trim();
            saveSettings(settings);
        });

        var hideTmdbToggle = $('<div class="selector" style="margin-top:10px;">Скрывать рейтинг TMDb: <span>' + (settings.hide_tmdb ? 'Да' : 'Нет') + '</span></div>');
        hideTmdbToggle.on('hover:enter', function () {
            settings.hide_tmdb = !settings.hide_tmdb;
            hideTmdbToggle.find('span').text(settings.hide_tmdb ? 'Да' : 'Нет');
            saveSettings(settings);
        });

        form.append(input);
        form.append(hideTmdbToggle);

        Lampa.SettingsApi.add({
            component: 'rtdual',
            name: 'Rotten Tomatoes (OMDb)',
            icon: '🍅',
            category: 'more', // Появится под "Остальное"
            onRender: function (body) {
                body.empty().append(form);
            }
        });
    }

    Lampa.Plugin.create({
        title: 'Rotten Tomatoes (OMDb)',
        version: '1.0.0',
        description: 'Добавляет рейтинг Rotten Tomatoes и опцию скрытия TMDb рейтинга',
        component: 'rtdual',
        onLoad: function () {
            settingsComponent();
            applyRatings();
        }
    });

})();
