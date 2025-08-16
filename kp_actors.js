/**
 * KP Source (hybrid) — fixed
 * Исправлено: добавлена обёртка getFromCache, подчистка кэша, мелкие правки.
 * Берёт фильм/сериал с Kinopoisk (unofficial API), staff — с KP,
 * если staff пуст — подхватывает актёров с TMDB.
 */

(function(){
  'use strict';

  /* === Ключи === */
  var KP_API_URL = 'https://kinopoiskapiunofficial.tech/';
  var KP_API_KEY = 'dc9196ea-4cc8-48e8-8259-0cbdfa58eaf1'; // твой ключ KPU
  var TMDB_API_KEY = 'f090bb54758cabf231fb605d3e3e0468';   // можно заменить своим

  var SOURCE_NAME = 'KP';
  var SOURCE_TITLE = 'KP';

  var network  = new Lampa.Reguest();
  var network2 = new Lampa.Reguest();

  /* === простой in-memory кэш === */
  var CACHE = Object.create(null);
  var CACHE_TIME = 60 * 60 * 1000;   // 1 час
  var CACHE_MAX = 100;

  function getCache(key){
    var node = CACHE[key];
    if (!node) return null;
    if (Date.now() - node.t > CACHE_TIME) { delete CACHE[key]; return null; }
    return node.v;
  }
  function setCache(key, val){
    // сборка мусора
    var keys = Object.keys(CACHE);
    if (keys.length >= CACHE_MAX){
      var cutoff = Date.now() - CACHE_TIME;
      keys.forEach(function(k){ if (CACHE[k].t < cutoff) delete CACHE[k]; });
    }
    CACHE[key] = { t: Date.now(), v: val };
  }
  // >>> ИСПРАВЛЕНИЕ: отсутствовала функция <<<
  function getFromCache(url, oncomplete, onerror){
    var cached = getCache(url);
    if (cached){ oncomplete(cached, true); return; }
    get(url, function(json){ oncomplete(json, false); }, onerror);
  }

  /* === базовые запросы к KP === */
  var total_cnt=0, proxy_cnt=0, good_cnt=0;
  function get(method, done, fail){
    var use_proxy = total_cnt >= 10 && good_cnt > total_cnt/2;
    if(!use_proxy) total_cnt++;
    var cors = 'https://cors.kp556.workers.dev:8443/';
    var url = KP_API_URL + method;

    network.timeout(15000);
    network.silent((use_proxy?cors:'') + url, function(j){ done(j); }, function(a){
      // повтор через прокси при 429/сетевых
      var can_proxy = !use_proxy && (proxy_cnt < 10 || good_cnt > proxy_cnt/2);
      if (can_proxy && (a.status===429 || (a.status===0 && a.statusText!=='timeout'))){
        proxy_cnt++;
        network.timeout(15000);
        network.silent(cors + url, function(j){ good_cnt++; done(j); }, fail,
          false, {headers:{'X-API-KEY':KP_API_KEY}});
      } else fail(a);
    }, false, {headers:{'X-API-KEY':KP_API_KEY}});
  }
  function getComplite(method, done){ get(method, done, function(){ done(null); }); }
  function getCompliteIf(cond, method, done){ if(cond) getComplite(method, done); else setTimeout(function(){done(null);},10); }

  /* === утилиты === */
  function cleanTitle(s){ return (s||'').replace(/[\s.,:;’'`!?]+/g,' ').trim(); }
  function normalizeTitle(s){ return cleanTitle(String(s).toLowerCase().replace(/ё/g,'е')); }
  function containsTitle(a,b){ return normalizeTitle(a).indexOf(normalizeTitle(b))!==-1; }

  /* === конвертация персон === */
  function convertPerson(p){
    return {
      id: p.staffId,
      name: p.nameRu || p.nameEn || '',
      url: '',
      img: p.posterUrl || '',
      character: p.description || '',
      job: Lampa.Utils.capitalizeFirstLetter((p.professionKey||'').toLowerCase())
    };
  }

  /* === fallback: TMDB credits === */
  function fetchTmdbCredits(film, cb){
    var type = (!film.type || film.type==='FILM' || film.type==='VIDEO') ? 'movie' : 'tv';
    var imdb = film.imdbId || film.imdb_id || '';
    var title = film.nameOriginal || film.nameEn || film.nameRu || '';
    var year = type==='movie' ? (film.year||'') : (film.startYear||film.year||'');

    function finish(list){ cb(list||[]); }

    function mapCredits(cred){
      var list = [];
      if(cred.cast){
        cred.cast.slice(0,20).forEach(function(c){
          list.push({
            staffId: 'tmdb_'+(c.id||''),
            nameRu: '', nameEn: c.name||'',
            posterUrl: c.profile_path ? ('https://image.tmdb.org/t/p/w500'+c.profile_path) : '',
            professionKey: 'ACTOR',
            description: c.character||''
          });
        });
      }
      if(cred.crew){
        var director = cred.crew.find(function(x){return x.job==='Director';});
        [director].forEach(function(p){
          if(p){
            list.push({
              staffId: 'tmdb_'+(p.id||''),
              nameRu:'', nameEn:p.name||'',
              posterUrl: p.profile_path ? ('https://image.tmdb.org/t/p/w500'+p.profile_path) : '',
              professionKey:'DIRECTOR',
              description:''
            });
          }
        });
      }
      return list;
    }

    if(imdb){
      var find = 'https://api.themoviedb.org/3/find/'+encodeURIComponent(imdb)+'?api_key='+TMDB_API_KEY+'&external_source=imdb_id';
      network2.timeout(10000);
      network2.silent(find, function(j){
        var id=null, media=type;
        if(j.movie_results && j.movie_results.length){ id=j.movie_results[0].id; media='movie'; }
        else if(j.tv_results && j.tv_results.length){ id=j.tv_results[0].id; media='tv'; }
        if(!id) return finish([]);
        var cr='https://api.themoviedb.org/3/'+media+'/'+id+'/credits?api_key='+TMDB_API_KEY;
        network2.silent(cr, function(cred){ finish(mapCredits(cred)); }, function(){ finish([]); });
      }, function(){ finish([]); });
    } else {
      var search = type==='movie'
        ? 'https://api.themoviedb.org/3/search/movie?api_key='+TMDB_API_KEY+'&query='+encodeURIComponent(title)+(year?('&year='+year):'')
        : 'https://api.themoviedb.org/3/search/tv?api_key='+TMDB_API_KEY+'&query='+encodeURIComponent(title)+(year?('&first_air_date_year='+year):'');
      network2.timeout(10000);
      network2.silent(search, function(j){
        if(!(j.results&&j.results.length)) return finish([]);
        var id=j.results[0].id, media=(type==='movie'?'movie':'tv');
        var cr='https://api.themoviedb.org/3/'+media+'/'+id+'/credits?api_key='+TMDB_API_KEY;
        network2.silent(cr, function(cred){ finish(mapCredits(cred)); }, function(){ finish([]); });
      }, function(){ finish([]); });
    }
  }

  /* === конвертация карточки === */
  function convertElem(elem){
    var type = (!elem.type || elem.type==='FILM' || elem.type==='VIDEO') ? 'movie' : 'tv';
    var kpId = elem.kinopoiskId || elem.filmId || 0;
    var title = elem.nameRu || elem.nameEn || elem.nameOriginal || '';
    var original = elem.nameOriginal || elem.nameEn || elem.nameRu || '';
    var kp_rating = Number(elem.rating || elem.ratingKinopoisk || 0);

    var res = {
      source: SOURCE_NAME,
      type: type,
      adult: false,
      id: SOURCE_NAME + '_' + kpId,
      title: title,
      original_title: original,
      overview: elem.description || elem.shortDescription || '',
      img: elem.posterUrlPreview || elem.posterUrl || '',
      background_image: elem.coverUrl || elem.posterUrl || elem.posterUrlPreview || '',
      genres: (elem.genres||[]).map(function(g){ return {id:0,name:g.genre,url:''}; }),
      production_companies: [],
      production_countries: (elem.countries||[]).map(function(c){ return {name:c.country}; }),
      vote_average: kp_rating,
      vote_count: Number(elem.ratingVoteCount || elem.ratingKinopoiskVoteCount || 0),
      kinopoisk_id: kpId,
      kp_rating: kp_rating,
      imdb_id: elem.imdbId || '',
      imdb_rating: Number(elem.ratingImdb || 0)
    };

    var first = (elem.year && elem.year!=='null') ? String(elem.year) : '';
    if(type==='tv'){
      if(elem.startYear && elem.startYear!=='null') first=String(elem.startYear);
      res.first_air_date = first;
      if(elem.endYear && elem.endYear!=='null') res.last_air_date = String(elem.endYear);
      res.name = title; res.original_name = original;
    } else {
      res.release_date = first;
    }

    if(elem.staff_obj){
      var cast=[], crew=[];
      (elem.staff_obj||[]).forEach(function(p){
        var o=convertPerson(p);
        if(p.professionKey==='ACTOR') cast.push(o); else crew.push(o);
      });
      res.persons = {cast:cast, crew:crew};
    }

    if(elem.sequels_obj){
      var s = elem.sequels_obj.items || elem.sequels_obj;
      res.collection = { results: (s||[]).map(convertElem) };
    }
    if(elem.similars_obj){
      var si = elem.similars_obj.items || elem.similars_obj;
      res.simular = { results: (si||[]).map(convertElem) };
    }

    return res;
  }

  /* === полная карточка по kpId с fallback на TMDB для актёров === */
  function _getById(id, params, done, fail){
    var cacheKey = 'api/v2.2/films/' + id;

    var cached = getCache(cacheKey);
    if (cached) return done(convertElem(cached));

    get('api/v2.2/films/' + id, function(film){
      if(!(film && film.kinopoiskId)) return fail && fail();

      var isTV = film.type && film.type!=='FILM' && film.type!=='VIDEO';

      getCompliteIf(isTV, 'api/v2.2/films/' + id + '/seasons', function(seasons){
        if(seasons) film.seasons_obj = seasons;

        getComplite('api/v2.2/films/' + id + '/distributions', function(dist){
          if(dist) film.distributions_obj = dist;

          // staff c KP
          getComplite('/api/v1/staff?filmId=' + id, function(staff){
            function afterStaff(){
              getComplite('api/v2.1/films/' + id + '/sequels_and_prequels', function(sequels){
                if(sequels) film.sequels_obj = sequels;
                getComplite('api/v2.2/films/' + id + '/similars', function(sim){
                  if(sim) film.similars_obj = sim;
                  setCache(cacheKey, film);
                  done(convertElem(film));
                });
              });
            }
            if(staff && staff.length){
              film.staff_obj = staff;
              afterStaff();
            } else {
              // fallback TMDB
              fetchTmdbCredits(film, function(list){
                film.staff_obj = list || [];
                afterStaff();
              });
            }
          });
        });
      });
    }, fail);
  }
  function getById(id, params, done, fail){ _getById(id, params||{}, done, fail); }

  /* === секции карточки === */
  function full(params, done, fail){
    params = params || {};
    var card = params.card || {};
    var kpId = 0;
    if(card.kinopoisk_id) kpId = parseInt(card.kinopoisk_id);
    else if(card.id && typeof card.id==='string' && card.id.indexOf('KP_')===0) kpId = parseInt(card.id.split('_')[1]);
    else if(params.id) kpId = parseInt(params.id);

    if(!kpId) return fail && fail();

    getById(kpId, params, function(data){
      var st = new Lampa.Status(4);
      st.onComplite = done;
      st.append('movie', data);
      st.append('persons', data && data.persons);
      st.append('collection', data && data.collection);
      st.append('simular', data && data.simular);
    }, fail);
  }

  /* === списки/категории/поиск === */
  function kpCleanTitle(s){ return cleanTitle(decodeURIComponent(s||'')); }

  function getList(method, params, done, fail){
    params = params || {};
    var url = method;
    if(params.query){
      if(url.indexOf('keyword=')===-1){
        url = Lampa.Utils.addUrlComponent(url, 'keyword=' + encodeURIComponent(kpCleanTitle(params.query)));
      }
    }
    var page = params.page || 1;
    url = Lampa.Utils.addUrlComponent(url, 'page=' + page);

    getFromCache(url, function(json, cached){
      var items = [];
      if(json){
        if(json.items && json.items.length) items = json.items;
        else if(json.films && json.films.length) items = json.films;
        else if(json.releases && json.releases.length) items = json.releases;
      }
      if(!cached && json && items.length) setCache(url, json);

      var results = items.map(convertElem).filter(function(e){return !e.adult;});
      var total_pages = json ? (json.pagesCount || json.totalPages || 1) : 1;

      done({
        results: results,
        url: method,
        page: page,
        total_pages: total_pages,
        total_results: 0,
        more: total_pages > page
      });
    }, fail);
  }

  function list(params, done, fail){ getList(params.url, params, done, fail); }
  function category(params, done, fail){ list(params, done, fail); }

  function main(params, done, fail){
    var parts = [
      function(cb){ getList('api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', params, function(j){ j.title='Сейчас смотрят фильмы'; cb(j); }, cb); },
      function(cb){ getList('api/v2.2/films/collections?type=POPULAR_SERIES',    params, function(j){ j.title='Сейчас смотрят сериалы'; cb(j); }, cb); },
      function(cb){ getList('api/v2.2/films/collections?type=TOP_250_MOVIES',    params, function(j){ j.title='Топ фильмы'; cb(j); }, cb); },
      function(cb){ getList('api/v2.2/films/collections?type=TOP_250_TV_SHOWS',  params, function(j){ j.title='Топ сериалы'; cb(j); }, cb); },
      function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=FILM',           params, function(j){ j.title='Популярные фильмы'; cb(j); }, cb); },
      function(cb){ getList('api/v2.2/films?order=NUM_VOTE&type=TV_SERIES',      params, function(j){ j.title='Популярные сериалы'; cb(j); }, cb); }
    ];
    Lampa.Api.partNext(parts, 5, done, fail);
  }

  function search(params, done, fail){
    params = params || {};
    var query = decodeURIComponent(params.query||'').trim();
    var status = new Lampa.Status(1);
    status.onComplite = function(data){
      var items = [];
      if(data.query && data.query.results){
        var results = data.query.results;
        if(query){
          var filtered = results.filter(function(e){
            return containsTitle(e.title, query) || containsTitle(e.original_title, query);
          });
          if(filtered.length && filtered.length<results.length){
            results = filtered; data.query.more = true;
          }
        }
        var movies = Object.assign({}, data.query);
        movies.results = results.filter(function(e){return e.type==='movie';});
        movies.title = Lampa.Lang.translate('menu_movies');
        movies.type = 'movie';
        if(movies.results.length) items.push(movies);

        var tv = Object.assign({}, data.query);
        tv.results = results.filter(function(e){return e.type==='tv';});
        tv.title = Lampa.Lang.translate('menu_tv');
        tv.type = 'tv';
        if(tv.results.length) items.push(tv);
      }
      done(items);
    };
    var method = 'api/v2.1/films/search-by-keyword';
    if(params.query) params.query = encodeURIComponent(kpCleanTitle(params.query));
    getList(method, params, function(json){ status.append('query', json); }, status.error.bind(status));
  }

  function person(params, done){ done({ person:{}, credits:{knownFor:[]} }); }
  function seasons(tv, from, done){
    var st = new Lampa.Status(from.length); st.onComplite=done;
    from.forEach(function(n){
      var f = (tv.seasons||[]).find(function(s){return s.season_number===n;});
      if(f) st.append(String(n), f); else st.error();
    });
  }
  function menu(){ return []; }
  function menuCategory(_,cb){ cb([]); }
  function clear(){ network.clear(); network2.clear(); }

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
    discovery: function(){ return { title: SOURCE_TITLE, search: search, params:{align_left:true,object:{source:SOURCE_NAME}}, onMore:function(){}, onCancel: network.clear.bind(network) }; }
  };

  function start(){
    if (Lampa.Api.sources[SOURCE_NAME]) return;
    Lampa.Api.sources[SOURCE_NAME] = KP;
    Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, { get: () => KP });

    // подмешаем источник в список (не меняю по умолчанию)
    var sources = (Lampa.Params.values && Lampa.Params.values.source) ? Object.assign({}, Lampa.Params.values.source) : {};
    ['tmdb','cub','pub','filmix'].forEach(function(n){ if(Lampa.Api.sources[n]) sources[n]=n.toUpperCase(); });
    sources[SOURCE_NAME] = SOURCE_TITLE;
    Lampa.Params.select('source', sources, Lampa.Params.values && Lampa.Params.values.source_default || 'tmdb');
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function(e){ if(e.type==='ready') start(); });

})();


