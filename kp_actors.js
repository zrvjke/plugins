/**
 * KP Rating Overlay (TMDB UI + KP score)
 * Вся карточка остаётся TMDB, но в шапке показываем рейтинг Кинопоиска
 * и прячем любые чипы TMDB. Работает для фильмов и сериалов.
 */
(function () {
  'use strict';

  /* === КЛЮЧ API === */
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // api.kinopoisk.dev v1.4

  /* === НАСТРОЙКИ === */
  var DEBUG = false;     // true — покажу шаги в Noty
  var HIDE_TMDB = true;  // прятать ВСЕ варианты TMDB-чипов

  var rq = new (window.Lampa && Lampa.Reguest ? Lampa.Reguest : XMLHttpRequest)();
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }

  /* ---------- network ---------- */
  function fetchJSON(url, headers, cb, eb){
    if (rq.silent){ rq.timeout(12000); rq.silent(url, function(j){ cb(j); }, function(){ eb&&eb(); }, false, {headers:headers||{}} ); return; }
    var x=new XMLHttpRequest(); x.open('GET',url,true);
    for(var k in (headers||{})) try{x.setRequestHeader(k, headers[k]);}catch(e){}
    x.onreadystatechange=function(){ if(x.readyState===4){ try{ cb(JSON.parse(x.responseText)); }catch(e){ eb&&eb(); } } };
    x.onerror=function(){ eb&&eb(); }; x.send();
  }

  /* ---------- meta ---------- */
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
    if(!o.original) o.original=o.title; return o;
  }
  function tmdbExternalIds(meta, cb, eb){
    if(!meta.tmdb_id || !Lampa.TMDB || typeof Lampa.TMDB.api!=='function'){ eb&&eb(); return; }
    Lampa.TMDB.api((meta.type||'movie')+'/'+meta.tmdb_id+'/external_ids',{},function(j){ cb(j||{}); },function(){ eb&&eb(); });
  }

  /* ---------- KP rating ---------- */
  function devByImdb(imdb, cb, eb){
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)+'&limit=1&selectFields=rating';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var d=j&&j.docs&&j.docs[0]; cb(d&&d.rating&&d.rating.kp!=null ? +d.rating.kp : null);
    }, eb);
  }
  function devSearchRating(title, year, cb, eb){
    var url='https://api.kinopoisk.dev/v1.4/movie/search?query='+encodeURIComponent(title)+'&limit=10&selectFields=rating&selectFields=year';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var a=(j&&j.docs)||[]; if(!a.length) return cb(null);
      var p=null;
      if(year){ p=a.find(function(x){return x.year===year && x.rating && x.rating.kp!=null;}) ||
                   a.find(function(x){return Math.abs((x.year||0)-year)<=1 && x.rating && x.rating.kp!=null;}); }
      p=p||a.find(function(x){return x.rating && x.rating.kp!=null;});
      cb(p?+p.rating.kp:null);
    }, eb);
  }

  /* ---------- UI ---------- */
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
    // прячем всё, где «tmdb» встречается в тексте / классах / id / alt / src / aria
    var nodes = wrap.querySelectorAll('*');
    for (var i=0;i<nodes.length;i++){
      var n = nodes[i], t = (txt(n)+' '+(n.className||'')+' '+(n.id||'')+' '+(n.getAttribute('alt')||'')+' '+(n.getAttribute('title')||'')+' '+(n.getAttribute('aria-label')||'')+' '+(n.getAttribute('src')||'')).toLowerCase();
      if (/\btmdb\b/.test(t)){
        // скрыть ближайший «чип»
        var up=n; for(var j=0;j<3 && up && up.parentElement; j++){ if(up.style && up.offsetHeight<60){ up.style.display='none'; break; } up=up.parentElement; }
        n.style.display='none';
      }
    }
  }
  function injectKpChip(kp){
    if(kp==null) return false;
    ensureCss();
    var wrap=badgesWrap(); if(!wrap) return false;
    hideTmdbBadges(wrap);

    // уже есть наш чип?
    var has=$('.kp-rate-chip',wrap); if(has){ has.querySelector('.kp-rate-num').textContent=kp.toFixed(1); return true; }

    // добавляем свой чип слева
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
    return true;
  }

  /* ---------- flow ---------- */
  var lastKey=null;
  function run(){
    var m=getActiveMeta(); if(!m || !m.tmdb_id) return;
    var key=(m.type||'movie')+':'+m.tmdb_id; if(key===lastKey) return; lastKey=key;

    tmdbExternalIds(m, function(ids){
      var imdb=ids&&(ids.imdb_id||ids.imdbId);
      if(imdb){
        noty('IMDb '+imdb);
        devByImdb(imdb, function(kp){ if(kp!=null) injectKpChip(kp); else searchFallback(); }, searchFallback);
      } else searchFallback();
      function searchFallback(){ var q=m.original||m.title||''; if(!q) return; devSearchRating(q,m.year,function(kp){ if(kp!=null) injectKpChip(kp); }); }
    }, function(){ /* без external_ids */ var q=m.original||m.title||''; if(!q) return; devSearchRating(q,m.year,function(kp){ if(kp!=null) injectKpChip(kp); }); });
  }

  function onFull(e){ if(e && e.type==='complite') setTimeout(run,180); }
  function boot(){ if(!window.Lampa||!Lampa.Listener) return false; Lampa.Listener.follow('full', onFull); return true; }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();
})();

