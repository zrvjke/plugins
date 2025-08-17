/**
 * Lampa plugin: Watched Flag from Kinopoisk export (v2.7)
 * — Перед жанрами показывает [+ Просмотрено] / [– Не просмотрено]
 * — Источник: твой JSON с kpIds И ДОПОЛНИТЕЛЬНО titles (название+год→kpId)
 * — Работает офлайн по названию+год, без внешних API. kinopoisk.dev — только как резерв (опционально).
 */

(function(){
  'use strict';

  /* ========= НАСТРОЙКА ========= */
  // Твой RAW JSON (Gist Raw)
  var REMOTE_JSON_URL = 'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json';
  // Запасной URL (если захочешь) — оставить пустым
  var REMOTE_ALT_URL  = '';

  // Можно без сети: вставь свои kpIds тут (и/или карту заголовков)
  var KP_IDS_INLINE = []; // например: [301,"535341",123456]
  var TITLE_MAP_INLINE = {}; // например: {"t:матрица|1999":603, "t:matrix|1999":603}

  // Резервный ключ для api.kinopoisk.dev (если захочешь маппинг TMDB→KP)
  var DEV_API_KEY = ''; // оставь пустым, если не нужен

  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000;
  var DEBUG = true;

  /* ========= УТИЛИТЫ ========= */
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toNum(x){ if(typeof x==='number')return x; if(typeof x==='string'&&/^\d+$/.test(x))return +x; return NaN; }

  function normTitle(s){
    if(!s) return '';
    s = (s+'').toLowerCase();
    s = s.replace(/[ё]/g,'е');
    s = s.replace(/[“”„"«»]/g,'').replace(/[.:;!?()\[\]{}]/g,'').replace(/[-–—]/g,' ');
    s = s.replace(/\s+/g,' ').trim();
    return s;
  }
  function keyFor(title, year){
    var t = normTitle(title);
    return 't:'+t+'|'+(year||0);
  }

  /* ========= CSS ========= */
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

  /* ========= ГДЕ РИСОВАТЬ ========= */
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

  /* ========= МЕТА КАРТОЧКИ ========= */
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

  /* ========= ХРАНИЛКИ ========= */
  var LS_MAP   = 'hds.watched.map.v4';       // локальные оверрайды
  var LS_REMOTE= 'hds.watched.remote.v4';    // кэш удалённого: {ts, kpIds[], titleMap{}}
  var LS_KPRES = 'hds.watched.kpmap.v4';     // кэш маппинга tmdb/imdb→kp
  var kpMapCache = readLS(LS_KPRES, { byTmdb:{}, byImdb:{} });

  function saveKpMap(){ writeLS(LS_KPRES, kpMapCache); }
  function readLocal(){ return readLS(LS_MAP, {}); }
  function writeLocal(m){ writeLS(LS_MAP, m||{}); }

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
        try{ cb(JSON.parse(x.responseText||'null')); }
        catch(e){ eb&&eb('parse'); }
      } else { eb&&eb('http '+x.status); }
    };
    x.onerror=function(){ eb&&eb('network'); };
    x.send();
  }

  function parseRemoteJson(j){
    var arr = Array.isArray(j) ? j : (j && j.kpIds) || [];
    var ids=[]; for (var i=0;i<arr.length;i++){ var n=toNum(arr[i]); if(n>0) ids.push(n); }
    var set = ids.length ? new Set(ids) : null;

    var tmap = null;
    if (j && j.titleMap && typeof j.titleMap==='object'){
      tmap={}; for (var k in j.titleMap){ var v=toNum(j.titleMap[k]); if(v>0) tmap[k]=v; }
    } else if (j && Array.isArray(j.titles)){
      tmap={};
      for (var ii=0; ii<j.titles.length; ii++){
        var it=j.titles[ii]||{}; var nm=it.title||it.name||it.n||''; var yr = toNum(it.year); if(!yr) yr = it.year||0;
        var id=toNum(it.kpId||it.id); if(!id) continue;
        var k1=keyFor(nm, yr); if(k1) tmap[k1]=id;
        if (it.alt){ var k2=keyFor(it.alt, yr); if(k2) tmap[k2]=id; }
      }
    }
    return {set:set, map:tmap};
  }

  function tryLoadUrlOnce(baseUrl, cb){
    var bust = (baseUrl.indexOf('?')>-1 ? '&' : '?') + 'v=' + Date.now();
    fetchJSON(baseUrl + bust, null, function(j){
      var parsed = parseRemoteJson(j);
      remoteSet    = parsed.set;
      remoteTitles = parsed.map;
      remoteTS     = Date.now();
      writeLS(LS_REMOTE, {ts:remoteTS, kpIds: remoteSet?Array.from(remoteSet):[], titleMap: remoteTitles||{}});
      noty('REMOTE loaded: '+(remoteSet?remoteSet.size:0)+' ids; titles: '+(remoteTitles?Object.keys(remoteTitles).length:0));
      cb(true);
    }, function(reason){
      noty('REMOTE fetch error: '+reason);
      cb(false);
    });
  }

  function withRemote(cb){
    var inl = mergeInlineToRemote();
    if (inl.set || inl.map){
      remoteSet    = inl.set || null;
      remoteTitles = inl.map || null;
      remoteTS     = Date.now();
      noty('INLINE: '+(remoteSet?remoteSet.size:0)+'; titles: '+(remoteTitles?Object.keys(remoteTitles).length:0));
      cb(true); return;
    }

    var cached = readLS(LS_REMOTE, null);
    if (cached && Date.now()-(cached.ts||0) < REMOTE_TTL_MS){
      var ids=cached.kpIds||[], set=null;
      if (ids.length){ set=new Set(); for (var i=0;i<ids.length;i++){ var n=toNum(ids[i]); if(n>0) set.add(n); } }
      var tmap=cached.titleMap||null;
      remoteSet=set; remoteTitles=tmap; remoteTS=cached.ts;
      noty('REMOTE cache: '+(set?set.size:0)+'; titles: '+(tmap?Object.keys(tmap).length:0));
      cb(true); return;
    }

    if (fetching){ waiters.push(cb); return; }
    fetching=true;
    function done(ok){
      fetching=false; cb(ok); while(waiters.length) waiters.shift()(ok);
    }

    if (REMOTE_JSON_URL){
      tryLoadUrlOnce(REMOTE_JSON_URL, function(ok){
        if (ok || !REMOTE_ALT_URL) done(ok);
        else tryLoadUrlOnce(REMOTE_ALT_URL, function(ok2){ done(ok2); });
      });
    } else if (REMOTE_ALT_URL){
      tryLoadUrlOnce(REMOTE_ALT_URL, function(ok){ done(ok); });
    } else {
      done(false);
    }
  }

  /* ========= РЕНДЕР ========= */
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

  /* ========= СВЕРКА ========= */
  function matchFromRemote(meta){
    if (remoteSet && meta.kp_id && remoteSet.has(meta.kp_id)) return {ok:true, key:'kp:'+meta.kp_id};

    var local=readLocal(), cand=keys(meta), k, i;
    for (i=0;i<cand.length;i++){ k=cand[i]; if(local.hasOwnProperty(k)) return {ok: !!local[k], key:k, local:true}; }

    if (remoteTitles){
      var t1=keyFor(meta.title, meta.year), t2=keyFor(meta.original, meta.year);
      var id = remoteTitles[t1] || remoteTitles[t2] || remoteTitles[keyFor(meta.title,0)] || remoteTitles[keyFor(meta.original,0)];
      if (id && remoteSet && remoteSet.has(id)) return {ok:true, key:'kp:'+id, via:'title'};
      // даже если id есть в titleMap, но его нет в kpIds — всё равно можно отметить просмотренным
      if (id && !remoteSet) return {ok:true, key:'kp:'+id, via:'title-only'};
    }

    for (i=0;i<cand.length;i++){ k=cand[i]; if(local.hasOwnProperty(k)) return {ok: !!local[k], key:k, local:true}; }

    return {ok:false, key:cand[0]||null};
  }

  /* ========= ЗАПУСК ========= */
  function kickoffOnce(){
    var meta=activeMeta(); if(!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    if(!renderAll(false)) return;

    withRemote(function(){
      var r=matchFromRemote(meta);
      if (r.ok){ renderAll(true); enableToggle(meta, r.key); noty('match: '+(r.via||'direct')); return; }
      enableToggle(meta, r.key);
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



