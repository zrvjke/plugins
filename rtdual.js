(function () {
    'use strict';

    var plugin = {
        id: 'avg_runtime_series',
        name: 'Средняя длительность серии (красным)',
        version: '1.0.2',
        description: 'Показывает среднюю продолжительность эпизода и подсвечивает её красным',
        type: 'modify'
    };

    Lampa.Plugin.register(plugin);

    Lampa.Listener.follow('full', function (e) {
        // Если сериал — считаем среднее время
        if (e.type === 'tv') {
            var runtimes = e.data.movie.episode_run_time;

            if (Array.isArray(runtimes) && runtimes.length > 0) {
                var avg = Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length);

                var infoBlock = e.body.find('.full--info');
                if (infoBlock.length) {
                    infoBlock.append('<div class="tag" style="color: red;">~' + avg + ' мин/серия</div>');
                }
            }
        }

        // Если фильм — красим длительность
        if (e.type === 'movie') {
            var runtimeTag = e.body.find('.full--info .tag').filter(function () {
                return $(this).text().includes('мин');
            });
            runtimeTag.css('color', 'red');
        }
    });
})();
