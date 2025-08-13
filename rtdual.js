(function () {
    'use strict';

    var plugin_name = 'Rotten Tomatoes (OMDb Dual)';
    var api_key = '';
    var disable_tmdb = false;

    // Загрузка сохранённых настроек
    function loadSettings() {
        api_key = Lampa.Storage.get('rtdual_apikey', '');
        disable_tmdb = Lampa.Storage.get('rtdual_disable_tmdb', false);
    }

    // Сохранение настроек
    function saveSettings() {
        Lampa.Storage.set('rtdual_apikey', api_key);
        Lampa.Storage.set('rtdual_disable_tmdb', disable_tmdb);
    }

    // Отображение настроек в меню Лампы
    function addSettingsMenu() {
        Lampa.SettingsApi.addComponent({
            component: 'rtdual',
            name: plugin_name,
            icon: '🍅',
            onRender: function (item) {
                item.render().find('.settings-param__content').append(
                    $('<div class="settings-param"><div class="settings-param__name">OMDb API Key</div><input type="text" class="rtdual_api_input"></div>'),
                    $('<div class="settings-param"><label><input type="checkbox" class="rtdual_disable_tmdb"> Отключить TMDB рейтинги</label></div>')
                );

                $('.rtdual_api_input').val(api_key).on('input', function () {
                    api_key = $(this).val().trim();
                    saveSettings();
                });

                $('.rtdual_disable_tmdb').prop('checked', disable_tmdb).on('change', function () {
                    disable_tmdb = $(this).is(':checked');
                    saveSettings();
                });
            }
        });
    }

    // Загрузка рейтингов Rotten Tomatoes
    function fetchRatings(title, year, callback) {
        if (!api_key) return callback(null);

        var url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year || ''}&apikey=${api_key}&tomatoes=true`;

        $.getJSON(url, function (data) {
            if (data && data.Ratings) {
                var critics = null;
                var audience = null;

                if (data.tomatoMeter) critics = data.tomatoMeter + '%';
                if (data.tomatoAudienceScore) audience = data.tomatoAudienceScore + '%';

                // Иногда рейтинги лежат в массиве Ratings
                data.Ratings.forEach(r => {
                    if (r.Source === 'Rotten Tomatoes') critics = r.Value;
                });

                callback({ critics, audience });
            } else {
                callback(null);
            }
        }).fail(() => callback(null));
    }

    // Встраивание в карточку фильма
    function injectRatings() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var movie = e.data.movie || {};
            var title = movie.title || movie.name;
            var year = movie.release_date ? movie.release_date.split('-')[0] : '';

            fetchRatings(title, year, function (ratings) {
                if (!ratings) return;

                var container = $('.full-meta .rate');

                if (ratings.critics) {
                    container.append(`<div class="rate__item"><span>🍅</span> ${ratings.critics}</div>`);
                }
                if (ratings.audience) {
                    container.append(`<div class="rate__item"><span>🍿</span> ${ratings.audience}</div>`);
                }

                if (disable_tmdb) {
                    container.find('.rate__item').filter(function () {
                        return $(this).text().includes('TMDB');
                    }).remove();
                }
            });
        });
    }

    // Запуск плагина
    loadSettings();
    addSettingsMenu();
    injectRatings();

    console.log(`${plugin_name} запущен`);
})();
