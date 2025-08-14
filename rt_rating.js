/*
 * Rotten Tomatoes Ratings via MDBList for Lampa
 *
 * Этот плагин добавляет в карточки фильмов/сериалов две оценки Rotten Tomatoes
 * (критики и зрители). В первую очередь он пытается получить данные
 * через сервис MDBList (необходим API‑ключ), потому что покрытие там
 * заметно лучше, чем в OMDb. При отсутствии ключа или данных
 * происходит автоматический откат на OMDb.
 *
 * Вместо размытых изображений используются оригинальные SVG‑иконки
 * из psahx/ps_plug. Они подгружаются напрямую и хорошо масштабируются.
 * Для маленьких экранов применяются CSS‑медиазапросы, уменьшающие
 * размер иконок и шрифта.
 */

(function () {
    'use strict';
    if (!window.Lampa) return;
    if (window.rtMdbPluginInjected) return;
    window.rtMdbPluginInjected = true;

    // --- Ключи API ---
    // Ключ OMDb (фиксированный для резервного канала)
    var omdbKey = '61b9a558';
    // Ключ MDBList. Чтобы плагин работал через MDBList, получите свой
    // ключ на сайте mdblist.com и вставьте его сюда. Оставьте пустой,
    // чтобы использовать только OMDb.
    // API ключ для MDBList. Этот ключ используется для получения рейтингов
    // Rotten Tomatoes через сервис mdblist.com. Вы можете заменить его
    // на свой, если понадобится. Текущий ключ предоставлен пользователем.
    var mdblistKey = 'hx4fegxixdzg8yj9v8xu2agyj';

    // --- Ссылки на SVG‑иконки Rotten Tomatoes от psahx ---
    var ICONS = {
        criticsFresh: 'https://psahx.github.io/ps_plug/Rotten_Tomatoes.svg',
        criticsRotten: 'https://psahx.github.io/ps_plug/Rotten_Tomatoes_rotten.svg',
        audienceFresh: 'https://psahx.github.io/ps_plug/Rotten_Tomatoes_positive_audience.svg',
        audienceRotten: 'https://psahx.github.io/ps_plug/Rotten_Tomatoes_negative_audience.svg'
    };

    // Вставляем стили для блока. Используем медиазапрос, чтобы менять
    // размер текста и иконок на маленьких экранах.
    if (!document.getElementById('rt-mdb-style')) {
        var style = document.createElement('style');
        style.id = 'rt-mdb-style';
        style.textContent = [
            '.rt-mdb-block{display:flex;align-items:center;gap:0.6em;margin-top:0.5em;flex-wrap:wrap;}',
            '.rt-mdb-item{display:flex;align-items:center;font-size:0.95em;background:rgba(0,0,0,0.4);padding:0.2em 0.5em;border-radius:0.3em;color:#fff;}',
            '.rt-mdb-item.rt-rotten{background:rgba(0,100,0,0.4);}',
            '.rt-mdb-item img{width:16px;height:16px;margin-left:0.3em;}',
            '@media (max-width:600px){',
            '  .rt-mdb-item{font-size:0.85em;}',
            '  .rt-mdb-item img{width:14px;height:14px;}',
            '}',
            '@media (min-width:1200px){',
            '  .rt-mdb-item{font-size:1em;}',
            '  .rt-mdb-item img{width:18px;height:18px;}',
            '}'
        ].join('');
        document.head.appendChild(style);
    }

    /**
     * Формирует HTML элемента рейтинга. Положительная оценка – ≥60 %,
     * для негативной добавляется класс rt-rotten.
     */
    function buildItem(value, freshIcon, rottenIcon) {
        var val = (typeof value === 'number') ? value + '%' : '--';
        var isPositive = (typeof value === 'number') && value >= 60;
        var icon = isPositive ? freshIcon : rottenIcon;
        var cls = (!isPositive && typeof value === 'number') ? ' rt-rotten' : '';
        return '<span class="rt-mdb-item' + cls + '">' + val + '<img src="' + icon + '" alt="" draggable="false"></span>';
    }

    /**
     * Делает запрос к MDBList по IMDb ID. Возвращает объект с
     * {critics, audience}, или пустой объект если данных нет или нет ключа.
     */
    function fetchMdb(imdbId) {
        return new Promise(function (resolve) {
            if (!mdblistKey || !imdbId) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://api.mdblist.com/?i=' + encodeURIComponent(imdbId) + '&apikey=' + encodeURIComponent(mdblistKey);
            request.timeout(15000);
            request.silent(url, function (json) {
                var crit, aud;
                if (json && typeof json.tomatoes === 'number') {
                    crit = json.tomatoes;
                }
                if (json && (typeof json.popcorn === 'number' || typeof json.popcorn === 'string')) {
                    var p = parseFloat(json.popcorn);
                    if (!isNaN(p)) aud = p;
                }
                resolve({ critics: crit, audience: aud });
            }, function () {
                resolve({});
            });
        });
    }

    /**
     * Парсит ответ OMDb в формате Rotten Tomatoes (резервный канал).
     */
    function parseOmdb(json) {
        var critics, audience;
        if (json && json.Response !== 'False') {
            if (json.tomatoMeter && json.tomatoMeter !== 'N/A') {
                var c = parseInt(json.tomatoMeter, 10);
                if (!isNaN(c)) critics = c;
            }
            if (Array.isArray(json.Ratings)) {
                json.Ratings.forEach(function (e) {
                    if (e.Source === 'Rotten Tomatoes' && /\d+%/.test(e.Value)) {
                        var v = parseInt(e.Value, 10);
                        if (!isNaN(v)) critics = v;
                    }
                });
            }
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
     * Делает запрос к OMDb по IMDb ID.
     */
    function fetchOmdbByImdb(imdbId) {
        return new Promise(function (resolve) {
            if (!imdbId || !omdbKey) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&i=' + encodeURIComponent(imdbId) + '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                resolve(parseOmdb(json));
            }, function () { resolve({}); });
        });
    }

    /**
     * Делает запрос к OMDb по названию и году. Используется, когда нет IMDb ID.
     */
    function fetchOmdbByTitle(title, year) {
        return new Promise(function (resolve) {
            if (!title || !omdbKey) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&t=' + encodeURIComponent(title);
            if (year) url += '&y=' + encodeURIComponent(year);
            url += '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                resolve(parseOmdb(json));
            }, function () { resolve({}); });
        });
    }

    /**
     * Получает рейтинги Rotten Tomatoes для указанного фильма: сначала
     * через MDBList (если есть ключ), затем резервно через OMDb.
     */
    function getRatings(movie) {
        return new Promise(function (resolve) {
            if (!movie) return resolve({});
            var imdbId = movie.imdb_id || movie.imdb || (movie.ids && movie.ids.imdb) || '';
            if (imdbId && typeof imdbId === 'number') imdbId = 'tt' + imdbId;
            var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
            var yearMatch = ('' + date).match(/\d{4}/);
            var year = yearMatch ? yearMatch[0] : '';
            var title = movie.original_title || movie.title || movie.original_name || movie.name;
            // Сначала пробуем MDBList
            fetchMdb(imdbId).then(function (res) {
                if (res && (typeof res.critics === 'number' || typeof res.audience === 'number')) {
                    return resolve(res);
                }
                // Если нет данных – OMDb по IMDb ID, затем по названию
                fetchOmdbByImdb(imdbId).then(function (res2) {
                    if (res2 && (typeof res2.critics === 'number' || typeof res2.audience === 'number')) {
                        return resolve(res2);
                    }
                    fetchOmdbByTitle(title, year).then(resolve);
                });
            });
        });
    }

    // Обработчик события завершения построения карточки
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var renderRoot = $(e.object.activity.render());
        var details = renderRoot.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
        if (!details.length) {
            details = renderRoot.find('.full-start-new__title, .full-start__title').parent();
            if (!details.length) details = renderRoot;
        }
        getRatings(movie).then(function (rt) {
            rt = rt || {};
            var crit = (typeof rt.critics === 'number') ? rt.critics : undefined;
            var aud  = (typeof rt.audience === 'number') ? rt.audience : undefined;
            var html = '<div class="rt-mdb-block">' +
                buildItem(crit, ICONS.criticsFresh, ICONS.criticsRotten) +
                buildItem(aud, ICONS.audienceFresh, ICONS.audienceRotten) +
                '</div>';
            details.find('.rt-mdb-block').remove();
            details.append(html);
        });
    });
})();
