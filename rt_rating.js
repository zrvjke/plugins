/*
 * Rotten Tomatoes Ratings Block for Lampa (Improved)
 *
 * Этот плагин добавляет отдельный блок с оценками Rotten Tomatoes
 * — от критиков и от зрителей — в секцию подробностей карточки фильма
 * или сериала. В отличие от предыдущей версии, здесь нет настроек
 * для ввода ключа: ключ OMDb жёстко прописан в коде. Изображения
 * заменены на смайлики, которые выглядят чётче при разных масштабах
 * окна приложения. Цвет фона изменяется в зависимости от того,
 * положительная оценка (≥60 %) или нет. Плагин также пытается
 * использовать IMDb ID, если он доступен в объекте фильма, чтобы
 * повысить точность получения данных.
 */

(function () {
    'use strict';
    // Проверяем, что Lampa присутствует
    if (!window.Lampa) return;
    // Не допускаем повторной инициализации
    if (window.rtBlockPluginInjected) return;
    window.rtBlockPluginInjected = true;

    // Фиксированный ключ OMDb. Получить можно бесплатно на omdbapi.com
    var omdbKey = '61b9a558';

    // Смайлики для обозначения критиков и зрителей Rotten Tomatoes
    var CRITIC_EMOJI = '🍅';
    var AUDIENCE_EMOJI = '🍿';

    // Вставляем CSS для нашего блока, если его ещё нет
    if (!document.getElementById('rt-block-style')) {
        var style = document.createElement('style');
        style.id = 'rt-block-style';
        style.textContent = [
            '.rt-block{display:flex;align-items:center;gap:0.6em;margin-top:0.5em;flex-wrap:wrap;}',
            '.rt-item{display:flex;align-items:center;font-size:0.95em;background:rgba(0,0,0,0.4);padding:0.2em 0.5em;border-radius:0.3em;color:#fff;}',
            '.rt-item.rt-rotten{background:rgba(0,100,0,0.4);}',
            '.rt-item .icon{margin-left:0.3em;font-size:1.1em;}'
        ].join('');
        document.head.appendChild(style);
    }

    /**
     * Создаёт HTML для одной оценки. Если значение не определено, вместо
     * числа выводится "--". Положительная оценка считается от 60 %.
     * В зависимости от этого добавляется класс rt-rotten, который
     * меняет фон, чтобы оттенить «гнилой» результат.
     *
     * @param {Number|undefined} value Реальное значение рейтинга
     * @param {String} emoji Смайлик для данной оценки
     * @returns {String} Готовый HTML фрагмент
     */
    function buildItem(value, emoji) {
        var val = (typeof value === 'number') ? value + '%' : '--';
        var isPositive = (typeof value === 'number') && value >= 60;
        var cls = (!isPositive && typeof value === 'number') ? ' rt-rotten' : '';
        return '<span class="rt-item' + cls + '">' + val + '<span class="icon">' + emoji + '</span></span>';
    }

    /**
     * Парсит ответ OMDb на наличие рейтингов Rotten Tomatoes. Возвращает
     * объект вида { critics: Number|undefined, audience: Number|undefined }.
     *
     * @param {Object} json Ответ OMDb
     */
    function parseOmdb(json) {
        var critics, audience;
        if (json && json.Response !== 'False') {
            // Критики: tomatoMeter или элемент массива Ratings
            if (json.tomatoMeter && json.tomatoMeter !== 'N/A') {
                var c = parseInt(json.tomatoMeter, 10);
                if (!isNaN(c)) critics = c;
            }
            if (Array.isArray(json.Ratings)) {
                json.Ratings.forEach(function (e) {
                    if (e.Source === 'Rotten Tomatoes' && /\d+%/.test(e.Value)) {
                        var val = parseInt(e.Value, 10);
                        if (!isNaN(val)) critics = val;
                    }
                });
            }
            // Зрители: tomatoUserMeter или rating
            if (json.tomatoUserMeter && json.tomatoUserMeter !== 'N/A') {
                var a = parseInt(json.tomatoUserMeter, 10);
                if (!isNaN(a)) audience = a;
            }
            if (audience === undefined && json.tomatoUserRating && json.tomatoUserRating !== 'N/A') {
                var num = parseFloat(json.tomatoUserRating);
                if (!isNaN(num)) audience = num <= 10 ? Math.round(num * 10) : Math.round(num);
            }
        }
        return { critics: critics, audience: audience };
    }

    /**
     * Выполняет запрос к OMDb по IMDb ID. Возвращает объект с рейтингами.
     *
     * @param {String} imdbId Значение IMDb ID (например, tt1234567)
     */
    function fetchRtByImdb(imdbId) {
        return new Promise(function (resolve) {
            if (!imdbId) return resolve({});
            if (!omdbKey) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&i=' + encodeURIComponent(imdbId) + '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                resolve(parseOmdb(json));
            }, function () {
                resolve({});
            });
        });
    }

    /**
     * Выполняет запрос к OMDb по названию и году. Возвращает объект с рейтингами.
     *
     * @param {String} title Название фильма/сериала
     * @param {String} year Год выхода (четырёхзначный)
     */
    function fetchRtByTitle(title, year) {
        return new Promise(function (resolve) {
            if (!omdbKey || !title) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&t=' + encodeURIComponent(title);
            if (year) url += '&y=' + encodeURIComponent(year);
            url += '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                resolve(parseOmdb(json));
            }, function () {
                resolve({});
            });
        });
    }

    /**
     * Определяет, какой способ запросить данные (по IMDb ID или по названию),
     * и возвращает Promise с объектом {critics, audience}.
     *
     * @param {Object} movie Объект фильма из Lampa
     */
    function getRtRatings(movie) {
        return new Promise(function (resolve) {
            if (!movie) return resolve({});
            // Пытаемся извлечь IMDb ID из разных свойств
            var imdbId = movie.imdb_id || movie.imdb || (movie.ids && movie.ids.imdb) || '';
            // Иногда id передаётся как число без префикса tt; добавим, если нужно
            if (imdbId && typeof imdbId === 'number') {
                imdbId = 'tt' + imdbId;
            }
            // Если есть IMDb ID, используем его
            var year;
            var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
            var yearMatch = ('' + date).match(/\d{4}/);
            if (yearMatch) year = yearMatch[0];
            var title = movie.original_title || movie.title || movie.original_name || movie.name;
            if (imdbId) {
                fetchRtByImdb(imdbId).then(function (res) {
                    // Если не получили ничего, пробуем по названию
                    if (!res || (res.critics === undefined && res.audience === undefined)) {
                        fetchRtByTitle(title, year).then(resolve);
                    } else {
                        resolve(res);
                    }
                });
            } else {
                fetchRtByTitle(title, year).then(resolve);
            }
        });
    }

    // Подписываемся на событие завершения загрузки карточки
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var renderRoot = $(e.object.activity.render());
        // Ищем контейнер для вставки блока: новый или старый интерфейс
        var details = renderRoot.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
        if (!details.length) {
            // fallback: родитель заголовка
            details = renderRoot.find('.full-start-new__title, .full-start__title').parent();
            if (!details.length) details = renderRoot;
        }
        getRtRatings(movie).then(function (rt) {
            rt = rt || {};
            var critics = (typeof rt.critics === 'number') ? rt.critics : undefined;
            var audience = (typeof rt.audience === 'number') ? rt.audience : undefined;
            var html = '<div class="rt-block">' +
                buildItem(critics, CRITIC_EMOJI) +
                buildItem(audience, AUDIENCE_EMOJI) +
                '</div>';
            // Удаляем прежний блок, если он есть
            details.find('.rt-block').remove();
            // Вставляем наш блок
            details.append(html);
        });
    });
})();
