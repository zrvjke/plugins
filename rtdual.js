(function () {
    'use strict';

    var plugin = {
        id: 'rt_ratings_pro',
        name: 'Rotten Tomatoes Pro',
        version: '1.2.0',
        description: 'Рейтинги Rotten Tomatoes (Tomatometer + Audience) с резервным парсингом и отключением TMDb',
        type: 'modify',
        params: [
            {
                id: 'apikey',
                type: 'input',
                name: 'OMDb API Key',
                placeholder: 'Получите ключ на omdbapi.com'
            },
            {
                id: 'hide_tmdb',
                type: 'toggle',
                name: 'Скрыть TMDb рейтинг',
                default: false
            }
        ]
    };

    // Ждём загрузки Lampa
    if (window.Lampa && Lampa.Plugin) {
        Lampa.Plugin.register(plugin);
        init();
    } else {
        document.addEventListener('lampa', function () {
            Lampa.Plugin.register(plugin);
            init();
        });
    }

    function init() {
        var ratingsCache = {};

        var icons = {
            certified: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/certified_fresh-notext.56a8e219a92.svg',
            fresh: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer-fresh.149b5e95350.svg',
            rotten: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer-rotten.149b5e95350.svg',
            audience: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/aud_score-fresh.6c24d79faaf.svg'
        };

        function scrapeRT(title, callback) {
            var searchUrl = 'https://www.rottentomatoes.com/napi/search/?query=' + encodeURIComponent(title);

            Lampa.Network.get(searchUrl, {}, function (data) {
                try {
                    var movie = data.movies && data.movies[0];
                    if (!movie || !movie.url) return callback(null);

                    var movieUrl = 'https://www.rottentomatoes.com' + movie.url;
                    Lampa.Network.get(movieUrl, {}, function (html) {
                        var tomatometer = (html.match(/tomatometer":(\d+)/) || [])[1] || 'N/A';
                        var audience = (html.match(/audienceScore":(\d+)/) || [])[1] || 'N/A';
                        var image = html.includes('certified_fresh') ? 'certified' : 
                                    html.includes('fresh') ? 'fresh' : 'rotten';

                        callback({
                            tomatometer: tomatometer + '%',
                            audience: audience + '%',
                            image: image
                        });
                    }, function () { callback(null); });
                } catch (e) { callback(null); }
            }, function () { callback(null); });
        }

        function fetchRatings(imdbId, title, callback) {
            if (ratingsCache[imdbId]) return callback(ratingsCache[imdbId]);

            var apikey = Lampa.Params.get(plugin.id + '_apikey', '');
            if (!apikey) {
                Lampa.Noty.show('Введите OMDb API ключ в настройках плагина!');
                return callback(null);
            }

            var url = 'https://www.omdbapi.com/?apikey=' + apikey + '&i=' + imdbId + '&tomatoes=true';

            Lampa.Network.get(url, {}, function (json) {
                if (!json || json.Error) {
                    scrapeRT(title, callback);
                } else {
                    var result = {
                        tomatometer: (json.tomatoMeter || 'N/A') + '%',
                        audience: (json.tomatoUserMeter || 'N/A') + '%',
                        image: json.tomatoImage || 'rotten'
                    };
                    ratingsCache[imdbId] = result;
                    callback(result);
                }
            }, function () {
                scrapeRT(title, callback);
            });
        }

        function hideTMDbRating(body) {
            if (Lampa.Params.get(plugin.id + '_hide_tmdb', false)) {
                body.find('.full--rating .rating').each(function () {
                    if ($(this).find('.title, .source').text().trim() === 'TMDb') {
                        $(this).remove();
                    }
                });
            }
        }

        Lampa.Listener.follow('full', function (e) {
            if (!e.data.movie || !e.data.movie.imdb_id) return;

            hideTMDbRating(e.body);

            fetchRatings(e.data.movie.imdb_id, e.data.movie.title, function (ratings) {
                if (!ratings) return;

                var html = [
                    '<img src="' + icons[ratings.image] + '" class="rt-icon">',
                    ratings.tomatometer,
                    '<img src="' + icons.audience + '" class="rt-icon rt-audience">',
                    ratings.audience
                ].join(' ');

                e.body.find('.full--rating').append(
                    '<div class="rating" style="margin-top:10px;">' +
                        '<div class="source">Rotten Tomatoes</div>' +
                        '<div class="value" style="color:#fff;">' + html + '</div>' +
                    '</div>'
                );
            });
        });
    }
})();
