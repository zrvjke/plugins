
(function () {
    'use strict';

    var plugin_id = 'runtime_pro';
    var plugin_name = 'Runtime & Release Date';
    var storage_time_key = plugin_id + '_show_time';
    var storage_date_key = plugin_id + '_show_date';

    // Регистрируем настройки в Лампе
    Lampa.Settings.add({
        title: plugin_name,
        onSelect: function () {
            var show_time = Lampa.Storage.get(storage_time_key, true);
            var show_date = Lampa.Storage.get(storage_date_key, true);

            var settings = new Lampa.Settings();

            settings.create();
            settings.addSwitch({
                title: 'Показывать время',
                value: show_time,
                onChange: function (val) {
                    Lampa.Storage.set(storage_time_key, val);
                }
            });
            settings.addSwitch({
                title: 'Показывать дату',
                value: show_date,
                onChange: function (val) {
                    Lampa.Storage.set(storage_date_key, val);
                }
            });
            settings.open();
        }
    });

    function formatRuntime(runtime) {
        if (!runtime) return null;
        var min = parseInt(runtime);
        if (isNaN(min)) return null;
        return min + ' мин';
    }

    function injectInfo(e) {
        var body = e.body;
        var movie = e.data.movie || e.data;

        if (!movie) return;

        var show_time = Lampa.Storage.get(storage_time_key, true);
        var show_date = Lampa.Storage.get(storage_date_key, true);

        var info_block = body.find('.full-info');
        if (!info_block.length) return;

        if (show_time && movie.runtime) {
            var runtime_html = '<div style="color:red;font-weight:bold;">⏱ ' + formatRuntime(movie.runtime) + '</div>';
            info_block.append(runtime_html);
        }

        if (show_date && movie.release_date) {
            var date_html = '<div style="font-weight:bold;font-style:italic;">' + movie.release_date + '</div>';
            info_block.append(date_html);
        }
    }

    Lampa.Listener.follow('full', function (e) {
        if (e.type === 'complite') {
            injectInfo(e);
        }
    });

    Lampa.Plugin.create(plugin_id, plugin_name, '1.0.0', 'Показывает время и дату релиза с настройками', injectInfo);
})();
