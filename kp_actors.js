/**
 * Lampa plugin: KP Rating Overlay (TMDB UI + KP score)
 * Оставляет источник TMDB, но подменяет рейтинг на Кинопоиск.
 * Работает и для фильмов, и для сериалов.
 *
 * Что делает:
 * 1) На открытии карточки вытягиваю imdb_id (через TMDB external_ids).
 * 2) По imdb_id беру рейтинг КР из api.kinopoisk.dev (быстро и просто).
 *    Если imdb нет — ищу по названию+году.
 * 3) В UI убираю/подменяю чип TMDB и вставляю чип «КР <оценка>».
 *
 * Ключи: вписала твои (можешь заменить ниже при желании).
 */

(function () {
  'use strict';

  /* === КЛЮЧИ API === */
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // api.kinopoisk.dev (v1.4)
  // Если захочешь, добавлю fallback на kinopoiskapiunofficial, но для рейтинга достаточно DEV.

  /* === НАСТРОЙКИ === */
  var DEBUG = false;        // true — видеть подсказки в Noty
  var HIDE_TMDB = true;     // прятать чип TMDB (если в UI есть) — «вместо TMDB»

  var rq = new (window.Lampa && Lampa.Reguest ? Lampa.Reguest : XMLHttpRequest)();
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }

  /* ---------------- network helpers ---------------- */
  function fetchJSON(url, headers, cb, eb){
    if (rq.silent){ // Lampa.Reguest
      rq.timeout(12000);
      rq.silent(url, function(j){ cb(j); }, function(){ eb && eb(); }, false, {headers:headers||{}} );
      return;
    }
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    for (var k in (headers||{})) try{x.setRequestHeader(k, headers[k]);}catch(e){}
    x.onreadystatechange = function(){ if(x.readyState===4){ try{ cb(JSON.parse(x.responseText)); }catch(e){ eb&&eb(); } } };
    x.onerror = function(){ eb && eb(); };
    x.send();
  }

  /* ---------------- meta from Lampa ---------------- */
  function getActiveMeta(){
    var out = { type:'movie', tmdb_id:null, imdb_id:null, title:'', original:'', year:0 };
    try{
      var act = (Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active()) || null;
      if (act && act.activity){
        var card = act.activity.card || {};
        out.type    = card.type || (act.activity.params && (act.activity.params.method||act.activity.params.content_type)) || 'movie';
        out.tmdb_id = card.id || (act.activity.params && act.activity.params.id) || null;
        out.title   = card.name || card.title || '';
        out.original= card.original_name || card.original_title || '';
        var d = card.release_date || card.first_air_date || '';
        var m = d && d.match(/\b(19|20)\d{2}\b/);
        if(m) out.year = +m[0];
      }
    }catch(e){}
    if(!out.original) out.original = out.title;
    return out;
  }

  function tmdbExternalIds(meta, cb, eb){
    if(!meta.tmdb_id || !window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api!=='function'){ eb&&eb(); return; }
    Lampa.TMDB.api((meta.type||'movie') + '/' + meta.tmdb_id + '/external_ids', {}, function(j){
      cb(j||{});
    }, function(){ eb&&eb(); });
  }

  /* ---------------- Kinopoisk.dev rating ---------------- */
  function devByImdb(imdb, cb, eb){
    var url = 'https://api.kinopoisk.dev/v1.4/movie?externalId.imdb='
              + encodeURIComponent(imdb)
              + '&limit=1&selectFields=rating&selectFields=id&selectFields=kpId&selectFields=year';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY, 'accept':'application/json'}, function(j){
      var d = j && j.docs && j.docs[0];
      cb(d && d.rating && (d.rating.kp || d.rating.kp===0) ? +d.rating.kp : null);
    }, eb);
  }
  function devSearchRating(title, year, cb, eb){
    var url = 'https://api.kinopoisk.dev/v1.4/movie/search?query='
              + encodeURIComponent(title)
              + '&limit=10&selectFields=rating&selectFields=year&selectFields=name&selectFields=enName';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY, 'accept':'application/json'}, function(j){
      var list = (j && j.docs) || [];
      if(!list.length) return cb(null);
      var pick = null;
      if(year){
        pick = list.find(function(d){ return d.year===year && d.rating && d.rating.kp!=null; }) ||
               list.find(function(d){ return Math.abs((d.year||0)-year)<=1 && d.rating && d.rating.kp!=null; });
      }
      pick = pick || list.find(function(d){ return d.rating && d.rating.kp!=null; });
      cb(pick ? +pick.rating.kp : null);
    }, eb);
  }

  /* ---------------- inject UI ---------------- */
  function ensureCss(){
    if ($('#kp-rate-css')) return;
    var st = document.createElement('style');
    st.id = 'kp-rate-css';
    st.textContent =
      '.kp-rate-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;background:rgba(255,255,255,.08);margin-right:6px}' +
      '.kp-rate-num{font-weight:700;font-size:13px}' +
      '.kp-rate-lbl{font-size:12px;opacity:.7}';
    document.head.appendChild(st);
  }
  function findBadgesWrap(){
    // контейнер полоски рейтингов/бейджей в шапке карточки
    return $('.full-start__rate, .full-start-new__rate, .full-start__tags, .full-start-new__tags');
  }
  function findTmdbBadge(wrap){
    if(!wrap) return null;
    // Ищем элемент, где явно написано TMDB
    var nodes = wrap.querySelectorAll('*');
    for(var i=0;i<nodes.length;i++){
      var t = txt(nodes[i]).toUpperCase();
      if(/\bTMDB\b/.test(t)) return nodes[i].closest ? nodes[i] : null;
    }
    return null;
  }
  function findKpBadge(wrap){
    if(!wrap) return null;
    var nodes = wrap.querySelectorAll('*');
    for(var i=0;i<nodes.length;i++){
      var t = txt(nodes[i]).toUpperCase();
      if(/\bКР\b|\bKP\b/.test(t)) return nodes[i].closest ? nodes[i] : null;
    }
    return null;
  }
  function injectKpRating(kp){
    if(kp==null) return false;
    ensureCss();
    var wrap = findBadgesWrap();
    if(!wrap) return false;

    // 1) прячем TMDB чип (если просили) или переименовываем его
    var tmdb = findTmdbBadge(wrap);
    if (tmdb && HIDE_TMDB){
      tmdb.style.display = 'none';
    } else if (tmdb && !HIDE_TMDB){
      // Переименовать «TMDB» -> «КР» и поставить число
      tmdb.textContent = (kp.toFixed(1) + ' КР');
      return true;
    }

    // 2) если уже есть «КР» — обновлю число
    var exist = findKpBadge(wrap);
    if (exist){
      exist.textContent = (kp.toFixed(1) + ' КР');
      return true;
    }

    // 3) добавлю свой чип
    var chip = document.createElement('span');
    chip.className = 'kp-rate-chip';
    var num = document.createElement('span');
    num.className = 'kp-rate-num';
    num.textContent = kp.toFixed(1);
    var lbl = document.createElement('span');
    lbl.className = 'kp-rate-lbl';
    lbl.textContent = 'КР';
    chip.appendChild(num); chip.appendChild(lbl);

    wrap.insertBefore(chip, wrap.firstChild); // слева
    // Обновить раскладку, чтобы не было сдвигов/якорей
    try{
      if(Lampa.Controller && Lampa.Controller.update) Lampa.Controller.update();
      if(Lampa.Scroll && Lampa.Scroll.update) Lampa.Scroll.update();
      void document.body.offsetHeight; window.dispatchEvent(new Event('resize'));
    }catch(e){}
    return true;
  }

  /* ---------------- main flow ---------------- */
  var lastHandled = null; // чтобы не дергать одну и ту же карточку по несколько раз
  function run(){
    var meta = getActiveMeta();
    if(!meta || !meta.tmdb_id) return;
    var key = (meta.type||'movie') + ':' + meta.tmdb_id;
    if (lastHandled === key) return; // уже отработала на этой карточке
    lastHandled = key;

    noty('KP rating: ' + (meta.title || meta.tmdb_id));

    // 1) пробую взять imdb у TMDB
    tmdbExternalIds(meta, function(ids){
      var imdb = ids && (ids.imdb_id || ids.imdbId);
      if (imdb){
        noty('IMDb: ' + imdb);
        devByImdb(imdb, function(kp){
          if (kp!=null) injectKpRating(kp);
          else bySearch();
        }, bySearch);
      } else bySearch();
    }, bySearch);

    function bySearch(){
      var q = meta.original || meta.title || '';
      if(!q) return;
      devSearchRating(q, meta.year, function(kp){
        if (kp!=null) injectKpRating(kp);
      });
    }
  }

  /* ---------------- hook ---------------- */
  function onFull(e){
    if(!e || e.type!=='complite') return;
    setTimeout(run, 180); // даю дорисоваться DOM
  }
  function boot(){
    if(!window.Lampa || !Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull);
    return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();


