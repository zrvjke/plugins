/*
 * Плагин для приложения Lampa (веб‑версия и десктоп), который заменяет
 * стандартную строку рейтингов в карточке фильма/сериала на собственную.
 * В новой строке отображаются: IMDb, Кинопоиск, Rotten Tomatoes (критики) и
 * Rotten Tomatoes (зрители). Плагин обеспечивает настройку ввода API‑ключа
 * OMDb, необходимого для получения оценок Rotten Tomatoes.
 *
 * Как это работает:
 * 1. При открытии карточки слушаем событие `full` и ждём, пока появится
 *    контейнер с деталями (класс `.new-interface-info__details`).
 * 2. Получаем рейтинги: IMDb и КП — через API Kinopoisk, RT — через OMDb.
 *    Если данные недоступны, выводим `--`.
 * 3. Составляем HTML‑строку из четырёх блоков с иконками и значениями.
 *    Между блоками ставим точку (`•`).
 * 4. Очищаем старую строку (если она есть), скрываем штатную строку
 *    `.info__rate` и вставляем новую строку в начало контейнера.
 *
 * Чтобы использовать плагин:
 * 1. Сохраните этот файл на GitHub или другом хостинге (например,
 *    `https://raw.githubusercontent.com/<ваш_логин>/<репозиторий>/rating_rt_line.js`).
 * 2. В Lampa перейдите в настройки → «Расширения», нажмите «Добавить плагин»
 *    и вставьте URL вашего файла.
 * 3. После установки в меню настроек появится пункт «Rating Rotten Tomatoes».
 *    Введите туда свой API‑ключ OMDb (получить можно бесплатно на omdbapi.com).
 *
 * Плагин не собирает никаких личных данных. Исходный код открыт и понятен.
 */
(function () {
    'use strict';

    // Запрет повторной инициализации
    if (window.rtLinePluginInjected) return;
    window.rtLinePluginInjected = true;

    // Ключ для хранения API‑ключа OMDb
    var STORAGE_KEY = 'rt_line_apikey';

    // Загружаем сохранённый API‑ключ (если есть)
    var omdbKey = Lampa.Storage.get(STORAGE_KEY, '');

    /*
     * Иконки. IMDb и Кинопоиск берём из репозитория psahx (они открыты),
     * помидор и попкорн — закодированы в base64 (можно заменить на свои).
     */
    var ICON_IMDB = 'https://psahx.github.io/ps_plug/IMDB.svg';
    var ICON_KP   = 'https://psahx.github.io/ps_plug/kinopoisk-icon-main.svg';
    var ICON_RT_CRITICS = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABqElEQVR42pWSsUoDQRCGXxVRIKC0KRiIyO1fRGwEbYh/gLzNcRP4CrQWpJQcXzRqsRC6IbWxtLAiIooJD2BV+e31JIRGgoRUk4+FuNmTO7O7MDyaVMvXdeZnTmfJ9DJM0keB2z/8dnMD1jwoHszLt8ZyDX3LKmiKYqg8ypEN4pfH2CScoSjm3BMqHI4AxDIEj7Z37D0hzxAbIEyaZfN4zY2jVmTQyjZqmUqE6ipzDmJkOvNmI0TyIJNwmgMhCRjTfzkWb4JQVlSDJJUgXvlpXzTAkF5z6j3pNktweqWEmGdt+yhVAkWgM1ieNZ7itVo+CIgk3m8ThYoWGhDRYEQKT72fJ4/XKZdF0usa1WxOYF6hRfvlYimu7pJqtxgMIhHDdRszMDPKo1wuq+1xks9KpkmKkLwY/9ZypICDZswCFRI3vcl7mxkZhfLy0XG1BpljCSZdvt6c/dDiKUkWsnt+MnMjzA8/DOvKGkZ5LsgaGUF5SguipjcR8D73KZlvrE3A6EQ7e98D+QsOEXR9DJAEAAAAAElFTkSuQmCC';
    var ICON_RT_AUDIENCE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABfElEQVR42pWSv0oDQRCHv0ouCkEFETrY2Ajo0LwxRDtY2KhiFx5nSUdpGHYhzF7a2RZ8g+FoYpIFVkJCJWIClbZJySCD3dOnAH38y3VZ267une+c+65P0hkzznQQzzyKD+fT+bswPefgUGc3Za4u7izdDAQrE9Rnk7vhNHHsTMUVmSqCIajSa5FxXGw5jkoyKYpGhoR5JNwQrMA0tlzh+NqZkLxJmsnlYLa6RSs64vEALjTjMkiYhRx2qFqrlzKelDcveQseDyT5iu1xgUIMgO265I6ZdxvNR/0O3uAGmCMA0L9XkvMRAnOGcL0E5gCJ1jHdZWi30EMDyGBVR6X3G5PjQxcP4F2Ac75Dpq2p+XHFgTIGppmE9/pVDlOlhTO5xAei4aGmbj3m4rzrXfY9X9t4hFoPdVUSz2dwjicr7U9iTn13gBk7ZdVddzLEAAAAASUVORK5CYII=';

    /**
     * Добавляем строки перевода. Формат: ключ: { ru: '…', en: '…' }.
     */
    Lampa.Lang.add({
        rt_line_plugin_name: {
            ru: 'Rating Rotten Tomatoes',
            en: 'Rating Rotten Tomatoes'
        },
        rt_line_api_key_name: {
            ru: 'Введите API‑ключ OMDb',
            en: 'Enter OMDb API key'
        },
        rt_line_api_key_desc: {
            ru: 'Ключ необходим для получения Rotten Tomatoes',
            en: 'Key is needed for Rotten Tomatoes ratings'
        },
        rt_line_api_key_saved: {
            ru: 'API‑ключ сохранён',
            en: 'API key saved'
        }
    });

    /**
     * Регистрация настроек плагина. В меню появится пункт, где можно ввести API‑ключ.
     */
    function registerSettings() {
        var svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>';
        Lampa.SettingsApi.addComponent({
            component: 'rt_line_plugin',
            name: Lampa.Lang.translate('rt_line_plugin_name'),
            icon: svgIcon
        });
        Lampa.SettingsApi.addParam({
            component: 'rt_line_plugin',
            param: {
                name: STORAGE_KEY,
                type: 'input',
                default: omdbKey,
                values: {},
                placeholder: ''
            },
            field: {
                name: Lampa.Lang.translate('rt_line_api_key_name'),
                description: Lampa.Lang.translate('rt_line_api_key_desc')
            },
            onChange: function (val) {
                omdbKey = val || '';
                Lampa.Storage.set(STORAGE_KEY, omdbKey);
                try { Lampa.Noty.show(Lampa.Lang.translate('rt_line_api_key_saved')); } catch (e) {}
            }
        });
    }
    // Регистрация с минимальной задержкой, чтобы SettingsApi успела инициализироваться
    setTimeout(registerSettings, 100);

    /**
     * Получение рейтингов IMDb и КП через неофициальный API Kinopoisk.
     * @param {Object} movie Объект фильма, содержащий imdb_id или imdbId
     * @returns {Promise<{imdb?: string, kp?: string}>}
     */
    function getKpImdb(movie) {
        return new Promise(function (resolve) {
            var imdbId = movie && (movie.imdb_id || movie.imdbId || movie.imdbID);
            if (!imdbId) {
                resolve({});
                return;
            }
            var network = new Lampa.Reguest();
            var url = 'https://kinopoiskapiunofficial.tech/api/v2.2/films?imdbId=' + encodeURIComponent(imdbId);
            network.timeout(15000);
            network.silent(url, function (json) {
                var imdb, kp;
                if (json && json.items && json.items.length) {
                    var film = json.items[0];
                    imdb = film.ratingImdb;
                    kp   = film.ratingKinopoisk;
                } else if (json && json.ratingImdb) {
                    imdb = json.ratingImdb;
                    kp   = json.ratingKinopoisk;
                }
                resolve({ imdb: imdb, kp: kp });
            }, function () {
                resolve({});
            }, false, {
                headers: { 'X-API-KEY': '2a4a0808-81a3-40ae-b0d3-e11335ede616' }
            });
        });
    }

    /**
     * Получение рейтингов Rotten Tomatoes из OMDb.
     * @param {string} title Название фильма/сериала
     * @param {string} year  Год (может быть пустой)
     * @returns {Promise<{critics?: string, audience?: string}>}
     */
    function getRt(title, year) {
        return new Promise(function (resolve) {
            if (!omdbKey || !title) {
                resolve({});
                return;
            }
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
            }, function () {
                resolve({});
            });
        });
    }

    /**
     * Формирование блока рейтинга. Возвращает HTML‑строку.
     * @param {string|number|undefined} value Значение рейтинга
     * @param {string} icon URL иконки
     * @param {string} alt Текст для alt
     */
    function renderItem(value, icon, alt) {
        var display = (value === undefined || value === null || value === '') ? '--' : value;
        return '<div class="full-start__rate custom-rt-item"><div>' + display + '</div>' +
            '<img src="' + icon + '" alt="' + alt + '" class="custom-rt-icon" draggable="false"></div>';
    }

    /**
     * Обработчик события `full`: создаём новую строку рейтингов.
     */
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;
        var data  = event.data || {};
        var movie = data.movie || data.item || data.card || {};
        var render = event.object.activity.render();
        // Ищем контейнер деталей
        var $details = $(render).find('.new-interface-info__details');
        if (!$details.length) {
            var $oldRate = $(render).find('.info__rate');
            if ($oldRate.length) $details = $oldRate.parent();
        }
        if (!$details.length) return;
        // Функция вставки строки
        function insertLine() {
            var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
            var year = '';
            if (date) {
                var m = ('' + date).match(/\d{4}/);
                if (m) year = m[0];
            }
            var title = movie.original_title || movie.title || movie.original_name || movie.name;
            Promise.all([getKpImdb(movie), getRt(title, year)]).then(function (vals) {
                var kpimdb = vals[0] || {};
                var rt     = vals[1] || {};
                var items  = [];
                if (kpimdb.imdb) {
                    var v = parseFloat(kpimdb.imdb);
                    if (!isNaN(v)) v = v.toFixed(1);
                    items.push(renderItem(v, ICON_IMDB, 'IMDb'));
                } else items.push(renderItem(undefined, ICON_IMDB, 'IMDb'));
                if (kpimdb.kp) {
                    var vk = parseFloat(kpimdb.kp);
                    if (!isNaN(vk)) vk = vk.toFixed(1);
                    items.push(renderItem(vk, ICON_KP, 'Kinopoisk'));
                } else items.push(renderItem(undefined, ICON_KP, 'Kinopoisk'));
                items.push(renderItem(rt.critics ? rt.critics + '%' : undefined, ICON_RT_CRITICS, 'RT Critics'));
                items.push(renderItem(rt.audience ? rt.audience + '%' : undefined, ICON_RT_AUDIENCE, 'RT Audience'));
                var html = items.join('<span class="new-interface-info__split">&#9679;</span>');
                var line = '<div class="line-one-details custom-rt-line">' + html + '</div>';
                $details.find('.line-one-details.custom-rt-line').remove();
                $details.prepend(line);
                $(render).find('.info__rate').addClass('hide');
            });
        }
        setTimeout(insertLine, 100);
    });

})();