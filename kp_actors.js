/**
 * Lampa plugin — KP-as-main rating over TMDB (v1.0)
 * Оставляет источник TMDB, но заменяет основной рейтинг на рейтинг Кинопоиска.
 * Делает это на уровне данных (в ответе TMDB), а затем обновляет чип в UI.
 *
 * Как работает:
 * - перехватываю Lampa.TMDB.api для запросов 'movie/{id}' и 'tv/{id}'
 * - вытягиваю imdb_id через TMDB /external_ids
 * - по imdb_id беру rating.kp из api.kinopoisk.dev (второй вариант — поиск по названию+году)
 * - подкладываю kp в поле vote_average перед отдачей TMDB-ответа в Лампу
 * - после отрисовки карточки скрываю чип TMDB и вставляю чип «КР {оценка}»
 */

(function () {
  'use strict';

  /* === твой ключ api.kinopoisk.dev (v1.4) === */
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';

  /* === опции === */
  var DEBUG = false;      // true — покажу шаги в Noty
  var HIDE_TMDB = true;   // спрятать все TMDB-чипы в полоске рейтингов

  // --- утилиты ---
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }

  var rq = new (window.Lampa && Lampa.Reguest ? Lampa.Reguest : XMLHttpRequest)();

  function fetchJSON(url, headers, cb, eb){
    if (rq.silent){ rq.timeout(12000); rq.silent(url, function(j){ cb(j); }, function(){ eb&&eb(); }, false, {headers:headers||{}} ); return; }
    var x=new XMLHttpRequest(); x.open('GET',url,true);
    for(var k in (headers||{})) try{x.setRequestHeader(k, headers[k]);}catch(e){}
    x.onreadystatechange=function(){ if(x.readyState===4){ try{ cb(JSON.parse(x.responseText)); }catch(e){ eb&&eb(); } } };
    x.onerror=function(){ eb&&eb(); }; x.send();
  }

  // --- кеши, чтобы не дёргать API лишний раз ---
  var kpByImdb = Object.create(null);     // imdb -> kp
  var kpByTmdb  = Object.create(null);    // (type:id) -> kp

  function getActiveMeta(){
    var o={type:'movie', tmdb_id:null, title:'', original:'', year:0};
    try{
      var act=Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      if(act && act.activity){
        var c=act.activity.card||{};
        o.type=c.type || (act.activity.params&&(act.activity.params.method||act.activity.params.content_type)) || 'movie';
        o.tmdb_id=c.id || (act.activity.params && act.activity.params.id) || null;
        o.title=c.name||c.title||''; o.original=c.original_name||c.original_title||'';
        var d=c.release_date||c.first_air_date||''; var m=d&&d.match(/\b(19|20)\d{2}\b/); if(m) o.year=+m[0];
      }
    }catch(e){}
    if(!o.original) o.original=o.title;
    return o;
  }

  // ---------- Kinopoisk.dev rating ----------
  function devByImdb(imdb, cb, eb){
    if (kpByImdb[imdb]!=null) return cb(kpByImdb[imdb]);
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.imdb='
              + encodeURIComponent(imdb)
              + '&limit=1&selectFields=rating';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var d=j&&j.docs&&j.docs[0];
      var val = (d&&d.rating&&d.rating.kp!=null) ? +d.rating.kp : null;
      kpByImdb[imdb]=val;
      cb(val);
    }, eb);
  }
  function devSearchRating(title, year, cb, eb){
    var url='https://api.kinopoisk.dev/v1.4/movie/search?query='+encodeURIComponent(title)+'&limit=10&selectFields=rating&selectFields=year';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var a=(j&&j.docs)||[]; if(!a.length) return cb(null);
      var p=null;
      if(year){
        p=a.find(function(x){return x.year===year && x.rating && x.rating.kp!=null;}) ||
           a.find(function(x){return Math.abs((x.year||0)-year)<=1 && x.rating && x.rating.kp!=null;});
      }
      p=p||a.find(function(x){return x.rating && x.rating.kp!=null;});
      cb(p?+p.rating.kp:null);
    }, eb);
  }

  // ---------- UI helpers ----------
  function ensureCss(){
    if($('#kp-rate-css')) return;
    var st=document.createElement('style'); st.id='kp-rate-css'; st.textContent=
      '.kp-rate-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;background:rgba(255,255,255,.08);margin-right:6px}' +
      '.kp-rate-num{font-weight:700;font-size:13px}' +
      '.kp-rate-lbl{font-size:12px;opacity:.7}';
    document.head.appendChild(st);
  }
  function badgesWrap(){
    return $('.full-start__rate, .full-start-new__rate, .full-start__tags, .full-start-new__tags');
  }
  function hideTmdbBadges(wrap){
    if(!HIDE_TMDB || !wrap) return;
    var nodes = wrap.querySelectorAll('*');
    for (var i=0;i<nodes.length;i++){
      var n = nodes[i], t = (txt(n)+' '+(n.className||'')+' '+(n.id||'')+' '+(n.getAttribute('alt')||'')+' '+(n.getAttribute('title')||'')+' '+(n.getAttribute('aria-label')||'')+' '+(n.getAttribute('src')||'')).toLowerCase();
      if (/\btmdb\b/.test(t)){ var up=n; for(var j=0;j<3 && up; j++){ up.style.display='none'; up=up.parentElement; } }
    }
  }
  function injectKpChip(kp){
    if(kp==null) return;
    ensureCss();
    var wrap=badgesWrap(); if(!wrap) return;
    hideTmdbBadges(wrap);

    var have=$('.kp-rate-chip',wrap);
    if(have){ have.querySelector('.kp-rate-num').textContent=kp.toFixed(1); return; }

    var chip=document.createElement('span'); chip.className='kp-rate-chip';
    var num=document.createElement('span'); num.className='kp-rate-num'; num.textContent=kp.toFixed(1);
    var lbl=document.createElement('span'); lbl.className='kp-rate-lbl'; lbl.textContent='КР';
    chip.appendChild(num); chip.appendChild(lbl);
    wrap.insertBefore(chip, wrap.firstChild);

    try{
      if(Lampa.Controller && Lampa.Controller.update) Lampa.Controller.update();
      if(Lampa.Scroll && Lampa.Scroll.update) Lampa.Scroll.update();
      void document.body.offsetHeight; window.dispatchEvent(new Event('resize'));
    }catch(e){}
  }

  // ---------- перехват TMDB.api ----------
  function patchTmdb(){
    if(!window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api!=='function' || Lampa.__kp_rate_patched) return;
    Lampa.__kp_rate_patched = true;

    var orig = Lampa.TMDB.api;

    Lampa.TMDB.api = function(url, params, onOk, onErr){
      try{
        var m = url && url.match(/^(movie|tv)\/(\d+)(?:$|[/?])/i);
        if(!m) return orig(url, params, onOk, onErr);

        var type = m[1].toLowerCase();
        var id   = m[2];
        var key  = type+':'+id;

        var sent=false, dataResp=null, haveKp=null, timed=false;

        function trySend(){
          if(sent) return;
          if(dataResp && (haveKp!=null || timed)){
            if(haveKp!=null){
              // подменяем основной рейтинг
              if(typeof dataResp.vote_average!=='undefined') dataResp.vote_average = haveKp;
              // сериалам иногда кладут в nested объект — оставим просто vote_average
            }
            sent=true; onOk(dataResp);
            // обновим UI после дорисовки
            setTimeout(function(){ injectKpChip(haveKp); }, 200);
          }
        }

        // 1) начинаем тянуть саму карточку (TMDB details)
        orig(url, params, function(resp){
          dataResp = resp;
          trySend();
        }, function(e){ onErr && onErr(e); });

        // 2) параллельно — вытянем KP рейтинг
        if(kpByTmdb[key]!=null){
          haveKp = kpByTmdb[key]; trySend();
        } else {
          // сперва возьмём imdb_id
          orig(type+'/'+id+'/external_ids', {}, function(ids){
            var imdb = ids && (ids.imdb_id || ids.imdbId);
            if(imdb){
              devByImdb(imdb, function(kp){
                haveKp = kp; kpByTmdb[key]=kp;
                trySend();
              }, function(){ bySearchFallback(); });
            } else bySearchFallback();
          }, function(){ bySearchFallback(); });

          function bySearchFallback(){
            // если деталей ещё нет — попросим их для заголовка/года;
            if(dataResp){
              var t = dataResp.title || dataResp.name || '';
              var y = (type==='movie') ? (dataResp.release_date||'') : (dataResp.first_air_date||'');
              var m = y.match(/\b(19|20)\d{2}\b/); var year = m?+m[0]:0;
              if(!t){ trySend(); return; }
              devSearchRating(t, year, function(kp){
                haveKp = kp; kpByTmdb[key]=kp; trySend();
              }, function(){ trySend(); });
            } else {
              // дождёмся деталей (таймером всё равно не зависнем)
            }
          }
        }

        // 3) страхуемся таймаутом, чтобы не ждать вечно KP
        setTimeout(function(){ timed=true; trySend(); }, 1500);
      }catch(e){
        // на всякий — если что-то пошло не так, работаем как обычный TMDB
        return orig(url, params, onOk, onErr);
      }
    };
  }

  // ---------- слушатель карточки для UI-подстраховки ----------
  function onFull(e){
    if(e && e.type==='complite'){
      var meta=getActiveMeta();
      var key=(meta.type||'movie')+':'+meta.tmdb_id;
      var kp = kpByTmdb[key];
      if(kp!=null) setTimeout(function(){ injectKpChip(kp); }, 120);
    }
  }

  function boot(){
    if(!window.Lampa || !Lampa.Listener || !Lampa.TMDB) return false;
    patchTmdb();
    Lampa.Listener.follow('full', onFull);
    return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();


