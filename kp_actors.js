/**
 * Lampa plugin: Watched Flag from Kinopoisk export (v2.5)
 * — Пишу перед жанрами [+ Просмотрено] / [– Не просмотрено]
 * — Беру твой список kpIds из JSON (GitHub Raw) ИЛИ из inline-массива ниже
 * — Умею маппить TMDB → IMDb → KP (и резерв: TMDB → KP, Title+Year → KP)
 * — «–» рисую сразу; когда найду kpId и он есть в списке — меняю на «+»
 */

(function(){
  'use strict';

  /* ====== НАСТРОЙКА ====== */
  var REMOTE_JSON_URL = 'https://raw.githubusercontent.com/zrvjke/plugins/refs/heads/main/kp-watched.json';
  var KP_IDS_INLINE = [];            // если не хочешь URL — вставь массив сюда и оставь REMOTE_JSON_URL пустым
  var DEV_API_KEY   = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // api.kinopoisk.dev (для маппинга)
  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000;
  var DEBUG = true;

  /* ====== УТИЛИТЫ ====== */
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toNum(x){ if (typeof x==='number') return x; if (typeof x==='string' && /^\d+$/.test(x)) return +x; return NaN; }

  var LS_MAP   = 'hds.watched.map.v3';     // локальные оверрайды {key:0|1}
  var LS_REMOTE= 'hds.watched.remote.v3';  // {ts, kpIds:number[]}
  var LS_KPRES = 'hds.watched.kpmap.v3';   // {byTmdb:{}, byImdb:{}}

  var kpMapCache = readLS(LS_KPRES, { byTmdb:{}, byImdb:{} });
  function saveKpMap(){ writeLS(LS_KPRES, kpMapCache); }

  function ensureCss(){
    if (document.getElementById('hds-watch-css')) return;
    var st = document.createElement('style');
    st.id = 'hds-watch-css';
    st.textContent =
      '.hds-watch-flag{display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:600;font-size:12px;user-select:none;cursor:pointer;margin-right:6px;white-space:nowrap}' +
      '.hds-watch-flag[data-state="watched"]{color:#4ee38a}' +
      '.hds-watch-flag[data-state="unwatched"]{color:#ff7a7a}' +
      '.hds-watch-split{display:inline-block;margin:0 6px;opacity:.6}' +
      '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info{display:flex;flex-wrap:wrap;align-items:center;gap:6px}';
    document.head.appendChild(st);
  }

  /* ====== КОНТЕЙНЕР ДЛЯ ВСТАВКИ ====== */
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
      var candidates = $all('div,section', root).filter(function(el){
        var t=textOf(el); return t && (el.querySelector('span') || el.querySelector('a'));
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
    if (meta.title && meta.year) a.push('t:'+meta.title.toLowerCase()+'|'+meta.year);
    return a;
  }

  /* ====== ТВОЙ СПИСОК KP ====== */
  var remoteSet=null, remoteTS=0, fetching=false, waiters=[];
  function inlineSet(){
    if (!KP_IDS_INLINE || !KP_IDS_INLINE.length) return null;
    var s=new Set(); for (var i=0;i<KP_IDS_INLINE.length;i++){ var n=toNum(KP_IDS_INLINE[i]); if(n>0) s.add(n); }
    return s.size ? s : null;
  }
  function withRemote(cb){
    var s = inlineSet();
    if (s){ noty('INLINE ids: '+s.size); cb(s); return; }
    if (!REMOTE_JSON_URL){ cb(null); return; }
    if (remoteSet && (Date.now()-remoteTS<REMOTE_TTL_MS)) { cb(remoteSet); return; }

    var cached = readLS(LS_REMOTE, null);
    if (cached && Date.now()-cached.ts < REMOTE_TTL_MS){
      var set=new Set(); (cached.kpIds||[]).forEach(function(x){ var n=toNum(x); if(n>0) set.add(n); });
      remoteSet=set; remoteTS=cached.ts; noty('REMOTE cache: '+set.size); cb(set); return;
    }
    if (fetching){ waiters.push(cb); return; }
    fetching=true;

    var x=new XMLHttpRequest();
    x.open('GET', REMOTE_JSON_URL, true);
    x.onreadystatechange=function(){
      if(x.readyState!==4) return;
      fetching=false;
      try{
        var j=JSON.parse(x.responseText||'null');
        var arr = Array.isArray(j) ? j : (j && j.kpIds) || [];
        var ids=[]; for (var i=0;i<arr.length;i++){ var n=toNum(arr[i]); if(n>0) ids.push(n); }
        var set=new Set(ids);
        remoteSet=set; remoteTS=Date.now();
        writeLS(LS_REMOTE, {ts:remoteTS, kpIds:ids});
        noty('REMOTE loaded: '+ids.length);
        cb(set); while(waiters.length) waiters.shift()(set);
      }catch(e){ noty('REMOTE parse error'); cb(null); while(waiters.length) waiters.shift()(null); }
    };
    x.onerror=function(){ fetching=false; noty('REMOTE fetch error'); cb(null); while(waiters.length) waiters.shift()(null); };
    x.send();
  }

  /* ====== МАППИНГ TMDB/IMDb → KP ====== */
  function tmdbExternalIds(meta, ok, err){
    try{
      if(!window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api!=='function') return err&&err();
      var path = (meta.type==='tv'?'tv':'movie')+'/'+meta.tmdb_id+'/external_ids';
      Lampa.TMDB.api(path, {}, function(json){ ok(json||{}); }, function(){ err&&err(); });
    }catch(e){ err&&err(); }
  }
  function fetchJSON(url, headers, cb, eb){
    var x=new XMLHttpRequest();
    x.open('GET', url, true);
    if(headers){ for(var k in headers){ try{x.setRequestHeader(k, headers[k]);}catch(e){} } }
    x.onreadystatechange=function(){ if(x.readyState===4){ try{ cb(JSON.parse(x.responseText||'null')); }catch(e){ eb&&eb(); } } };
    x.onerror=function(){ eb&&eb(); };
    x.send();
  }
  function kpByImdb(imdb, cb, eb){
    if (!imdb) return eb&&eb();
    if (kpMapCache.byImdb[imdb]) return cb(kpMapCache.byImdb[imdb]);
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)+'&limit=1&selectFields=id';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ kpMapCache.byImdb[imdb]=id; saveKpMap(); cb(id); } else eb&&eb();
    }, eb);
  }
  function kpByTmdb(tmdbId, cb, eb){
    if (!tmdbId) return eb&&eb();
    var keyM='m:'+tmdbId, keyT='tv:'+tmdbId;
    if (kpMapCache.byTmdb[keyM]) return cb(kpMapCache.byTmdb[keyM]);
    if (kpMapCache.byTmdb[keyT]) return cb(kpMapCache.byTmdb[keyT]);
    var url='https://api.kinopoisk.dev/v1.4/movie?externalId.tmdb='+encodeURIComponent(tmdbId)+'&limit=1&selectFields=id';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ kpMapCache.byTmdb[keyM]=id; kpMapCache.byTmdb[keyT]=id; saveKpMap(); cb(id); } else eb&&eb();
    }, eb);
  }
  function kpByTitleYear(title, year, cb, eb){
    if(!title) return eb&&eb();
    var url='https://api.kinopoisk.dev/v1.4/movie/search?query='+encodeURIComponent(title)+(year?('&year='+year):'')+'&limit=1&selectFields=id%2Cname%2CalternativeName%2Cyear';
    fetchJSON(url, {'X-API-KEY':DEV_API_KEY,'accept':'application/json'}, function(j){
      var d=j&&j.docs&&j.docs[0]; var id=d&&(d.id||d.kinopoiskId||d.kpId);
      if(id){ cb(id); } else eb&&eb();
    }, eb);
  }

  function resolveKpId(meta, cb){
    if (meta.kp_id) return cb(meta.kp_id);

    if (meta.tmdb_id){
      // 1) TMDB → IMDb → KP
      tmdbExternalIds(meta, function(ids){
        var imdb = ids && (ids.imdb_id || ids.imdbId);
        if (imdb){
          kpByImdb(imdb, function(id){ noty('kp via IMDb: '+id); cb(id); }, function(){
            // 2) если по IMDb не нашли — TMDB → KP
            kpByTmdb(meta.tmdb_id, function(id){ noty('kp via TMDB: '+id); cb(id); }, function(){
              // 3) запасной — title+year
              kpByTitleYear(meta.title||meta.original, meta.year, function(id){ noty('kp via Title: '+id); cb(id); }, function(){ cb(null); });
            });
          });
        } else {
          // нет IMDb — пробуем TMDB → KP
          kpByTmdb(meta.tmdb_id, function(id){ noty('kp via TMDB: '+id); cb(id); }, function(){
            kpByTitleYear(meta.title||meta.original, meta.year, function(id){ noty('kp via Title: '+id); cb(id); }, function(){ cb(null); });
          });
        }
      }, function(){
        // не смогли спросить TMDB — пробуем сразу TMDB → KP, дальше title
        kpByTmdb(meta.tmdb_id, function(id){ noty('kp via TMDB: '+id); cb(id); }, function(){
          kpByTitleYear(meta.title||meta.original, meta.year, function(id){ noty('kp via Title: '+id); cb(id); }, function(){ cb(null); });
        });
      });
      return;
    }

    // вообще нет tmdb_id — крайний случай: title+year
    kpByTitleYear(meta.title||meta.original, meta.year, function(id){ noty('kp via Title: '+id); cb(id); }, function(){ cb(null); });
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
    var list = findDetailsContainers();
    if (!list.length){ noty('details not found, retry…'); return false; }
    list.forEach(function(cont){ renderInto(cont, watched); });
    return true;
  }
  function enableToggle(meta, resolvedKey){
    var list = findDetailsContainers(); if(!list.length) return;
    list.forEach(function(cont){
      var flag=cont.querySelector('.hds-watch-flag'); if(!flag) return;
      flag.onclick=function(e){
        e.preventDefault(); e.stopPropagation();
        var local=readLS(LS_MAP, {}), k=(resolvedKey||keys(meta)[0])||('t:'+(meta.title||'').toLowerCase()+'|'+(meta.year||0));
        var next = !(local[k]===1); local[k]= next ? 1 : 0; writeLS(LS_MAP, local);
        renderAll(next);
        noty(next?'Пометила как просмотрено':'Сняла отметку «просмотрено»');
      };
    });
  }

  /* ====== ОСНОВНАЯ ЛОГИКА ====== */
  function kickoffOnce(){
    var meta=activeMeta();
    if(!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    // рисую минус сразу, чтобы флажок гарантированно был
    if (!renderAll(false)) return;

    withRemote(function(set){
      resolveKpId(meta, function(kpId){
        noty('kpId: '+kpId);
        var local=readLS(LS_MAP, {}), usedKey = kpId ? ('kp:'+kpId) : (keys(meta)[0]||null);
        // приоритет локального оверрайда
        if (usedKey && local.hasOwnProperty(usedKey)){
          renderAll(!!local[usedKey]); enableToggle(meta, usedKey); return;
        }
        // потом — внешний список
        if (set && kpId && set.has(kpId)){ renderAll(true); }
        enableToggle(meta, usedKey);
      });
    });
  }

  function kickoffWithRetries(attempt){
    attempt = attempt||0;
    if (renderAll(false)) { kickoffOnce(); }
    else if (attempt < 25){ setTimeout(function(){ kickoffWithRetries(attempt+1); }, 120); }
  }

  function observeBodyOnce(){
    if (document.body && !document.body.__hds_watch_observed){
      var pend=false, mo=new MutationObserver(function(){
        if (pend) return; pend=true;
        setTimeout(function(){ pend=false; kickoffWithRetries(0); }, 60);
      });
      mo.observe(document.body, {childList:true, subtree:true});
      document.body.__hds_watch_observed = true;
    }
  }

  function onFull(e){
    if(!e) return;
    if(e.type==='build' || e.type==='open' || e.type==='complite'){
      noty('full:'+e.type);
      setTimeout(function(){
        kickoffWithRetries(0);
        observeBodyOnce();
      }, 140);
    }
  }

  function boot(){
    if(!window.Lampa || !Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull);
    return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();



