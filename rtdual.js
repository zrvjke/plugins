(function () {
    'use strict';

    Lampa.Settings.api.add('rotten_tomatoes', {
        subtitle: 'Настройки для Rotten Tomatoes через OMDb',
        params: [
            {
                name: 'apikey',
                title: 'OMDb API Key',
                type: 'input',
                value: '',
                placeholder: 'Введите ваш OMDb API ключ (бесплатно на omdbapi.com)'
            },
            {
                name: 'disable_tmdb',
                title: 'Отключить рейтинг TMDB в карточках',
                type: 'toggle',
                value: false
            }
        ]
    });

    if (Lampa.Storage.get('rotten_tomatoes_disable_tmdb', false)) {
        Lampa.Styles.add('hide_tmdb', '.card__rate--tmdb, .full--rating .rating-tmdb { display: none !important; }', 'rotten');
    }

    function getOMDbData(movie, callback) {
        var apikey = Lampa.Storage.get('rotten_tomatoes_apikey', '');
        if (!apikey) return;

        var imdb_id = movie.imdb_id;
        var url;

        if (imdb_id) {
            url = 'http://www.omdbapi.com/?apikey=' + apikey + '&i=' + imdb_id + '&tomatoes=true';
        } else {
            var title = movie.original_title || movie.title || movie.name;
            var year = movie.year || (movie.release_date ? movie.release_date.substring(0, 4) : '');
            url = 'http://www.omdbapi.com/?apikey=' + apikey + '&t=' + encodeURIComponent(title) + (year ? '&y=' + year : '') + '&tomatoes=true';
        }

        var cache_key = 'rt_' + (imdb_id || title + '_' + year);

        var cached = Lampa.Storage.cache(cache_key, 86400); // кэш на 1 день
        if (cached) {
            callback(cached);
        } else {
            Lampa.Network.request({
                url: url,
                method: 'GET',
                dataType: 'json',
                success: function (json) {
                    if (json.Response === 'True' && json.tomatoMeter) {
                        var data = {
                            critic: json.tomatoMeter,
                            audience: json.tomatoUserMeter || 0
                        };
                        Lampa.Storage.cache(cache_key, 86400, data);
                        callback(data);
                    }
                },
                error: function () {}
            });
        }
    }

    function addRating(element, selector, data) {
        var critic_color = parseInt(data.critic) >= 60 ? '#32CD32' : '#FF4500';
        var audience_color = parseInt(data.audience) >= 60 ? '#32CD32' : '#FF4500';

        var html = '<span class="rt-rating critic" style="margin-left: 5px; color: ' + critic_color + '; font-size: 0.9em;">🍅 ' + data.critic + '%</span>';
        html += '<span class="rt-rating audience" style="margin-left: 5px; color: ' + audience_color + '; font-size: 0.9em;">🍿 ' + data.audience + '%</span>';

        element.find(selector).append(html);
    }

    Lampa.Listener.follow('hover', function (e) {
        if (e.type === 'card') {
            var card = e.card;
            if (card.find('.rt-rating').length === 0) {
                var movie = e.item;
                getOMDbData(movie, function (data) {
                    addRating($(card), '.card__rate, .card__rating', data);
                });
            }
        }
    });

    Lampa.Listener.follow('full', function (e) {
        var body = e.body;
        if (body.find('.rt-rating').length === 0) {
            var movie = e.data.movie;
            getOMDbData(movie, function (data) {
                addRating(body, '.full--rating, .full--info .rating', data);
            });
        }
    });

})();
