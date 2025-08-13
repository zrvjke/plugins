(function () {
    'use strict';

    var plugin = {
        id: 'avg_runtime_series',
        name: 'Средняя длительность серии (красным)',
        version: '1.0.4',
        description: 'Показывает среднюю продолжительность эпизода и подсвечивает её красным (парсит из DOM, если данные недоступны)',
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

        var infoBlock = e.body.find('.full--info, .full-start-new__details, .full-start__details');
        if (!infoBlock || !infoBlock.length) {
            console.warn('Info block not found');
            return;
        }

        // Общая логика для поиска и окрашивания длительности (адаптировано из interface_newmod.js)
        var durationTags = infoBlock.find('span, .tag').filter(function () {
            var text = $(this).text().trim();
            return text.match(/Длительность/i) || text.indexOf('≈') !== -1 || text.includes('мин');
        });

        console.log('Duration tags found:', durationTags.length);

        if (durationTags.length > 0) {
            durationTags.each(function () {
                $(this).css('color', 'red');
            });
            console.log('Duration tag(s) colored red');
        } else {
            console.warn('No duration tag found with "мин" or "≈"');
        }

        // Для сериалов: если данных нет, парсим из текста и добавляем среднюю, если нужно
        if (e.type === 'tv') {
            var runtimes = e.data.movie?.episode_run_time || [];
            console.log('Episode runtimes from data:', runtimes);

            if (Array.isArray(runtimes) && runtimes.length > 0) {
                var avg = Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length);
                console.log('Calculated average runtime:', avg);

                // Добавляем или обновляем тег
                var existingTag = infoBlock.find('.tag:contains("мин/серия")');
                if (existingTag.length) {
                    existingTag.text('~' + avg + ' мин/серия').css('color', 'red');
                } else {
                    infoBlock.append('<div class="tag" style="color: red;">~' + avg + ' мин/серия</div>');
                }
            } else {
                // Если данных нет, парсим из существующего текста (как в interface_newmod.js)
                var parsedDuration = '';
                infoBlock.find('span').each(function () {
                    var text = $(this).text().trim();
                    if (text.match(/≈\s*(\d+)\s*мин/i)) {
                        parsedDuration = RegExp.$1;
                    }
                });

                if (parsedDuration) {
                    console.log('Parsed average runtime from text:', parsedDuration);
                    var avgTag = $('<div class="tag" style="color: red;">~' + parsedDuration + ' мин/серия</div>');
                    infoBlock.append(avgTag);
                } else {
                    console.warn('No runtime data or text found for series');
                }
            }
        }
    });
})();

