/*
 * Rotten Tomatoes Only Rating Block for Lampa
 *
 * Этот плагин добавляет собственный блок с двумя оценками Rotten Tomatoes —
 * от критиков и от зрителей. Рейтинг IMDb и Кинопоиска не используются.
 * Блок появляется в области подробностей карточки фильма/сериала. Для
 * получения данных используется OMDb, ключ передаётся напрямую в коде.
 */
(function () {
    'use strict';
    // проверяем наличие Lampa
    if (!window.Lampa) return;
    // предотвращаем повторную инициализацию
    if (window.rtBlockPluginInjected) return;
    window.rtBlockPluginInjected = true;

    /**
     * Фиксированный ключ OMDb. Пользователю не нужно вводить ключ в
     * настройках. При необходимости замените строку ниже своим ключом.
     */
    var omdbKey = '61b9a558';

    /**
     * Иконки Rotten Tomatoes: свежий помидор / зелёный сплэт и
     * полный попкорн / пролитый попкорн. Иконки закодированы в Base64,
     * поэтому дополнительных запросов к внешним ресурсам не требуется.
     */
    var ICON_FRESH = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABqElEQVR42pWSsUoDQRCGXxVRIKC0KRiIyO1fRGwEbYh/gLzNcRP4CrQWpJQcXzRqsRC6IbWxtLAiIooJD2BV+e31JIRGgoRUk4+FuNmTO7O7MDyaVMvXdeZnTmfJ9DJM0keB2z/8dnMD1jwoHszLt8ZyDX3LKmiKYqg8ypEN4pfH2CScoSjm3BMqHI4AxDIEj7Z37D0hzxAbIEyaZfN4zY2jVmTQyjZqmUqE6ipzDmJkOvNmI0TyIJNwmgMhCRjTfzkWb4JQVlSDJJUgXvlpXzTAkF5z6j3pNktweqWEmGdt+yhVAkWgM1ieNZ7itVo+CIgk3m8ThYoWGhDRYEQKT72fJ4/XKZdF0usa1WxOYF6hRfvlYimu7pJqtxgMIhHDdRszMDPKo1wuq+1xks9KpkmKkLwY/9ZypICDZswCFRI3vcl7mxkZhfLy0XG1BpljCSZdvt6c/dDiKUkWsnt+MnMjzA8/DOvKGkZ5LsgaGUF5SguipjcR8D73KZlvrE3A6EQ7e98D+QsOEXR9DJAEAAAAAElFTkSuQmCC';
    var ICON_POP  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABfElEQVR42pWSv0oDQRCHv0ouCkEFETrY2Ajo0LwxRDtY2KhiFx5nSUdpGHYhzF7a2RZ8g+FoYpIFVkJCJWIClbZJySCD3dOnAH38y3VZ267une+c+65P0hkzznQQzzyKD+fT+bswPefgUGc3Za4u7izdDAQrE9Rnk7vhNHHsTMUVmSqCIajSa5FxXGw5jkoyKYpGhoR5JNwQrMA0tlzh+NqZkLxJmsnlYLa6RSs64vEALjTjMkiYhRx2qFqrlzKelDcveQseDyT5iu1xgUIMgO265I6ZdxvNR/0O3uAGmCMA0L9XkvMRAnOGcL0E5gCJ1jHdZWi30EMDyGBVR6X3G5PjQxcP4F2Ac75Dpq2p+XHFgTIGppmE9/pVDlOlhTO5xAei4aGmbj3m4rzrXfY9X9t4hFoPdVUSz2dwjicr7U9iTn13gBk7ZdVddzLEAAAAASUVORK5CYII=';
    var ICON_SPLAT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAApElEQVR4nO2X0Q2AIAxED+IoTMdATMcw/mBELCgCrUbu02jv9awICjVy8FX3x7Iw1GX9uGAn3Qdo6b7w/EcSaO2+CaCnOVGrDDCi86RmHmBg7LGUlPG2Lizsxom0mHnwfME6IBT9DiCsCSAL4OB/nsAEmAATAIDOHRhYZGGOOyLOP2No/Lwl4wCJUqdnwMJwvZryEI6ASGpefwWD06BnoKTOR/QVv7AheIARBhMAAAAASUVORK5CYII=';
    var ICON_POP_SPILL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABNElEQVR4nO2WuxmDMAyEj3wZIQ1pQ8MujMsuNNBCwwYplAYTYyTZCNNxVV7wn09nHODWrVsXiwAigKTvn1cAj/z+tAEW2Hmva/36IjtQgRYMT01AjDMEctDEFNJGcBR4QOkd4FZhhPqKdmAzBiuwXmE73iP5JmdWu1zLdSr7c2CjyBa8xoBUTsHMeQMnd0PSg2idXccAU6FCEW0JWAq5mCeAfBOqgbFvCQAmAGXV2OGBfBPiCMa+pfLzWt9Pw4zy29iIzNicgU0CbsVZxJWT6cFqgFsxe1NpBMbdoHYgNDH17X8Mlt3AFFE18K6aYp+MZyL3YeR34F01hfvMGfATSS5k5M/JJgEH5TQNM8QkIkDuFHRiRxAmoe6Og8CogXDmY9+SaEI5580GJIUmtHFdYiAn1NcPdfF/9sjCi+YAAAAASUVORK5CYII=';

    // вставляем CSS, если ещё не вставлен
    if (!document.getElementById('rt-block-style')) {
        var style = document.createElement('style');
        style.id = 'rt-block-style';
        style.textContent = [
            '.rt-block{display:flex;align-items:center;gap:0.6em;margin-top:0.5em;flex-wrap:wrap;}',
            '.rt-item{display:flex;align-items:center;font-size:0.95em;background:rgba(0,0,0,0.4);padding:0.2em 0.5em;border-radius:0.3em;color:#fff;}',
            '.rt-item img{width:16px;height:16px;margin-left:0.3em;}',
            '.rt-item.rt-rotten{background:rgba(0,100,0,0.4);}']
            .join('');
        document.head.appendChild(style);
    }

    /**
     * Создаёт HTML для одной оценки. Если значение undefined, выводится "--".
     * Положительным считается рейтинг ≥ 60. При отрицательном рейтинге
     * применяется дополнительный класс rt-rotten и используется другая иконка.
     */
    function buildItem(value, positiveIcon, negativeIcon) {
        var val = (typeof value === 'number') ? value + '%' : '--';
        var isPositive = (typeof value === 'number') && value >= 60;
        var icon = isPositive ? positiveIcon : negativeIcon;
        var cls = (!isPositive && typeof value === 'number') ? ' rt-rotten' : '';
        return '<span class="rt-item' + cls + '">' + val + '<img src="' + icon + '" alt="" draggable="false"></span>';
    }

    /**
     * Загружает оценки Rotten Tomatoes через OMDb API. Возвращает объект
     * { critics: Number|undefined, audience: Number|undefined }.
     */
    function fetchRt(title, year) {
        return new Promise(function (resolve) {
            if (!omdbKey || !title) return resolve({});
            var request = new Lampa.Reguest();
            var url = 'https://www.omdbapi.com/?apikey=' + encodeURIComponent(omdbKey) + '&t=' + encodeURIComponent(title);
            if (year) url += '&y=' + encodeURIComponent(year);
            url += '&tomatoes=true';
            request.timeout(20000);
            request.silent(url, function (json) {
                var critics, audience;
                if (json && json.Response !== 'False') {
                    // Critics: tomatoMeter or rating array
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
                    // Audience: tomatoUserMeter or derived from rating
                    if (json.tomatoUserMeter && json.tomatoUserMeter !== 'N/A') {
                        var a = parseInt(json.tomatoUserMeter, 10);
                        if (!isNaN(a)) audience = a;
                    }
                    if (audience === undefined && json.tomatoUserRating && json.tomatoUserRating !== 'N/A') {
                        var num = parseFloat(json.tomatoUserRating);
                        if (!isNaN(num)) audience = num <= 10 ? Math.round(num * 10) : Math.round(num);
                    }
                }
                resolve({ critics: critics, audience: audience });
            }, function () {
                resolve({});
            });
        });
    }

    // Подписываемся на событие отображения карточки
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var renderRoot = $(e.object.activity.render());
        // ищем подходящий контейнер для вставки нашего блока: детали или инфо
        var details = renderRoot.find('.full-start-new__details, .full-start__details, .full-start-new__info, .full-start__info');
        if (!details.length) {
            // fallback: ищем родителя заголовка
            details = renderRoot.find('.full-start-new__title, .full-start__title').parent();
            if (!details.length) details = renderRoot;
        }
        // определяем название и год для запроса
        var date = movie.release_date || movie.first_air_date || movie.last_air_date || movie.year || '';
        var yearMatch = ('' + date).match(/\d{4}/);
        var year = yearMatch ? yearMatch[0] : '';
        var title = movie.original_title || movie.title || movie.original_name || movie.name;
        fetchRt(title, year).then(function (rt) {
            rt = rt || {};
            var crit = (typeof rt.critics === 'number') ? rt.critics : undefined;
            var aud  = (typeof rt.audience === 'number') ? rt.audience : undefined;
            var html = '<div class="rt-block">' +
                buildItem(crit, ICON_FRESH, ICON_SPLAT) +
                buildItem(aud,  ICON_POP,  ICON_POP_SPILL) +
                '</div>';
            // удаляем прежний блок, чтобы не дублировать
            details.find('.rt-block').remove();
            details.append(html);
        });
    });

})();