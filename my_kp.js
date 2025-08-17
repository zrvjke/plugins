/**
 * Lampa plugin: Watched Flag from Kinopoisk export (v2.8)
 * — Перед жанрами показывает [+ Просмотрено] / [– Не просмотрено]
 * — Источник: твой JSON (kpIds) + опционально titleMap (название+год→kpId)
 * — Надёжный маппинг: TMDB → IMDb → KP (api.kinopoisk.dev), резерв TMDB→KP, затем поиск title+year
 * — Рисую "–" сразу; после маппинга/загрузки переключаю на "+"
 */

(function(){
  'use strict';

  /* ====== НАСТРОЙКА ====== */
  // Твой RAW JSON
  var REMOTE_JSON_URL = 'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json';
  // Запасной URL (можно оставить пустым)
  var REMOTE_ALT_URL  = '';

  // Можно без сети: локальные данные
  var KP_IDS_INLINE = [];        // [301, "535341", 123456]
  var TITLE_MAP_INLINE = {};     // {"t:матрица|1999":603, "t:matrix|1999":603}

  // Ключ api.kinopoisk.dev для маппинга (из твоих: KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G)
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';

  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000;
  var DEBUG = true;

  /* ====== УТИЛИТЫ ====== */
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toNum(x){ if(typeof x==='number')return x; if(typeof x==='string'&&/^\d+$/.test(x))return +x; return NaN; }

  function normTitle(s){
    if(!s) return '';
    s=(s+'').toLowerCase();
    s=s.replace(/[ё]/g,'е');
    s=s.replace(/[“”„"«»]/g,'').replace(/[.:;!?()\[\]{}]/g,'').replace(/[-–—]/g,' ');
    s=s.replace(/\s+/g,' ').trim();
    return s;
  }
  function keyFor(title, year){
    var t=normTitle(title);
    return 't:'+t+'|'+(year||0);
  }

  /* ====== CSS ====== */
  function ensureCss(){
    if (document.getElementById('hds-watch-css')) return;
    var st=document.createElement('style');
    st.id='hds-watch-css';
    st.textContent =
      '.hds-watch-flag{display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:600;font-size:12px;user-select:none;cursor:pointer;margin-right:6px;white-space:nowrap}' +
      '.hds-watch-flag[data-state="watched"]{color:#4ee38a}' +
      '.hds-watch-flag[data-state="unwatched"]{color:#ff7a7a}' +
      '.hds-watch-split{display:inline-block;margin:0 6px;opacity:.6}' +
      '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info{display:flex;flex-wrap:wrap;align-items:center;gap:6px}';
    document.head.appendChild(st);
  }

  /* ====== КОНТЕЙНЕР ДЕТАЛЕЙ ====== */
  var DETAILS_SEL = [
    '.full-start__details',
    '.full-start__info',
    '.full-start-new__details',
    '.full-start-new__info',
    '.full-start__tags',
    '.full-start-new__tags'
  ].join(', ');
  function findDetailsContainers(){
    var nodes = $all(DETAILS_SEL);
    if (nodes.length) return nodes;
    var root = $('.full-start, .full-start-new');
    if (root){
      var candidates=$all('div,section',root).filter(function(el){
        var t=textOf(el); return t && (el.querySelector('span')||el.querySelector('a'));
      });
      if (candidates.length) return [candidates[0]];
    }
    return [];
  }

  /* ====== МЕТА КАРТОЧКИ ====== */
  function activeMeta(){
    var o={ type:'movie', tmdb_id:null, kp_id:null, imdb_id:null, title:'', original:'', year:0 };
    try{
      var act=Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      if(act && act.activity){
        var c=act.activity.card||{};
        o.type=c.type || (act.activity.params && (act.activity.params.method||act.activity.params.content_type)) || 'movie';
        o.tmdb_id=c.id || (act.activity.params && act.activity.params.id) || null;
        o.kp_id=c.kinopoisk_id || c.kp_id || null;
        o.imdb_id=c.imdb_id || null;
        o.title=c.name||c.title||'';
        o.original=c.original_name||c.original_title||'';
        var d=c.release_date||c.first_air_date||''; var m=d&&d.match(/\b(19|20)\d{2}\b/); if(m) o.year=+m[0];
      }
    }catch(e){}
    if(!o.original) o.original=o.title;
    return o;
  }
  function keys(meta){
    var a=[];
    if (meta.kp_id)   a.push('kp:'+meta.kp_id);
    if (meta.imdb_id) a.push('imdb:'+meta.imdb_id);
    if (meta.tmdb_id) a.push((meta.type==='tv'?'tmdbtv:':'tmdb:')+meta.tmdb_id);
    if (meta.title && meta.year) a.push(keyFor(meta.title, meta.year));
    if (meta.original && meta.year) a.push(keyFor(meta.original, meta.year));
    return a;
  }

  /* ====== КЭШИ ====== */
  var LS_MAP   = 'hds.watched.map.v5';       // локальные оверрайды
  var LS_REMOTE= 'hds.watched.remote.v5';    // {ts, kpIds[], titleMap{}}
  var LS_KPRES = 'hds.watched.kpmap.v5';     // {byTmdb:{}, byImdb:{}}
  var kpMapCache = readLS(LS_KPRES, { byTmdb:{}, byImdb:{} });
  function saveKpMap(){ writeLS(LS_KPRES, kpMapCache); }
  function readLocal(){ return readLS(LS_MAP, {}); }
  function writeLocal(m){ writeLS(LS_MAP, m||{}); }

  /* ====== ЗАГРУЗКА JSON ====== */
  var remoteSet=null, remoteTitles=null, remoteTS=0, fetching=false, waiters=[];
  function mergeInlineToRemote(){
    var set=null, tmap=null;
    if (KP_IDS_INLINE && KP_IDS_INLINE.length){
      set=new Set(); for (var i=0;i<KP_IDS_INLINE.length;i++){ var n=toNum(KP_IDS_INLINE[i]); if(n>0) set.add(n); }
    }
    if (TITLE_MAP_INLINE && typeof TITLE_MAP_INLINE==='object'){
      tmap={}; for (var k in TITLE_MAP_INLINE){ var v=toNum(TITLE_MAP_INLINE[k]); if(v>0) tmap[k]=v; }
    }
    return {set:set, map:tmap};
  }
  function fetchJSON(url, headers, cb, eb){
    var x=new XMLHttpRequest();
    x.open('GET', url, true);
    if(headers){ for(var k in headers){ try{x.setRequestHeader(k, headers[k]);}catch(e){} } }
    x.onreadystatechange=function(){
      if(x.readyState!==4) return;
      if(x.status>=200 && x.status<300){
        try{ cb(JSON.parse(x.responseText||'null')); }catch(e){ eb&&eb('parse'); }
      } else { eb&&eb('http '+x.status); }
    };
    x.onerror=function(){ eb&&eb('network'); };
    x.send();
  }
  function parseRemoteJson(j){
    var arr = Array.isArray(j) ? j : (j && j.kpIds) || [];
    var ids=[]; for (var i=0;i<arr.length;i++){ var n=toNum(arr[i]); if(n>0) ids.push(n); }
    var set = ids.length ? new Set(ids) : null;

    var tmap=null;
    if (j && j.titleMap && typeof j.titleMap==='object'){
      tmap={}; for (var k in j.titleMap){ var v=toNum(j.titleMap[k]); if(v>0) tmap[k]=v; }
    }
    return {set:set, map:tmap};
  }
  function tryLoadUrlOnce(baseUrl, cb){
    var bust=(baseUrl.indexOf('?')>-1?'&':'?')+'v='+Date.now();
    fetchJSON(baseUrl + bust, null, function(j){
      var parsed=parseRemoteJson(j);
      remoteSet=parsed.set; remoteTitles=parsed.map; remoteTS=Date.now();
      writeLS(LS_REMOTE,{ts:remoteTS,kpIds:remoteSet?Array.from(remoteSet):[],titleMap:remoteTitles||{}});
      noty('REMOTE loaded: '+(remoteSet?remoteSet.size:0)+' ids; titles: '+(remoteTitles?Object.keys(remoteTitles).length:0));
      cb(true);
    }, function(reason){ noty('REMOTE fetch error: '+reason); cb(false); });
  }
  function withRemote(cb){
    var inl=mergeInlineToRemote();
    if (inl.set || inl.map){
      remoteSet=inl.set||null; remoteTitles=inl.map||null; remoteTS=Date.now();
      noty('INLINE used'); cb(true); return;
    }
    var cached=readLS(LS_REMOTE,null);
    if (cached && Date.now()-(cached.ts||0)<REMOTE_TTL_MS){
      var ids=cached.kpIds||[], set=null;
      if (ids.length){ set=new Set(); for (var i=0;i<ids.length;i++){ var n=toNum(ids[i]); if(n>0) set.add(n); } }
      remoteSet=set; remoteTitles=cached.titleMap||null; remoteTS=cached.ts;
      noty('REMOTE cache: '+(set?set.size:0)); cb(true); return;
    }
    if (fetching){ waiters.push(cb); return; }
    fetching=true;
    function done(ok){ fetching=false; cb(ok); while(waiters.length) waiters.shift()(ok); }
    if (REMOTE_JSON_URL){
      tryLoadUrlOnce(REMOTE_JSON_URL,function(ok){
        if (ok || !REMOTE_ALT_URL) done(ok);
        else tryLoadUrlOnce(REMOTE_ALT_URL,function(ok2){ done(ok2); });
      });
    } else if (REMOTE_ALT_URL){
      tryLoadUrlOnce(REMOTE_ALT_URL,done);
    } else done(false);
  }

  /* ====== МАППИНГ TMDB/IMDb → KP (через api.kinopoisk.dev) ====== */
  function tmdbExternalIds(meta, ok, err){
    try{
      if(!window.Lampa||!Lampa.TMDB||typeof Lampa.TMDB.api!=='function') return err&&err();
      var path=(meta.type==='tv'?'tv':'movie')+'/'+meta.tmdb_id+'/external_ids';
      Lampa.TMDB.api(path, {}, function(json){ ok(json||{}); }, function(){ err&&err(); });
    }catch(e){ err&&err(); }
  }
  function fetchJSONAuth(url, cb, eb){
    var h={'accept':'application/json'}; if(DEV_API_KEY) h['X-API-KEY']=DEV_API_KEY;
    fetchJSON(url,h,cb,eb);
  }
  function kpByImdb(imdb, cb, eb){
    if (!DEV_API_KEY || !imdb) return eb&&eb();
    if (kpMapCache.byImdb[imdb]) return cb(kpMapCache.byImdb[imdb]);
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)+'&limit=1&selectFields=id';
    fetchJSONAuth(url,function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ kpMapCache.byImdb[imdb]=id; saveKpMap(); cb(id); } else eb&&eb();
    }, function(){ eb&&eb(); });
  }
  function kpByTmdb(tmdbId, cb, eb){
    if (!DEV_API_KEY || !tmdbId) return eb&&eb();
    var keyM='m:'+tmdbId, keyT='tv:'+tmdbId;
    if (kpMapCache.byTmdb[keyM]) return cb(kpMapCache.byTmdb[keyM]);
    if (kpMapCache.byTmdb[keyT]) return cb(kpMapCache.byTmdb[keyT]);
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.tmdb='+encodeURIComponent(tmdbId)+'&limit=1&selectFields=id';
    fetchJSONAuth(url,function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ kpMapCache.byTmdb[keyM]=id; kpMapCache.byTmdb[keyT]=id; saveKpMap(); cb(id); } else eb&&eb();
    }, function(){ eb&&eb(); });
  }
  function kpByTitleYear(title, year, cb, eb){
    if (!DEV_API_KEY || !title) return eb&&eb();
    var url='https://api.kinopoisk.dev/v1.4/movie/search?query='+encodeURIComponent(title)+(year?('&year='+year):'')+'&limit=1&selectFields=id%2Cname%2CalternativeName%2Cyear';
    fetchJSONAuth(url,function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ cb(id); } else eb&&eb();
    }, function(){ eb&&eb(); });
  }
  function resolveKpId(meta, cb){
    if (meta.kp_id) return cb(meta.kp_id);
    if (!DEV_API_KEY || !meta.tmdb_id) return cb(null);

    // 1) TMDB → IMDb → KP
    tmdbExternalIds(meta,function(ids){
      var imdb=ids && (ids.imdb_id||ids.imdbId);
      if (imdb){
        kpByImdb(imdb,function(id){ noty('kp via IMDb: '+id); cb(id); },function(){
          // 2) TMDB → KP
          kpByTmdb(meta.tmdb_id,function(id){ noty('kp via TMDB: '+id); cb(id); },function(){
            // 3) title+year
            kpByTitleYear(meta.title||meta.original,meta.year,function(id){ noty('kp via Title: '+id); cb(id); },function(){ cb(null); });
          });
        });
      } else {
        kpByTmdb(meta.tmdb_id,function(id){ noty('kp via TMDB: '+id); cb(id); },function(){
          kpByTitleYear(meta.title||meta.original,meta.year,function(id){ noty('kp via Title: '+id); cb(id); },function(){ cb(null); });
        });
      }
    },function(){ cb(null); });
  }

  /* ====== РЕНДЕР ====== */
  function ensureSplitAfter(node){
    var next=node && node.nextElementSibling, need=true;
    if(next){
      var t=textOf(next), cls=(next.className||'')+'';
      if (/full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(t)) need=false;
    }
    if(need && node && node.parentNode){
      var s=document.createElement('span'); s.className='hds-watch-split'; s.textContent='·';
      node.parentNode.insertBefore(s, node.nextSibling);
    }
  }
  function renderInto(cont, watched){
    if(!cont) return;
    var flag=cont.querySelector('.hds-watch-flag');
    if(!flag){
      flag=document.createElement('span');
      flag.className='hds-watch-flag';
      flag.setAttribute('tabindex','-1');
      cont.insertBefore(flag, cont.firstChild);
    }
    flag.setAttribute('data-state', watched?'watched':'unwatched');
    flag.textContent = watched ? '+ Просмотрено' : '– Не просмотрено';
    ensureSplitAfter(flag);
  }
  function renderAll(watched){
    ensureCss();
    var list=findDetailsContainers();
    if(!list.length){ noty('details not found, retry…'); return false; }
    list.forEach(function(c){ renderInto(c, watched); });
    return true;
  }
  function enableToggle(meta, resolvedKey){
    var list=findDetailsContainers(); if(!list.length) return;
    list.forEach(function(cont){
      var flag=cont.querySelector('.hds-watch-flag'); if(!flag) return;
      flag.onclick=function(e){
        e.preventDefault(); e.stopPropagation();
        var local=readLocal(), k=(resolvedKey||keys(meta)[0])||keyFor(meta.title||'', meta.year||0);
        var next=!(local[k]===1); local[k]=next?1:0; writeLocal(local);
        renderAll(next);
        noty(next?'Пометила как просмотрено':'Сняла отметку «просмотрено»');
      };
    });
  }

  /* ====== СВЕРКА ====== */
  function matchFromRemote(meta){
    // приоритет: локальный оверрайд
    var local=readLocal(), cand=keys(meta), k,i;
    for(i=0;i<cand.length;i++){ k=cand[i]; if(local.hasOwnProperty(k)) return {ok: !!local[k], key:k, src:'local'}; }

    // прямой kp_id из карточки
    if (remoteSet && meta.kp_id && remoteSet.has(meta.kp_id)) return {ok:true, key:'kp:'+meta.kp_id, src:'kp'};

    // по titleMap (если есть в JSON)
    if (remoteTitles){
      var t1=keyFor(meta.title, meta.year), t2=keyFor(meta.original, meta.year);
      var id = remoteTitles[t1] || remoteTitles[t2] || remoteTitles[keyFor(meta.title,0)] || remoteTitles[keyFor(meta.original,0)];
      if (id && (!remoteSet || remoteSet.has(id))) return {ok:true, key:'kp:'+id, src:'title'};
    }

    return {ok:false, key:cand[0]||null, src:'none'};
  }

  /* ====== ЗАПУСК ====== */
  function kickoffOnce(){
    var meta=activeMeta(); if(!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    // рисую "–" сразу
    if(!renderAll(false)) return;

    withRemote(function(){
      var r=matchFromRemote(meta);
      if (r.ok){ renderAll(true); enableToggle(meta, r.key); noty('match: '+r.src); return; }

      // не совпало — пробуем определить kpId через API и снова сверить по списку
      resolveKpId(meta, function(kpId){
        if (kpId && remoteSet && remoteSet.has(kpId)){
          renderAll(true); enableToggle(meta, 'kp:'+kpId); noty('match: api→'+kpId); 
        } else {
          enableToggle(meta, r.key); noty('no match');
        }
      });
    });
  }

  function kickoffWithRetries(attempt){
    attempt=attempt||0;
    if (renderAll(false)) { kickoffOnce(); }
    else if (attempt<25){ setTimeout(function(){ kickoffWithRetries(attempt+1); }, 120); }
  }

  function observeBodyOnce(){
    if (document.body && !document.body.__hds_watch_observed){
      var pend=false, mo=new MutationObserver(function(){
        if (pend) return; pend=true;
        setTimeout(function(){ pend=false; kickoffWithRetries(0); }, 60);
      });
      mo.observe(document.body,{childList:true,subtree:true});
      document.body.__hds_watch_observed=true;
    }
  }

  function onFull(e){
    if(!e) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){
      noty('full:'+e.type);
      setTimeout(function(){ kickoffWithRetries(0); observeBodyOnce(); }, 140);
    }
  }
  function boot(){
    if(!window.Lampa||!Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull); return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();




