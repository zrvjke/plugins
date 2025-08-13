(function () {
    'use strict';

    var plugin = {
        id: 'avg_runtime_series',
        name: 'Средняя длительность серии (красным)',
        version: '1.0.3',
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

        // Отладка: выведем данные для анализа
        console.log('Event type:', e.type);
        console.log('Movie data:', e.data.movie);

        // Для сериалов
        if (e.type === 'tv') {
            var runtimes = e.data.movie?.episode_run_time || [];
            console.log('Episode runtimes:', runtimes);

            if (Array.isArray(runtimes) && runtimes.length > 0) {
                var avg = Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length);
                console.log('Calculated average runtime:', avg);

                var infoBlock = e.body.find('.full--info');
                if (infoBlock && infoBlock.length) {
                    var existingTag = infoBlock.find('.tag:contains("мин/серия")');
                    if (existingTag.length) {
                        existingTag.text('~' + avg + ' мин/серия').css('color', 'red');
                    } else {
                        infoBlock.append('<div class="tag" style="color: red;">~' + avg + ' мин/серия</div>');
                    }
                } else {
                    console.warn('Info block not found');
                }
            } else {
                console.warn('No valid runtimes data');
            }
        }

        // Для фильмов
        if (e.type === 'movie') {
            var runtimeTag = e.body.find('.full--info .tag').filter(function () {
                return $(this).text().trim().includes('мин');
            });
            console.log('Runtime tags found:', runtimeTag.length);

            if (runtimeTag && runtimeTag.length) {
                runtimeTag.css('color', 'red');
                console.log('Runtime tag colored red');
            } else {
                console.warn('No runtime tag found with "мин"');
            }
        }
    });
})();
