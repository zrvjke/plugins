(function () {
    'use strict';

    var plugin_id   = 'runtime_highlight';
    var plugin_name = 'Подсветка времени';

    // Ключи в Storage
    var storage_time_key = plugin_id + '_show_time';
    var storage_date_key = plugin_id + '_show_date';

    // Значения по умолчанию
    if (Lampa.Storage.get(storage_time_key) === undefined) Lampa.Storage.set(storage_time_key, true);
    if (Lampa.Storage.get(storage_date_key) === undefined) Lampa.Storage.set(storage_date_key, true);

    // ---------- Настройки (правильный API) ----------
    function addSettings() {
        if (Lampa.SettingsApi && typeof Lampa.SettingsApi.addParam === 'function') {
            // Тумблер "Показывать время"
            Lampa.SettingsApi.addParam({
                component: 'other',
                param: {
                    name: 'Показывать время (красным)',
                    type: 'toggle',
                    default: true
                },
                field: storage_time_key,
                onChange: function (val) {
                    Lampa.Storage.set(storage_time_key, val);
                }
            });

            // Тумблер "Показывать дату"
            Lampa.SettingsApi.addParam({
                component: 'other',
                param: {
                    name: 'Показывать дату релиза (курсив)',
                    type: 'toggle',
                    default: true
                },
                field: storage_date_key,
                onChange: function (val) {
                    Lampa.Storage.set(storage_date_key, val);
                }
            });
        }
    }

    // ---------- Утилиты ----------
    function formatRuntime(mins) {
        var m = parseInt(mins || 0, 10);
        if (isNaN(m) || m <= 0) return '';
        var h = Math.floor(m / 60);
        var mm = m % 60;
        var parts = [];
        if (h) parts.push(h + ' ч');
        if (mm) parts.push(mm + ' мин');
        return parts.join(' ');
    }

    // Вставляем время и дату в блок инфы на странице фильма/сериала
    function injectInfo(e) {
        var body  = e.body;
        var movie = e.data && (e.data.movie || e.data);

        if (!body || !movie) return;

        var show_time = !!Lampa.Storage.get(storage_time_key, true);
        var show_date = !!Lampa.Storage.get(storage_date_key, true);

        var info_block = body.find('.full-info');
        if (!info_block.length) return;

        // Удалим ранее вставленные элементы, чтобы не плодить дубли при повторных открытиях
        info_block.find('.rt-hl-time, .rt-hl-date').remove();

        if (show_time && movie.runtime) {
            var runtime_html = '<div class="rt-hl-time" style="color:#ff3b3b;font-weight:700;">⏱ ' + formatRuntime(movie.runtime) + '</div>';
            info_block.append(runtime_html);
        }

        // Для сериалов иногда runtime лежит в e.data.episode.runtime
        if (show_time && !movie.runtime && e.data && e.data.episode && e.data.episode.runtime) {
            var er_html = '<div class="rt-hl-time" style="color:#ff3b3b;font-weight:700;">⏱ ' + formatRuntime(e.data.episode.runtime) + '</div>';
            info_block.append(er_html);
        }

        if (show_date) {
            var date = movie.release_date || movie.first_air_date || '';
            if (date) {
                var date_html = '<div class="rt-hl-date" style="font-weight:600;font-style:italic;">' + date + '</div>';
                info_block.append(date_html);
            }
        }
    }

    // Слушаем построение страницы "Полная карточка"
    Lampa.Listener.follow('full', function (e) {
        if (e.type === 'complite') {
            injectInfo(e);
        }
    });

    // Зарегистрируемся в «Расширения»
    if (Lampa.Plugin && typeof Lampa.Plugin.create === 'function') {
        Lampa.Plugin.create(
            plugin_id,
            plugin_name,
            '1.0.1',
            'Подсветка времени и даты релиза с переключателями в Настройках → Остальное',
            function () {}
        );
    }

    // Добавим настройки
    addSettings();
})();
