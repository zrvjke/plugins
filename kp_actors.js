(function(){
    'use strict';
    // *** Настройки API-ключей *** 
    var KP_API_URL = 'https://kinopoiskapiunofficial.tech/';          // Базовый URL неофициального API Кинопоиска
    var KP_API_KEY = 'YOUR_KP_UNOFFICIAL_API_KEY';                    // <-- Вставьте сюда ваш X-API-KEY для kinopoiskapiunofficial.tech
    var TMDB_API_KEY = 'f090bb54758cabf231fb605d3e3e0468';            // API-ключ TMDB (можно заменить своим)

    var network = new Lampa.Reguest();
    var network2 = new Lampa.Reguest();  // отдельный объект для запросов к TMDB
    var cache = {};
    var total_cnt = 0, proxy_cnt = 0, good_cnt = 0;
    var menu_list = [];
    var genres_map = {}, countries_map = {};
    var CACHE_SIZE = 100, CACHE_TIME = 3600000;  // кэш на 1 час
    var SOURCE_NAME = 'KP', SOURCE_TITLE = 'KP';

    // Выполнение GET-запроса к Kinopoisk API с учётом прокси при необходимости
    function get(method, oncomplete, onerror) {
        var use_proxy = total_cnt >= 10 && good_cnt > total_cnt/2;
        if(!use_proxy) total_cnt++;
        var cors_proxy = 'https://cors.kp556.workers.dev:8443/';  // прокси для обхода CORS и ограничений (из оригинального кода)
        var url = KP_API_URL + method;
        network.timeout(15000);
        network.silent((use_proxy ? cors_proxy : '') + url, 
            function(json) { oncomplete(json); }, 
            function(a,c) {
                // при ошибке 429 или блокировке – повторить через прокси
                use_proxy = !use_proxy && (proxy_cnt < 10 || good_cnt > proxy_cnt/2);
                if(use_proxy && (a.status == 429 || (a.status == 0 && a.statusText !== 'timeout'))) {
                    proxy_cnt++;
                    network.timeout(15000);
                    network.silent(cors_proxy + url, 
                        function(json) { good_cnt++; oncomplete(json); }, 
                        onerror,
                        false,
                        { headers: { 'X-API-KEY': KP_API_KEY } }
                    );
                } else {
                    onerror(a,c);
                }
            },
            false,
            { headers: { 'X-API-KEY': KP_API_KEY } }
        );
    }
    function getComplite(method, oncomplete) {
        get(method, oncomplete, function(){ oncomplete(null); });
    }
    function getCompliteIf(condition, method, oncomplete) {
        if(condition) getComplite(method, oncomplete);
        else setTimeout(function(){ oncomplete(null); }, 10);
    }
    // Функции кэширования 
    function getCache(key) {
        var node = cache[key];
        if(node) {
            var valid_after = Date.now() - CACHE_TIME;
            if(node.timestamp > valid_after) return node.value;
            // очистка просроченных элементов
            for(var id in cache) {
                if(!(cache[id] && cache[id].timestamp > valid_after)) delete cache[id];
            }
        }
        return null;
    }
    function setCache(key, value) {
        var now = Date.now();
        var keys = Object.keys(cache);
        if(keys.length >= CACHE_SIZE) {
            // удаляем старые элементы кэша
            var valid_after = now - CACHE_TIME;
            for(var id in cache) {
                if(!(cache[id] && cache[id].timestamp > valid_after)) delete cache[id];
            }
            keys = Object.keys(cache);
            if(keys.length >= CACHE_SIZE) {
                // всё ещё много элементов – удалим самую старую половину
                var timestamps = keys.map(function(id){ return cache[id].timestamp || 0; });
                timestamps.sort(function(a,b){ return a - b; });
                var cutoff = timestamps[Math.floor(timestamps.length/2)];
                for(var id2 in cache) {
                    if(!(cache[id2] && cache[id2].timestamp > cutoff)) delete cache[id2];
                }
            }
        }
        cache[key] = { timestamp: now, value: value };
    }

    function clear() {
        network.clear();
        network2.clear();
    }

    // Утилиты для обработки строк названий
    function cleanTitle(str) {
        return (str || '').replace(/[\s.,:;’'`!?]+/g, ' ').trim();
    }
    function kpCleanTitle(str) {
        // приводит строку к удобному виду для поиска (убирает лишние символы, повторяющиеся пробелы и т.п.)
        return cleanTitle(str).replace(/^[\/\\\s]+|[\/\\\s]+$/g, '')
                              .replace(/\+( *[+\/\\])+/g, '+')
                              .replace(/([+\/\\] *)+\+/g, '+')
                              .replace(/( *[\/\\]+ *)+/g, '+');
    }
    function normalizeTitle(str) {
        // нормализация для сравнения: в нижний регистр, заменяя дефисы на единый символ, ё -> е
        return cleanTitle(str.toLowerCase().replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-').replace(/ё/g, 'е'));
    }
    function containsTitle(str, title) {
        if(typeof str !== 'string' || typeof title !== 'string') return false;
        return normalizeTitle(str).indexOf(normalizeTitle(title)) !== -1;
    }
    function equalTitle(str, title) {
        if(typeof str !== 'string' || typeof title !== 'string') return false;
        return normalizeTitle(str) === normalizeTitle(title);
    }

    // Преобразование данных персон (актёров/съёмочной группы) в формат Lampa
    function convertPerson(person) {
        return {
            id: person.staffId,
            name: person.nameRu || person.nameEn || '',
            url: '',
            img: person.posterUrl || '',
            character: person.description || '',
            job: Lampa.Utils.capitalizeFirstLetter((person.professionKey || '').toLowerCase())
        };
    }
    // Преобразование сезона (для сериалов)
    function convertSeason(season) {
        var episodes = (season.episodes || []).map(function(e){
            return {
                season_number: e.seasonNumber,
                episode_number: e.episodeNumber,
                name: e.nameRu || e.nameEn || ('S' + e.seasonNumber + ' / ' + Lampa.Lang.translate('torrent_serial_episode') + ' ' + e.episodeNumber),
                overview: e.synopsis || '',
                air_date: e.releaseDate
            };
        });
        return {
            season_number: season.number,
            episode_count: episodes.length,
            episodes: episodes,
            name: Lampa.Lang.translate('torrent_serial_season') + ' ' + season.number,
            overview: ''
        };
    }
    // Основная функция преобразования объекта фильма Kinopoisk в формат Lampa
    function convertElem(elem) {
        var type = (!elem.type || elem.type === 'FILM' || elem.type === 'VIDEO') ? 'movie' : 'tv';
        var kpId = elem.kinopoiskId || elem.filmId || 0;
        var kp_rating = Number(elem.rating || elem.ratingKinopoisk || 0);
        var title = elem.nameRu || elem.nameEn || elem.nameOriginal || '';
        var original_title = elem.nameOriginal || elem.nameEn || elem.nameRu || '';
        var adultFlag = false;
        var result = {
            source: SOURCE_NAME,
            type: type,
            adult: false,
            id: SOURCE_NAME + '_' + kpId,  // например "KP_12345"
            title: title,
            original_title: original_title,
            overview: elem.description || elem.shortDescription || '',
            img: elem.posterUrlPreview || elem.posterUrl || '',
            background_image: elem.coverUrl || elem.posterUrl || elem.posterUrlPreview || '',
            genres: (elem.genres || []).map(function(g){
                if(g.genre === 'для взрослых') adultFlag = true;
                return { id: genres_map[g.genre] || 0, name: g.genre, url: '' };
            }),
            production_companies: [],
            production_countries: (elem.countries || []).map(function(c){ return { name: c.country }; }),
            vote_average: kp_rating,
            vote_count: Number(elem.ratingVoteCount || elem.ratingKinopoiskVoteCount || 0),
            kinopoisk_id: kpId,
            kp_rating: kp_rating,
            imdb_id: elem.imdbId || '',
            imdb_rating: Number(elem.ratingImdb || 0)
        };
        result.adult = adultFlag;
        // Год / даты релиза
        var first_date = (elem.year && elem.year !== 'null') ? String(elem.year) : '';
        var last_date = '';
        if(type === 'tv') {
            if(elem.startYear && elem.startYear !== 'null') first_date = String(elem.startYear);
            if(elem.endYear && elem.endYear !== 'null') last_date = String(elem.endYear);
        }
        // Если есть информация о премьерных показах – берем самую раннюю дату мировой премьеры, не раньше года выхода
        if(elem.distributions_obj) {
            var distributions = elem.distributions_obj.items || [];
            var year_ts = Date.parse(first_date);
            var minPremiere = null;
            distributions.forEach(function(d){
                if(d.date && (d.type === 'WORLD_PREMIER' || d.type === 'ALL')) {
                    var dt = Date.parse(d.date);
                    if(!isNaN(dt) && (minPremiere == null || dt < minPremiere) && (isNaN(year_ts) || dt >= year_ts)) {
                        minPremiere = dt;
                        first_date = d.date;
                    }
                }
            });
        }
        if(type === 'tv') {
            result.name = title;
            result.original_name = original_title;
            result.first_air_date = first_date;
            if(last_date) result.last_air_date = last_date;
        } else {
            result.release_date = first_date;
        }
        // Добавляем информацию о сезонах (для сериалов)
        if(elem.seasons_obj) {
            var seasons = elem.seasons_obj.items || [];
            result.number_of_seasons = elem.seasons_obj.total || seasons.length || 1;
            result.seasons = seasons.map(convertSeason);
            var totalEpisodes = 0;
            result.seasons.forEach(function(s){ totalEpisodes += s.episode_count; });
            result.number_of_episodes = totalEpisodes;
        }
        // Добавляем людей (актёры/съёмочная группа)
        if(elem.staff_obj) {
            var castArr = [], crewArr = [];
            (elem.staff_obj || []).forEach(function(person){
                var pObj = convertPerson(person);
                if(person.professionKey === 'ACTOR') castArr.push(pObj);
                else crewArr.push(pObj);
            });
            result.persons = { cast: castArr, crew: crewArr };
        }
        // Коллекция (сиквелы/приквелы)
        if(elem.sequels_obj) {
            var sequels = elem.sequels_obj.items || elem.sequels_obj;  // на случай если напрямую массив
            result.collection = { results: (sequels || []).map(convertElem) };
        }
        // Похожие
        if(elem.similars_obj) {
            var similars = elem.similars_obj.items || elem.similars_obj;
            result.simular = { results: (similars || []).map(convertElem) };
        }
        return result;
    }

    // Функция для получения актёрского состава через TMDB (fallback)
    function fetchTmdbCredits(film, callback) {
        // film – объект с данными Kinopoisk (как приходит из API, не конвертированный)
        var type = (!film.type || film.type === 'FILM' || film.type === 'VIDEO') ? 'movie' : 'tv';
        var imdbId = film.imdbId || film.imdb_id || '';  // IMDb ID, если есть
        var titleQuery = film.nameOriginal || film.nameEn || film.nameRu || '';
        var year = '';
        if(type === 'movie') {
            year = film.year ? String(film.year) : '';
        } else {
            // для сериалов берем год начала
            if(film.startYear) year = String(film.startYear);
            else if(film.year) year = String(film.year);
        }
        titleQuery = titleQuery.trim();
        // Функция завершения: возвращает массив staff (может быть пустым)
        function finish(staffList) {
            callback(staffList || []);
        }
        // Приоритет: если есть IMDb – ищем через него (точное соответствие)
        if(imdbId) {
            var findUrl = 'https://api.themoviedb.org/3/find/' + encodeURIComponent(imdbId) + '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id';
            network2.timeout(10000);
            network2.silent(findUrl, function(json){
                var tmdbId = null, mediaType = type;
                if(json.movie_results && json.movie_results.length > 0) {
                    tmdbId = json.movie_results[0].id;
                    mediaType = 'movie';
                } else if(json.tv_results && json.tv_results.length > 0) {
                    tmdbId = json.tv_results[0].id;
                    mediaType = 'tv';
                }
                if(tmdbId) {
                    var creditsUrl = 'https://api.themoviedb.org/3/' + mediaType + '/' + tmdbId + '/credits?api_key=' + TMDB_API_KEY;
                    network2.silent(creditsUrl, function(cred){
                        var staffList = [];
                        // актёрский состав
                        if(cred.cast) {
                            cred.cast.slice(0, 20).forEach(function(c){  // ограничимся 20 актёрами
                                staffList.push({
                                    staffId: 'tmdb_' + (c.id || ''),
                                    nameRu: '', 
                                    nameEn: c.name || '',
                                    posterUrl: c.profile_path ? ('https://image.tmdb.org/t/p/w500' + c.profile_path) : '',
                                    professionKey: 'ACTOR',
                                    description: c.character || ''
                                });
                            });
                        }
                        // основные члены съёмочной группы
                        if(cred.crew) {
                            var director = cred.crew.find(c => c.job === 'Director');
                            var writer = cred.crew.find(c => c.job && (c.job.includes('Writer') || c.job.includes('Screenplay')));
                            var producer = cred.crew.find(c => c.job === 'Producer');
                            [director, writer, producer].forEach(function(person){
                                if(person) {
                                    var profKey = 'CREW';
                                    if(person.job.includes('Director')) profKey = 'DIRECTOR';
                                    else if(person.job.includes('Writer') || person.job.includes('Screenplay')) profKey = 'WRITER';
                                    else if(person.job.includes('Producer')) profKey = 'PRODUCER';
                                    staffList.push({
                                        staffId: 'tmdb_' + (person.id || ''),
                                        nameRu: '',
                                        nameEn: person.name || '',
                                        posterUrl: person.profile_path ? ('https://image.tmdb.org/t/p/w500' + person.profile_path) : '',
                                        professionKey: profKey,
                                        description: ''  // для crew нет роли
                                    });
                                }
                            });
                        }
                        finish(staffList);
                    }, function(){ finish(null); });
                } else {
                    finish(null);
                }
            }, function(){ finish(null); });
        } else {
            // Если IMDb ID нет – поиск по названию и году
            var searchUrl;
            if(type === 'movie') {
                searchUrl = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(titleQuery);
                if(year) searchUrl += '&year=' + encodeURIComponent(year);
            } else {
                searchUrl = 'https://api.themoviedb.org/3/search/tv?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(titleQuery);
                if(year) searchUrl += '&first_air_date_year=' + encodeURIComponent(year);
            }
            network2.timeout(10000);
            network2.silent(searchUrl, function(json){
                if(json.results && json.results.length > 0) {
                    var item = json.results[0];  // берем первый результат
                    var tmdbId = item.id;
                    var mediaType = (type === 'movie') ? 'movie' : 'tv';
                    var creditsUrl = 'https://api.themoviedb.org/3/' + mediaType + '/' + tmdbId + '/credits?api_key=' + TMDB_API_KEY;
                    network2.silent(creditsUrl, function(cred){
                        var staffList = [];
                        if(cred.cast) {
                            cred.cast.slice(0, 20).forEach(function(c){
                                staffList.push({
                                    staffId: 'tmdb_' + (c.id || ''),
                                    nameRu: '',
                                    nameEn: c.name || '',
                                    posterUrl: c.profile_path ? ('https://image.tmdb.org/t/p/w500' + c.profile_path) : '',
                                    professionKey: 'ACTOR',
                                    description: c.character || ''
                                });
                            });
                        }
                        if(cred.crew) {
                            var director = cred.crew.find(c => c.job === 'Director');
                            var writer = cred.crew.find(c => c.job && (c.job.includes('Writer') || c.job.includes('Screenplay')));
                            var producer = cred.crew.find(c => c.job === 'Producer');
                            [director, writer, producer].forEach(function(person){
                                if(person) {
                                    var profKey = 'CREW';
                                    if(person.job.includes('Director')) profKey = 'DIRECTOR';
                                    else if(person.job.includes('Writer') || person.job.includes('Screenplay')) profKey = 'WRITER';
                                    else if(person.job.includes('Producer')) profKey = 'PRODUCER';
                                    staffList.push({
                                        staffId: 'tmdb_' + (person.id || ''),
                                        nameRu: '',
                                        nameEn: person.name || '',
                                        posterUrl: person.profile_path ? ('https://image.tmdb.org/t/p/w500' + person.profile_path) : '',
                                        professionKey: profKey,
                                        description: ''
                                    });
                                }
                            });
                        }
                        finish(staffList);
                    }, function(){ finish(null); });
                } else {
                    finish(null);
                }
            }, function(){ finish(null); });
        }
    }

    // Функция получения полной информации о фильме по Kinopoisk ID (с учётом fallback)
    function _getById(id, params, oncomplete, onerror) {
        // Сначала загрузим справочники жанров/стран, если ещё не загружены (метод menu)
        menu({}, function(){
            var cacheKey = 'api/v2.2/films/' + id;
            var cachedFilm = getCache(cacheKey);
            if(cachedFilm) {
                // Если есть в кэше – сразу возвращаем сконвертированный объект
                oncomplete( convertElem(cachedFilm) );
            } else {
                // Иначе запрашиваем фильм
                get('api/v2.2/films/' + id, function(film){
                    if(film && film.kinopoiskId) {
                        // Если успешно получили фильм с Кинопоиска
                        var isTV = (film.type && film.type !== 'FILM' && film.type !== 'VIDEO');
                        // Последовательно подгружаем доп. данные (сезоны, дистрибуция, актёры, сиквелы, похожие)
                        getCompliteIf(isTV, 'api/v2.2/films/' + id + '/seasons', function(seasons){
                            if(seasons) film.seasons_obj = seasons;
                            getComplite('api/v2.2/films/' + id + '/distributions', function(distributions){
                                if(distributions) film.distributions_obj = distributions;
                                // Запрашиваем актёров/персонал
                                getComplite('/api/v1/staff?filmId=' + id, function(staff){
                                    if(staff && Array.isArray(staff) && staff.length > 0) {
                                        // Kinopoisk вернул актёров – используем их
                                        film.staff_obj = staff;
                                        proceedNext();
                                    } else {
                                        // Если не вернул – fallback на TMDB
                                        fetchTmdbCredits(film, function(fallbackStaff){
                                            film.staff_obj = fallbackStaff || [];  // может быть пустой массив
                                            proceedNext();
                                        });
                                    }
                                });
                                // функция для завершающих шагов (сиквелы/похожие)
                                function proceedNext() {
                                    getComplite('api/v2.1/films/' + id + '/sequels_and_prequels', function(sequels){
                                        if(sequels) film.sequels_obj = sequels;
                                        getComplite('api/v2.2/films/' + id + '/similars', function(similars){
                                            if(similars) film.similars_obj = similars;
                                            // Сохранить в кэш
                                            setCache(cacheKey, film);
                                            // Конвертировать и вернуть результат
                                            oncomplete( convertElem(film) );
                                        });
                                    });
                                }
                            });
                        });
                    } else {
                        onerror();  // фильм не найден по ID
                    }
                }, onerror);
            }
        });
    }
    // Обёртка для _getById
    function getById(id, params, oncomplete, onerror) {
        params = params || {};
        _getById(id, params, oncomplete, onerror);
    }

    // Реализация функции полного вывода (для Lampa): собирает секции карточки
    function full(params, oncomplete, onerror) {
        params = params || {};
        var card = params.card || {};
        // Извлекаем Kinopoisk ID из карточки или параметров
        var kpId = 0;
        if(card.kinopoisk_id) {
            kpId = parseInt(card.kinopoisk_id);
        } else if(card.id && typeof card.id === 'string' && card.id.startsWith('KP_')) {
            kpId = parseInt(card.id.split('_')[1]);
        } else if(params.id) {
            kpId = parseInt(params.id);
        }
        if(kpId) {
            getById(kpId, params, function(data){
                // Используем Lampa.Status для параллельной загрузки секций
                var status = new Lampa.Status(4);
                status.onComplite = oncomplete;
                status.append('movie', data);
                status.append('persons', data && data.persons);
                status.append('collection', data && data.collection);
                status.append('simular', data && data.simular);
            }, onerror);
        } else {
            onerror();
        }
    }

    // Функция поиска (по названию) – Kinopoisk API
    function search(params, oncomplete, onerror) {
        params = params || {};
        var query = decodeURIComponent(params.query || '').trim();
        var status = new Lampa.Status(1);
        status.onComplite = function(data){
            var items = [];
            if(data.query && data.query.results) {
                // Фильтрация результатов: оставляем только наиболее релевантные по названию
                var results = data.query.results;
                if(query) {
                    var filtered = results.filter(function(elem){
                        return containsTitle(elem.title, query) || containsTitle(elem.original_title, query);
                    });
                    if(filtered.length > 0 && filtered.length < results.length) {
                        results = filtered;
                        data.query.more = true;
                    }
                }
                // Разбиваем на группы фильмов и сериалов
                var movies = Object.assign({}, data.query);
                movies.results = results.filter(elem => elem.type === 'movie');
                movies.title = Lampa.Lang.translate('menu_movies');
                movies.type = 'movie';
                if(movies.results.length) items.push(movies);
                var tv = Object.assign({}, data.query);
                tv.results = results.filter(elem => elem.type === 'tv');
                tv.title = Lampa.Lang.translate('menu_tv');
                tv.type = 'tv';
                if(tv.results.length) items.push(tv);
            }
            oncomplete(items);
        };
        // Выполняем поиск по ключевому слову
        var method = 'api/v2.1/films/search-by-keyword';
        // Очищаем запрос от лишних символов (как делает kpCleanTitle)
        if(params.query) {
            var clean_query = kpCleanTitle(decodeURIComponent(params.query));
            params.query = encodeURIComponent(clean_query);
        }
        getList(method, params, function(json){
            status.append('query', json);
        }, status.error.bind(status));
    }

    // Получение списков (популярное, категории и пр.)
    function getList(method, params, oncomplete, onerror) {
        params = params || {};
        var url = method;
        if(params.query) {
            // добавляем параметр keyword для поиска (если не добавлено ранее)
            if(url.indexOf('keyword=') === -1) {
                var clean_title = kpCleanTitle(decodeURIComponent(params.query));
                url = Lampa.Utils.addUrlComponent(url, 'keyword=' + encodeURIComponent(clean_title));
            }
        }
        var page = params.page || 1;
        url = Lampa.Utils.addUrlComponent(url, 'page=' + page);
        getFromCache(url, function(json, cached){
            var items = [];
            if(json) {
                if(json.items && json.items.length) items = json.items;
                else if(json.films && json.films.length) items = json.films;
                else if(json.releases && json.releases.length) items = json.releases;
            }
            if(!cached && json && items.length) setCache(url, json);
            var results = items.map(convertElem).filter(elem => !elem.adult);
            var total_pages = json ? (json.pagesCount || json.totalPages || 1) : 1;
            oncomplete({
                results: results,
                url: method,
                page: page,
                total_pages: total_pages,
                total_results: 0,
                more: total_pages > page
            });
        }, onerror);
    }

    function list(params, oncomplete, onerror) {
        params = params || {};
        var method = params.url;
        if(!method && params.genres) {
            method = 'api/v2.2/films?order=NUM_VOTE&genres=' + params.genres;
        }
        getList(method, params, oncomplete, onerror);
    }
    function category(params, oncomplete, onerror) {
        // обрабатываем как list
        list(params, oncomplete, onerror);
    }

    // "Discovery" – главная страница источника KP (подборки)
    function main(params, oncomplete, onerror) {
        params = params || {};
        var parts = [
            // секции с подборками
            function(cb){ getList('api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', params, function(json){ json.title = 'Сейчас смотрят фильмы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films/collections?type=POPULAR_SERIES', params, function(json){ json.title = 'Сейчас смотрят сериалы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films/collections?type=TOP_250_MOVIES', params, function(json){ json.title = 'Топ фильмы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films/collections?type=TOP_250_TV_SHOWS', params, function(json){ json.title = 'Топ сериалы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=FILM', params, function(json){ json.title = 'Популярные фильмы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=TV_SERIES', params, function(json){ json.title = 'Популярные сериалы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=MINI_SERIES', params, function(json){ json.title = 'Популярные мини-сериалы'; cb(json); }, cb); },
            function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=TV_SHOW', params, function(json){ json.title = 'Популярные телешоу'; cb(json); }, cb); }
        ];
        // Дополнительная секция: популярные фильмы (Россия) – если в фильтрах есть ID страны "Россия"
        menu({}, function(){
            var rus_id = countries_map['Россия'];
            if(rus_id) {
                parts.splice(5, 0, function(cb){
                    getList('api/v2.2/films?order=NUM_VOTE&country=' + rus_id + '&type=FILM', params, function(json){
                        json.title = 'Популярные фильмы (Россия)'; cb(json);
                    }, cb);
                });
            }
            Lampa.Api.partNext(parts, 5, oncomplete, onerror);
        });
    }
    function discovery() {
        return {
            title: SOURCE_TITLE,
            search: search,
            params: { align_left: true, object: { source: SOURCE_NAME } },
            onMore: function(params) {
                // при нажатии "Еще" в поиске открываем полный список результатов
                Lampa.Activity.push({
                    url: 'api/v2.1/films/search-by-keyword',
                    title: Lampa.Lang.translate('search') + ' - ' + params.query,
                    component: 'category_full',
                    page: 1,
                    query: encodeURIComponent(params.query),
                    source: SOURCE_NAME
                });
            },
            onCancel: network.clear.bind(network)
        };
    }

    // Функция для отображения страницы персоны (актёра/режиссёра) – использует API Kinopoisk
    function person(params, oncomplete, onerror) {
        params = params || {};
        // Если ID персоны начинается с "tmdb_", значит это персона из fallback (TMDB), для которой у нас нет данных Kinopoisk.
        // В этом случае вернём пустой результат (или можно было бы реализовать отдельный запрос к TMDB для данных персоны).
        if(params.id && typeof params.id === 'string' && params.id.startsWith('tmdb_')) {
            oncomplete({ person: {}, credits: { knownFor: [] } });
            return;
        }
        var status = new Lampa.Status(1);
        status.onComplite = function(data){
            var result = {};
            if(data.query) {
                var p = data.query;
                result.person = {
                    id: p.personId,
                    name: p.nameRu || p.nameEn || '',
                    url: '',
                    img: p.posterUrl || '',
                    gender: p.sex === 'MALE' ? 2 : p.sex === 'FEMALE' ? 1 : 0,
                    birthday: p.birthday,
                    place_of_birth: p.birthplace,
                    deathday: p.death,
                    place_of_death: p.deathplace,
                    known_for_department: p.profession || '',
                    biography: (p.facts || []).join(' ')
                };
                // Собираем фильмографию (из того же ответа staff/{personId})
                var director_films = [], actor_films = [];
                var director_map = {}, actor_map = {};
                if(p.films) {
                    p.films.forEach(function(f){
                        if(f.professionKey === 'DIRECTOR' && !director_map[f.filmId]) {
                            director_map[f.filmId] = true;
                            director_films.push( convertElem(f) );
                        } else if(f.professionKey === 'ACTOR' && !actor_map[f.filmId]) {
                            actor_map[f.filmId] = true;
                            actor_films.push( convertElem(f) );
                        }
                    });
                }
                // Сортируем и формируем известные работы
                var knownFor = [];
                if(director_films.length) {
                    director_films.sort((a,b) => (b.vote_average - a.vote_average) || (a.id.localeCompare(b.id)));
                    knownFor.push({ name: Lampa.Lang.translate('title_producer'), credits: director_films });
                }
                if(actor_films.length) {
                    actor_films.sort((a,b) => (b.vote_average - a.vote_average) || (a.id.localeCompare(b.id)));
                    knownFor.push({ name: Lampa.Lang.translate(p.sex === 'FEMALE' ? 'title_actress' : 'title_actor'), credits: actor_films });
                }
                result.credits = { knownFor: knownFor };
            }
            oncomplete(result);
        };
        var personId = params.id;
        getFromCache('api/v1/staff/' + personId, function(json, cached){
            if(!cached && json && json.personId) setCache('api/v1/staff/' + personId, json);
            status.append('query', json);
        }, status.error.bind(status));
    }

    // Загрузка меню жанров/стран (для фильтрации и отображения категорий)
    function menu(params, oncomplete) {
        if(menu_list.length) {
            oncomplete(menu_list);
        } else {
            get('api/v2.2/films/filters', function(data){
                if(data.genres) {
                    data.genres.forEach(function(g){
                        menu_list.push({
                            id: g.id,
                            title: g.genre,
                            url: '',
                            hide: (g.genre === 'для взрослых'),
                            separator: !g.genre
                        });
                        genres_map[g.genre] = g.id;
                    });
                }
                if(data.countries) {
                    data.countries.forEach(function(c){
                        countries_map[c.country] = c.id;
                    });
                }
                oncomplete(menu_list);
            }, function(){ oncomplete([]); });
        }
    }
    function menuCategory(params, oncomplete) {
        // Не используется, оставляем пустым
        oncomplete([]);
    }
    function seasons(tv, from, oncomplete) {
        var status = new Lampa.Status(from.length);
        status.onComplite = oncomplete;
        from.forEach(function(season){
            var seasonsList = tv.seasons || [];
            var found = seasonsList.filter(s => s.season_number === season);
            if(found.length) status.append(String(season), found[0]);
            else status.error();
        });
    }

    // Формируем объект источника и регистрируем его в Lampa
    var KP = {
        SOURCE_NAME: SOURCE_NAME,
        SOURCE_TITLE: SOURCE_TITLE,
        main: main,
        menu: menu,
        full: full,
        list: list,
        category: category,
        clear: clear,
        person: person,
        seasons: seasons,
        menuCategory: menuCategory,
        discovery: discovery
    };
    function startPlugin() {
        window.kp_source_plugin = true;
        function addPlugin() {
            if(Lampa.Api.sources[SOURCE_NAME]) {
                Lampa.Noty.show('Установлен плагин, несовместимый с kp_source');
                return;
            }
            Lampa.Api.sources[SOURCE_NAME] = KP;
            Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: () => KP });
            // Добавляем источник в список источников Lampa
            var sources = (Lampa.Params.values && Lampa.Params.values.source) 
                          ? Object.assign({}, Lampa.Params.values.source)
                          : {};
            // Берём уже существующие источники (tmdb, cub и т.д.)
            ['tmdb','cub','pub','filmix'].forEach(name => {
                if(Lampa.Api.sources[name]) sources[name] = name.toUpperCase();
            });
            sources[SOURCE_NAME] = SOURCE_TITLE;
            Lampa.Params.select('source', sources, 'tmdb');  // по умолчанию остаётся TMDB, пользователь может переключиться на KP
        }
        if(window.appready) addPlugin();
        else {
            Lampa.Listener.follow('app', function(e){
                if(e.type === 'ready') addPlugin();
            });
        }
    }
    if(!window.kp_source_plugin) {
        startPlugin();
    }
})();

