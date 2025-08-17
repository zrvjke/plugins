(function(){
  'use strict';

  /* === НАСТРОЙКА === */
  var SRC_GIST     = 'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json';
  var SRC_JSDELIVR = 'https://cdn.jsdelivr.net/gh/zrvjke/plugins@main/kp-watched.json';
  var SRC_RAW_GH   = 'https://raw.githubusercontent.com/zrvjke/plugins/main/kp-watched.json';

  // если есть ключ api.kinopoisk.dev — впиши; если нет, оставь пустым
  var KPDEV_KEY = '';

  var DEBUG = false;                 // true — покажу подсказки
  var REMOTE_TTL_MS = 12*60*60*1000; // кэш списка 12 часов

  /* === утилиты === */
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toNum(x){ if(typeof x==='number')return x; if(typeof x==='string'&&/^\d+$/.test(x))return +x; return NaN; }
  function normTitle(s){ if(!s)return''; s=(s+'').toLowerCase().replace(/[ё]/g,'е').replace(/[“”„"«»]/g,'').replace(/[.:;!?()\[\]{}]/g,'').replace(/[-–—]/g,' ').replace(/\s+/g,' ').trim(); return s; }
  function keyFor(t,y){ return 't:'+normTitle(t)+'|'+(y||0); }

  /* === CSS и контейнер === */
  function ensureCss(){
    if (document.getElementById('kpwatched-css')) return;
    var st=document.createElement('style');
    st.id='kpwatched-css';
    st.textContent =
      '.kpwatched{display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:600;font-size:12px;user-select:none;cursor:default;margin-right:6px;white-space:nowrap}' +
      '.kpwatched[data-ok="1"]{color:#4ee38a}' +
      '.kpwatched[data-ok="0"]{color:#ff7a7a}' +
      '.kpwatched-split{display:inline-block;margin:0 6px;opacity:.6}' +
      '.full-start__details,.full-start__info,.full-start-new__details,.full-start-new__info{display:flex;flex-wrap:wrap;align-items:center;gap:6px}';
    document.head.appendChild(st);
  }
  var DETAILS_SEL = [
    '.full-start__details','.full-start__info',
    '.full-start-new__details','.full-start-new__info',
    '.full-start__tags','.full-start-new__tags'
  ].join(', ');
  function detailsNodes(){ var n=$all(DETAILS_SEL); if(n.length)return n; var r=$('.full-start,.full-start-new'); return r?[r]:[]; }
  function ensureSplitAfter(el){
    var n=el&&el.nextElementSibling, need=true;
    if(n){ var t=textOf(n), c=(n.className||'')+''; if(/full-start.*__split/.test(c)||/^[.\u2022\u00B7|\/]$/.test(t)) need=false; }
    if(need && el && el.parentNode){ var s=document.createElement('span'); s.className='kpwatched-split'; s.textContent='·'; el.parentNode.insertBefore(s, el.nextSibling); }
  }

  /* === чтение меты из карточки === */
  function activeMeta(){
    var o={type:'movie',tmdb_id:null,kp_id:null,title:'',original:'',year:0};
    try{
      var act=Lampa.Activity&&Lampa.Activity.active&&Lampa.Activity.active();
      if(act&&act.activity){
        var c=act.activity.card||{};
        o.type=c.type||(act.activity.params&&(act.activity.params.method||act.activity.params.content_type))||'movie';
        o.tmdb_id=c.id||(act.activity.params&&act.activity.params.id)||null;
        o.kp_id=c.kinopoisk_id||c.kp_id||null;
        o.title=c.name||c.title||'';
        o.original=c.original_name||c.original_title||'';
        var d=c.release_date||c.first_air_date||''; var m=d&&d.match(/\b(19|20)\d{2}\b/); if(m) o.year=+m[0];
      }
    }catch(e){}
    if(!o.original) o.original=o.title;
    return o;
  }
  function keys(meta){
    var a=[]; if(meta.kp_id)a.push('kp:'+meta.kp_id);
    if(meta.tmdb_id)a.push((meta.type==='tv'?'tmdbtv:':'tmdb:')+meta.tmdb_id);
    if(meta.title||meta.year)a.push(keyFor(meta.title||'',meta.year||0));
    if(meta.original||meta.year)a.push(keyFor(meta.original||'',meta.year||0));
    if(meta.title)a.push(keyFor(meta.title,0)); if(meta.original)a.push(keyFor(meta.original,0));
    return a;
  }

  /* === рисование флажка === */
  function paint(ok){
    ensureCss();
    var list=detailsNodes(); if(!list.length) return false;
    for(var i=0;i<list.length;i++){
      var box=list[i], flag=box.querySelector('.kpwatched');
      if(!flag){ flag=document.createElement('span'); flag.className='kpwatched'; box.insertBefore(flag, box.firstChild); }
      flag.setAttribute('data-ok', ok?1:0);
      flag.textContent = ok ? '+ Просмотрено' : '– Не просмотрено';
      ensureSplitAfter(flag);
    }
    return true;
  }

  /* === загрузка списка из Gist/jsDelivr/raw === */
  var LS_REMOTE='kpwatched.remote.v1'; // {ts,kpIds[],titleMap{}}
  var remoteSet=null, titleMap=null, busy=false, waiters=[];

  function parseRemote(j){
    var arr = Array.isArray(j)?j : (j&&j.kpIds)||[];
    var ids=[], i, n;
    for(i=0;i<arr.length;i++){ n=toNum(arr[i]); if(n>0) ids.push(n); }
    var set = ids.length ? new Set(ids) : null;

    var tmap = null;
    if (j && j.titleMap && typeof j.titleMap==='object'){
      tmap={}; for (var k in j.titleMap){ var v=toNum(j.titleMap[k]); if(v>0) tmap[k]=v; }
    }
    return {set:set, map:tmap};
  }
  function fetchJSON(url){
    return fetch(url,{method:'GET',cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  }
  function loadRemote(cb){
    if(remoteSet||titleMap){ cb(true); return; }
    var cache=readLS(LS_REMOTE,null);
    if(cache && Date.now()-(cache.ts||0)<REMOTE_TTL_MS){
      var ids=cache.kpIds||[], s=null, i, n; if(ids.length){ s=new Set(); for(i=0;i<ids.length;i++){ n=toNum(ids[i]); if(n>0)s.add(n);} }
      remoteSet=s; titleMap=cache.titleMap||null; noty('REMOTE cache'); cb(true); return;
    }
    if(busy){ waiters.push(cb); return; }
    busy=true;
    var urls=[SRC_GIST,SRC_JSDELIVR,SRC_RAW_GH].filter(Boolean), idx=0;
    (function next(){
      if(idx>=urls.length){ busy=false; noty('REMOTE failed'); cb(false); while(waiters.length)waiters.shift()(false); return; }
      var u=urls[idx++]; noty('FETCH '+u.split('/')[2]);
      fetchJSON(u).then(function(j){
        var p=parseRemote(j);
        remoteSet=p.set; titleMap=p.map;
        writeLS(LS_REMOTE,{ts:Date.now(),kpIds:remoteSet?Array.from(remoteSet):[],titleMap:titleMap||{}});
        busy=false; cb(true); while(waiters.length)waiters.shift()(true);
      }).catch(function(){ next(); });
    })();
  }

  /* === поиск kpId при его отсутствии === */
  function searchKPIdByTitle(title,year){
    if(!KPDEV_KEY) return Promise.resolve(null);
    var q=(title||'').trim(); if(!q) return Promise.resolve(null);
    var url='https://api.kinopoisk.dev/v1.4/movie/search?query='+encodeURIComponent(q)+(year?('&year='+year):'')+'&limit=5';
    return fetch(url,{headers:{'X-API-KEY':KPDEV_KEY}})
      .then(function(r){ if(!r.ok) throw new Error('kpdev '+r.status); return r.json(); })
      .then(function(j){
        var docs=(j&&j.docs)||[]; if(!docs.length) return null;
        var best=docs[0], diff=1e9, i;
        for(i=0;i<docs.length;i++){ var d=docs[i], yy=d.year||0, cur=Math.abs((yy||0)-(year||0)); if(cur<diff){diff=cur; best=d;} }
        return best ? toNum(best.id) : null;
      }).catch(function(){ return null; });
  }

  /* === основная логика === */
  function decide(meta, cb){
    // 1) если есть kp_id и он в списке
    if (remoteSet && meta.kp_id){ var k=toNum(meta.kp_id); if(!isNaN(k) && remoteSet.has(k)) return cb(true); }

    // 2) если есть titleMap — сверяем по названию
    if (titleMap){
      var t1=keyFor(meta.title,meta.year), t2=keyFor(meta.original,meta.year);
      var id = titleMap[t1] || titleMap[t2] || titleMap[keyFor(meta.title,0)] || titleMap[keyFor(meta.original,0)];
      if (id && (!remoteSet || remoteSet.has(id))) return cb(true);
    }

    // 3) آخر — онлайн-поиск kpId
    searchKPIdByTitle(meta.original||meta.title, meta.year).then(function(found){
      if(found && remoteSet && remoteSet.has(found)) return cb(true);
      cb(false);
    });
  }

  function runOnce(){
    var meta=activeMeta(); if(!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    // всегда сначала ставлю «минус», чтобы элемент точно появился
    var had = paint(false);
    if(!had){
      // подождём дорисовку DOM
      var tries=0; (function again(){
        if (paint(false)) start(); else if(++tries<40) setTimeout(again,100);
      })();
    } else start();

    function start(){
      loadRemote(function(){
        if(!remoteSet && !titleMap){ noty('нет данных списка'); return; }
        decide(meta, function(ok){ paint(!!ok); });
      });
    }
  }

  function onFull(e){
    if(!e) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){
      setTimeout(runOnce,150);
    }
  }
  function boot(){ if(!window.Lampa||!Lampa.Listener) return false; Lampa.Listener.follow('full', onFull); return true; }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();
})();


