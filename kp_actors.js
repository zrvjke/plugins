/**
 * Lampa plugin: Watched Flag from Kinopoisk export (v2.2)
 * — Перед жанрами показывает [+ Просмотрено] / [– Не просмотрено]
 * — Источник: твой список kpIds из КП (через URL ИЛИ inline ниже)
 * — Клик по флажку — локальный оверрайд (localStorage)
 */

(function(){
  'use strict';

  /* ====== НАСТРОЙКА ====== */
  // ТВОЯ RAW-ССЫЛКА (GitHub raw):
  var REMOTE_JSON_URL = 'https://raw.githubusercontent.com/zrvjke/plugins/refs/heads/main/kp-watched.json';

  // Альтернатива: вставь массив kpIds прямо сюда и оставь REMOTE_JSON_URL пустым
  var KP_IDS_INLINE = []; // пример: [301, 535341, 123456]

  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000; // 12 ч
  var DEBUG = false;

  /* ====== ВСПОМОГАТЕЛЬНОЕ ====== */
  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  var LS_MAP   = 'hds.watched.map.v2';
  var LS_REMOTE= 'hds.watched.remote';

  function ensureCss(){
    if (document.getElementById('hds-watch-css')) return;
    var st = document.createElement('style');
    st.id = 'hds-watch-css';
    st.textContent =
      '.hds-watch-flag{display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:600;font-size:12px;user-select:none;cursor:pointer;margin-right:6px}' +
      '.hds-watch-flag[data-state="watched"]{color:#4ee38a}' +
      '.hds-watch-flag[data-state="unwatched"]{color:#ff7a7a}' +
      '.hds-watch-split{display:inline-block;margin:0 6px;opacity:.6}';
    document.head.appendChild(st);
  }

  /* ====== МЕТА КАРТОЧКИ ====== */
  var DETAILS_SEL = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';
  function details(){ return $(DETAILS_SEL); }

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
        var d=c.release_date||c.first_air_date||''; var m=d && d.match(/\b(19|20)\d{2}\b/); if(m) o.year=+m[0];
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

  /* ====== ИСТОЧНИК ДАННЫХ (REMOTE/INLINE) ====== */
  var remoteSet=null, remoteTS=0, fetching=false, waiters=[];

  function inlineSet(){
    if (!KP_IDS_INLINE || !KP_IDS_INLINE.length) return null;
    var s = new Set();
    for (var i=0;i<KP_IDS_INLINE.length;i++){
      var n = +KP_IDS_INLINE[i]; if (n>0) s.add(n);
    }
    return s.size ? s : null;
  }

  function withRemote(cb){
    var s = inlineSet();
    if (s){ cb(s); return; }

    if (!REMOTE_JSON_URL){ cb(null); return; }

    if (remoteSet && (Date.now()-remoteTS<REMOTE_TTL_MS)) { cb(remoteSet); return; }

    var cached = readLS(LS_REMOTE, null);
    if (cached && Date.now()-cached.ts < REMOTE_TTL_MS){
      remoteSet = new Set(cached.kpIds||[]);
      remoteTS  = cached.ts;
      cb(remoteSet); return;
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
        var ids = Array.isArray(j)?j:(j&&j.kpIds)||[];
        ids = (ids||[]).filter(function(n){ return typeof n==='number' && n>0; });
        remoteSet = new Set(ids);
        remoteTS  = Date.now();
        writeLS(LS_REMOTE, {ts:remoteTS, kpIds:ids});
        cb(remoteSet); while(waiters.length) waiters.shift()(remoteSet);
      }catch(e){ cb(null); while(waiters.length) waiters.shift()(null); }
    };
    x.onerror=function(){ fetching=false; cb(null); while(waiters.length) waiters.shift()(null); };
    x.send();
  }

  /* ====== ЛОКАЛЬНЫЕ ОВЕРРАЙДЫ ====== */
  function readLocal(){ return readLS(LS_MAP, {}); }
  function writeLocal(m){ writeLS(LS_MAP, m||{}); }

  /* ====== РЕНДЕР ====== */
  function ensureSplitAfter(node){
    var next=node && node.nextElementSibling, need=true;
    if(next){
      var t=textOf(next), cls=(next.className||'')+'';
      if (/full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(t)) need=false;
    }
    if(need){
      var s=document.createElement('span'); s.className='hds-watch-split'; s.textContent='·';
      node.parentNode && node.parentNode.insertBefore(s, node.nextSibling);
    }
  }

  function render(state){
    ensureCss();
    var cont=details(); if(!cont) return;
    var flag=cont.querySelector('.hds-watch-flag');
    if(!flag){
      flag=document.createElement('span');
      flag.className='hds-watch-flag';
      cont.insertBefore(flag, cont.firstChild);
    }
    flag.setAttribute('data-state', state?'watched':'unwatched');
    flag.textContent = state ? '+ Просмотрено' : '– Не просмотрено';
    ensureSplitAfter(flag);
  }

  function enableToggle(meta, resolvedKey){
    var cont=details(); if(!cont) return;
    var flag=cont.querySelector('.hds-watch-flag'); if(!flag) return;
    flag.onclick=function(e){
      e.preventDefault(); e.stopPropagation();
      var local=readLocal(), k=(resolvedKey||keys(meta)[0]); if(!k) return;
      var next = !(local[k]===1);
      local[k]= next ? 1 : 0;
      writeLocal(local);
      render(next);
      noty(next?'Пометила как просмотрено':'Сняла отметку «просмотрено»');
    };
  }

  /* ====== ЛОГИКА ====== */
  function decide(meta, cb){
    var ks=keys(meta), local=readLocal();
    for (var i=0;i<ks.length;i++){
      var k=ks[i]; if (local.hasOwnProperty(k)) { cb(!!local[k], k); return; }
    }
    withRemote(function(set){
      if(set && meta.kp_id && set.has(meta.kp_id)) { cb(true, 'kp:'+meta.kp_id); return; }
      cb(false, ks[0]||null);
    });
  }

  function kickoff(){
    var meta=activeMeta();
    if(!meta || (!meta.kp_id && !meta.tmdb_id && !meta.title)) return;
    decide(meta, function(isWatched, keyUsed){
      render(isWatched);
      enableToggle(meta, keyUsed);
      observeDetails();
    });
  }

  function observeDetails(){
    var cont=details(); if(!cont || cont.getAttribute('data-hds-watch-observed')==='1') return;
    var pend=false, mo=new MutationObserver(function(){ if(pend) return; pend=true; setTimeout(function(){ pend=false; kickoff(); },0); });
    mo.observe(cont,{childList:true,subtree:true});
    cont.setAttribute('data-hds-watch-observed','1');
  }

  function onFull(e){ if(e && e.type==='complite') setTimeout(kickoff,180); }
  function boot(){ if(!window.Lampa||!Lampa.Listener) return false; Lampa.Listener.follow('full', onFull); return true; }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();


