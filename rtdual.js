(function () {
    'use strict';

    var plugin = {
        id: 'avg_runtime_series',
        name: 'Средняя длительность серии (красным)',
        version: '1.0.4',
        description: 'Показывает среднюю продолжительность эпизода и подсвечивает её красным',
        type: 'modify'
    };

    if (typeof Lampa === 'undefined' || !Lampa.Plugin || !Lampa.Plugin.register) {
        console.error('Lampa.Plugin is not available. Plugin initialization failed.');
        return;
    }

    Lampa.Plugin.register(plugin);

    Lampa.Listener.follow('full', function (e) {
        if (!e || !e.type || !e.data || !e.body) {
            console.warn('Invalid event data:', e);
            return;
        }

        // Ждём полной загрузки данных (как в interface_newmod.js)
        if (e.type === 'complite') {  // Возможно, опечатка в оригинале; если не работает, попробуй 'complete'
            setTimeout(function () {
                // Отладка: выведем данные для анализа
                console.log('Event type:', e.type);
                console.log('Movie data:', e.data.movie);

                // Общий блок для информации
                var infoBlock = e.body.find('.full--info') || e.body.find('.full-start-new__details');
                if (!infoBlock || !infoBlock.length) {
                    console.warn('Info block not found');
                    return;
                }

                // Для сериалов
                if (e.data.movie.media_type === 'tv' || e.data.movie.number_of_seasons > 0) {
                    var runtimes = e.data.movie?.episode_run_time || [];
                    console.log('Episode runtimes from API:', runtimes);

                    var avg = 0;
                    if (Array.isArray(runtimes) && runtimes.length > 0) {
                        avg = Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length);
                        console.log('Calculated average runtime from API:', avg);
                    } else {
                        // Fallback: парсинг из DOM, как в enhanceDetailedInfo()
                        console.warn('No API runtimes, parsing from DOM');
                        infoBlock.find('span').each(function () {
                            var text = $(this).text().trim();
                            if (text.match(/Длительность/i) || text.indexOf('≈') !== -1 || text.includes('мин')) {
                                var match = text.match(/(\d+)/);  // Ищем число минут
                                if (match) {
                                    avg = parseInt(match[1], 10);
                                    console.log('Parsed average runtime from DOM:', avg);
                                }
                            }
                        });
                    }

                    if (avg > 0) {
                        var existingTag = infoBlock.find('.tag:contains("мин/серия")');
                        if (existingTag.length) {
                            existingTag.text('~' + avg + ' мин/серия').css('color', 'red');
                        } else {
                            infoBlock.append('<div class="tag" style="color: red;">~' + avg + ' мин/серия</div>');
                        }
                    } else {
                        console.warn('No runtime data found');
                    }
                }

                // Для фильмов
                if (e.data.movie.media_type === 'movie' || e.data.movie.runtime) {
                    var runtimeTag = e.body.find('.full--info .tag, .full-start-new__details span').filter(function () {
                        return $(this).text().trim().includes('мин');
                    });
                    console.log('Runtime tags found:', runtimeTag.length);

                    if (runtimeTag && runtimeTag.length) {
                        runtimeTag.css('color', 'red');
                        console.log('Runtime tag colored red');
                    } else {
                        // Fallback: добавляем метку, если не найдена
                        console.warn('No runtime tag found, adding new one');
                        var runtime = e.data.movie?.runtime || 0;
                        if (runtime > 0) {
                            infoBlock.append('<div class="tag" style="color: red;">' + runtime + ' мин</div>');
                        } else {
                            console.warn('No runtime data in API');
                        }
                    }
                }
            }, 300);  // Задержка для стабильности DOM, как в оригинальном коде
        }
    });
})();
