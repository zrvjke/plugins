/*
 * Rotten Tomatoes Rating Block for Lampa
 *
 * Этот плагин не пытается изменить стандартную строку рейтингов TMDb/IMDb/KP.
 * Вместо этого он добавляет собственный блок с четырьмя рейтингами
 * (IMDb, Кинопоиск, Rotten Tomatoes критиков и зрителей) в область
 * подробностей карточки фильма/сериала. Блок автоматически появляется
 * при открытии карточки. Настройка API‑ключа OMDb для получения данных
 * Rotten Tomatoes доступна в меню настроек Лампы.
 */
(function () {
    'use strict';
    if (!window.Lampa) return;

    // предотвращаем повторную инициализацию
    if (window.rtBlockPluginInjected) return;
    window.rtBlockPluginInjected = true;

    var STORAGE_KEY = 'rt_block_apikey';
    var omdbKey = Lampa.Storage.get(STORAGE_KEY, '');

    // иконки
    var ICON_IMDB = 'https://psahx.github.io/ps_plug/IMDB.svg';
    var ICON_KP   = 'https://psahx.github.io/ps_plug/kinopoisk-icon-main.svg';
    var ICON_RT_CRITICS  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABqElEQVR42pWSsUoDQRCGXxVRIKC0KRiIyO1fRGwEbYh/gLzNcRP4CrQWpJQcXzRqsRC6IbWxtLAiIooJD2BV+e31JIRGgoRUk4+FuNmTO7O7MDyaVMvXdeZnTmfJ9DJM0keB2z/8dnMD1jwoHszLt8ZyDX3LKmiKYqg8ypEN4pfH2CScoSjm3BMqHI4AxDIEj7Z37D0hzxAbIEyaZfN4zY2jVmTQyjZqmUqE6ipzDmJkOvNmI0TyIJNwmgMhCRjTfzkWb4JQVlSDJJUgXvlpXzTAkF5z6j3pNktweqWEmGdt+yhVAkWgM1ieNZ7itVo+CIgk3m8ThYoWGhDRYEQKT72fJ4/XKZdF0usa1WxOYF6hRfvlYimu7pJqtxgMIhHDdRszMDPKo1wuq+1xks9KpkmKkLwY/9ZypICDZswCFRI3vcl7mxkZhfLy0XG1BpljCSZdvt6c/dDiKUkWsnt+MnMjzA8/DOvKGkZ5LsgaGUF5SguipjcR8D73KZlvrE3A6EQ7e98D+QsOEXR9DJAEAAAAAElFTkSuQmCC';
    var ICON_RT_AUDIENCE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABfElEQVR42pWSv0oDQRCHv0ouCkEFETrY2Ajo0LwxRDtY2KhiFx5nSUdpGHYhzF7a2RZ8g+FoYpIFVkJCJWIClbZJySCD3dOnAH38y3VZ267une+c+65P0hkzznQQzzyKD+fT+bswPefgUGc3Za4u7izdDAQrE9Rnk7vhNHHsTMUVmSqCIajSa5FxXGw5jkoyKYpGhoR5JNwQrMA0tlzh+NqZkLxJmsnlYLa6RSs64vEALjTjMkiYhRx2qFqrlzKelDcveQseDyT5iu1xgUIMgO265I6ZdxvNR/0O3uAGmCMA0L9XkvMRAnOGcL0E5gCJ1jHdZWi30EMDyGBVR6X3G5PjQxcP4F2Ac75Dpq2p+XHFgTIGppmE9/pVDlOlhTO5xAei4aGmbj3m4rzrXfY9X9t4hFoPdVUSz2dwjicr7U9iTn13gBk7ZdVddzLEAAAAASUVORK5CYII=';

    // перевод
    Lampa.Lang.add({
        rt_block_plugin_name: {
            ru: 'Rating RT (блок)',
            en: 'Rating RT (block)'
        },
        rt_block_api_key_name: {
            ru: 'API‑ключ OMDb',
            en: 'OMDb API key'
        },
        rt_block_api_key_desc: {
            ru: 'Введите ваш ключ для Rotten Tomatoes',
            en: 'Enter your key for Rotten Tomatoes'
        },
        rt_block_saved: {
            ru: 'Ключ сохранён',
            en: 'Key saved'
        }
    });

    // регистрация настроек
    function registerSettings() {
        var icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>';
        Lampa.SettingsApi.addComponent({
            component: 'rt_block_plugin',
            name: Lampa.Lang.translate('rt_block_plugin_name'),
            icon: icon
        });
        Lampa.SettingsApi.addParam({
            component: 'rt_block_plugin',
            param: {
                name: STORAGE_KEY,
                type: 'input',
                default: omdbKey,
                values: {},
                placeholder: ''
            },
            field: {
                name: Lampa.Lang.translate('rt_block_api_key_name'),
                description: Lampa.Lang.translate('rt_block_api_key_desc')
            },
            onChange: function (val) {
                omdbKey = val || '';
                Lampa.Storage.set(STORAGE_KEY, omdbKey);
                try { Lampa.Noty.show(Lampa.Lang.translate('rt_block_saved')); } catch (e) {}
            }
        });
    }
    setTimeout(registerSettings, 100);

    // добавляем CSS для блока
    if (!document.getElementById('rt-block-style')) {
        var css = document.createElement('style');
        css.id = 'rt-block-style';
        css.textContent = [
            '.rt-block { display:flex; align-items:center; margin-top:0.5em; gap:0.6em; flex-wrap:wrap; }',
            '.rt-item { display:flex; align-items:center; font-size:0.95em; background:rgba(0,0,0,0.4); padding:0.2em 0.4em; border-radius:0.3em; color:#fff; }',
            '.rt-item img { width:16px; height:16px; margin-left:0.3em; }',
            '.rt-block .separator { color:#888; margin:0 0.4em; }'
        ].join('');
        document.head.appendChild(css);
    }

    /**
     * Получаем рейтинги Кинопоиска и IMDb через неофициальный API.
     */
    function fetchKpImdb(movie) {
        /**
         * Получает оценки IMDb и Кинопоиска из объекта фильма, если такие доступны.
         * В ранних версиях плагина использовался внешний API, но в текущей
         * Lampa эти значения уже присутствуют в свойстве movie.rating.
         */
        return new Promise(function (resolve) {
            var imdb, kp;
            if (movie && movie.rating) {
                if (movie.rating.imdb) imdb = movie.rating.imdb;
                if (movie.rating.kp)   kp   = movie.rating.kp;
            }
            resolve({ imdb: imdb, kp: kp });
        });
    }

    /**
     * Получаем оценки Rotten Tomatoes через OMDb.
     */
    function fetchRt(title, year) {
        return new Promise(function (resolve) {
            if (!omdbKey || !title) return resolve({});
            var req = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&t=' + encodeURIComponent(title);
            if (year) url += '&y=' + encodeURIComponent(year);
            url += '&tomatoes=true';
            req.timeout(20000);
            req.silent(url, function (json) {
                var critics, audience;
                if (json && json.Response !== 'False') {
                    if (Array.isArray(json.Ratings)) {
                        json.Ratings.forEach(function (e) {
                            if (e.Source === 'Rotten Tomatoes' && /\d+%/.test(e.Value)) {
                                critics = e.Value.replace('%', '');
                            }
                        });
                    }
                    if (json.tomatoMeter && json.tomatoMeter !== 'N/A') critics = json.tomatoMeter;
                    if (json.tomatoUserMeter && json.tomatoUserMeter !== 'N/A') audience = json.tomatoUserMeter;
                    if (!audience && json.tomatoUserRating && json.tomatoUserRating !== 'N/A') {
                        var num = parseFloat(json.tomatoUserRating);
                        if (!isNaN(num)) audience = num <= 10 ? (num * 10).toFixed(0) : num.toString();
                    }
                }
                resolve({ critics: critics, audience: audience });
            }, function () { resolve({}); });
        });
    }

    /**
     * Создание HTML для одной оценки
     */
    function buildItem(value, icon, alt) {
        var val = (value || value === 0) ? value : '--';
        return '<span class="rt-item">' + val + '<img src="' + icon + '" alt="' + alt + '" draggable="false"></span>';
    }

    /**
     * Главный обработчик события загрузки карточки
     */
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var root = $(e.object.activity.render());
        // ищем блок деталей
        var details = root.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
        if (!details.length) {
            // fallback: под заголовком
            details = root.find('.full-start-new__title, .full-start__title').parent();
            if (!details.length) details = root;
        }
        // готовим данные
        var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
        var year = '';
        var m = ('' + date).match(/\d{4}/);
        if (m) year = m[0];
        var title = movie.original_title || movie.title || movie.original_name || movie.name;
        Promise.all([fetchKpImdb(movie), fetchRt(title, year)]).then(function (vals) {
            var kpimdb = vals[0] || {};
            var rtvals = vals[1] || {};
            // подготавливаем значения
            var imdbVal = kpimdb.imdb ? parseFloat(kpimdb.imdb).toFixed(1) : undefined;
            var kpVal   = kpimdb.kp   ? parseFloat(kpimdb.kp).toFixed(1)   : undefined;
            var critVal = rtvals.critics ? rtvals.critics + '%' : undefined;
            var audVal  = rtvals.audience ? rtvals.audience + '%' : undefined;
            // строим блок
            var html = '<div class="rt-block">' +
                buildItem(imdbVal, ICON_IMDB, 'IMDb') +
                buildItem(kpVal, ICON_KP, 'Kinopoisk') +
                buildItem(critVal, ICON_RT_CRITICS, 'RT Critics') +
                buildItem(audVal, ICON_RT_AUDIENCE, 'RT Audience') +
                '</div>';
            // удаляем прежний блок
            details.find('.rt-block').remove();
            // вставляем в конец блока деталей
            details.append(html);
        });
    });
})();