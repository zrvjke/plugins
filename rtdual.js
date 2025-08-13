(function () {
    'use strict';

    // Инициализация плагина
    var plugin = {
        name: 'Rotten Tomatoes Ratings',
        version: '1.0.0',
        url: 'https://nb557.github.io/plugins/rotten_tomatoes.js'
    };

    // Настройки плагина
    Lampa.Storage.set('rotten_tomatoes_enabled', true, true);
    Lampa.Storage.set('tmdb_rating_enabled', true, true);

    // Стили для иконок и рейтингов
    Lampa.Utils.addStyle(`
        .rt-tomato, .rt-popcorn {
            display: inline-block;
            width: 16px;
            height: 16px;
            margin-right: 4px;
            vertical-align: middle;
        }
        .rt-tomato {
            background: url('https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer-certified.f7b67e94c56.png') no-repeat center;
            background-size: contain;
        }
        .rt-popcorn {
            background: url('https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience-verified.6daed36f15b.png') no-repeat center;
            background-size: contain;
        }
        .rating-rt {
            margin-right: 10px;
            color: #fff;
        }
    `);

    // Функция для получения данных с Rotten Tomatoes
    async function getRottenTomatoesRatings(title, year) {
        try {
            // Формируем URL для поиска на Rotten Tomatoes
            var searchUrl = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`;
            var response = await Lampa.Utils.get(searchUrl);
            var parser = new DOMParser();
            var doc = parser.parseFromString(response, 'text/html');

            // Ищем фильм по названию и году
            var movieLink = Array.from(doc.querySelectorAll('search-page-media-row')).find(row => {
                var releaseYear = row.getAttribute('releaseyear');
                return releaseYear && releaseYear.includes(year);
            });

            if (!movieLink) return null;

            var movieUrl = movieLink.querySelector('a').href;
            var movieResponse = await Lampa.Utils.get(movieUrl);
            var movieDoc = parser.parseFromString(movieResponse, 'text/html');

            var tomatoMeter = movieDoc.querySelector('#topSection .thumbnail-scoreboard-wrap [data-qa="tomatometer"]')?.textContent.trim() || 'N/A';
            var popcornMeter = movieDoc.querySelector('#topSection .thumbnail-scoreboard-wrap [data-qa="audience-rating"]')?.textContent.trim() || 'N/A';

            return {
                tomato: tomatoMeter,
                popcorn: popcornMeter
            };
        } catch (e) {
            console.log('Rotten Tomatoes Plugin: Error fetching ratings', e);
            return null;
        }
    }

    // Перехват рендеринга карточки контента
    var originalCardRender = Lampa.Template.card;
    Lampa.Template.card = function (data, params) {
        var card = originalCardRender.call(this, data, params);

        if (Lampa.Storage.get('rotten_tomatoes_enabled', true)) {
            var title = data.title || data.name;
            var year = data.release_date ? data.release_date.split('-')[0] : data.first_air_date ? data.first_air_date.split('-')[0] : '';

            getRottenTomatoesRatings(title, year).then(ratings => {
                if (ratings) {
                    var ratingContainer = card.querySelector('.card__rating');
                    if (ratingContainer) {
                        ratingContainer.insertAdjacentHTML('beforeend', `
                            <span class="rating-rt"><span class="rt-tomato"></span>${ratings.tomato}</span>
                            <span class="rating-rt"><span class="rt-popcorn"></span>${ratings.popcorn}</span>
                        `);
                    }
                }
            });
        }

        // Отключение TMDb, если выбрано в настройках
        if (!Lampa.Storage.get('tmdb_rating_enabled', true)) {
            var tmdbRating = card.querySelector('.card__rating [class*="tmdb"]');
            if (tmdbRating) tmdbRating.style.display = 'none';
        }

        return card;
    };

    // Добавление настроек в интерфейс Lampa
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name === 'main') {
            var settings = e.body.find('.settings__content');
            if (settings && !settings.find('.rt-settings')) {
                settings.append(`
                    <div class="rt-settings">
                        <div class="settings__item">
                            <input type="checkbox" id="rt_enabled" ${Lampa.Storage.get('rotten_tomatoes_enabled', true) ? 'checked' : ''}>
                            <label for="rt_enabled">Показывать рейтинги Rotten Tomatoes</label>
                        </div>
                        <div class="settings__item">
                            <input type="checkbox" id="tmdb_enabled" ${Lampa.Storage.get('tmdb_rating_enabled', true) ? 'checked' : ''}>
                            <label for="tmdb_enabled">Показывать рейтинг TMDb</label>
                        </div>
                    </div>
                `);

                settings.find('#rt_enabled').on('change', function () {
                    Lampa.Storage.set('rotten_tomatoes_enabled', this.checked, true);
                    Lampa.Controller.update();
                });

                settings.find('#tmdb_enabled').on('change', function () {
                    Lampa.Storage.set('tmdb_rating_enabled', this.checked, true);
                    Lampa.Controller.update();
                });
            }
        }
    });

    console.log('Rotten Tomatoes Plugin loaded:', plugin);
})();
