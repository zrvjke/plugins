(function(){
  'use strict';

  /* ====== НАСТРОЙКА ====== */
  var SRC_GIST     = 'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json';
  var SRC_JSDELIVR = 'https://cdn.jsdelivr.net/gh/zrvjke/plugins@main/kp-watched.json';
  var SRC_RAW_GH   = 'https://raw.githubusercontent.com/zrvjke/plugins/main/kp-watched.json';

  var REMOTE_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов кэш
  var DEBUG = true; // включи подсказки

  // Локально вшитые (можно оставить пустыми)
  var KP_IDS_INLINE = [];      // [301, "535341", ...]
  var TITLE_MAP_INLINE = {};   // {"t:матрица|1999":603, ...}

  /* ====== Утилиты ====== */
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
    s=s.replace(/[ё]/g,'е').replace(/[“”„"«»]/g,'').replace(/[.:;!?()\[\]{}]/g,'').replace(/[-–—]/g,' ');
    s=s.replace(/\s+/g,' ').trim();
    return s;
  }
  function keyFor(title, year){
    var t=normTitle(title);
    return 't:'+t+'|'+(year||0);
  }

  /* ====== CSS и контейнер ====== */
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

  var DETAILS_SEL = [
    '.full-start__details','.full-start__info',
    '.full-start-new__details','.full-start-new__info',
    '.full-start__tags','.full-start-new__tags'
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

  /* ====== Метаданные карточки ====== */
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
    var arr=[];
    if (meta.kp_id)   arr.push('kp:'+meta.kp_id);
    if (meta.tmdb_id) arr.push((meta.type==='tv'?'tmdbtv:':'tmdb:')+meta.tmdb_id);
    if (meta.title||meta.year)    arr.push(keyFor(meta.title||'', meta.year||0));
    if (meta.original||meta.year) arr.push(keyFor(meta.original||'', meta.year||0));
    if (meta.title)    arr.push(keyFor(meta.title,0));
    if (meta.original) arr.push(keyFor(meta.original,0));
    return arr;
  }

  /* ====== Рендер ====== */
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
    if(!list.length) return false;
    list.forEach(function(c){ renderInto(c, watched); });
    return true;
  }

  /* ====== Хранилки и загрузка списка ====== */
  var LS_LOCAL  = 'hds.watched.local.v7';   // ручные клики
  var LS_REMOTE = 'hds.watched.remote.v7';  // {ts, kpIds[], titleMap{}}

  function readLocal(){ return readLS(LS_LOCAL, {}); }
  function writeLocal(m){ writeLS(LS_LOCAL, m||{}); }

  var remoteSet=null, remoteTitles=null, fetching=false, waiters=[];

  function parseRemoteJson(j){
    var arr = Array.isArray(j) ? j : (j && j.kpIds) || [];
    var ids=[]; for (var i=0;i<arr.length;i++){ var n=toNum(arr[i]); if(n>0) ids.push(n); }
    var set = ids.length ? new Set(ids) : null;

    var tmap = null;
    if (j && j.titleMap && typeof j.titleMap==='object'){
      tmap={}; for (var k in j.titleMap){ var v=toNum(j.titleMap[k]); if(v>0) tmap[k]=v; }
    }
    return {set:set, map:tmap};
  }

  function buildFallbacks(){
    var a=[];
    if (SRC_GIST)     a.push(SRC_GIST);
    if (SRC_JSDELIVR) a.push(SRC_JSDELIVR);
    if (SRC_RAW_GH)   a.push(SRC_RAW_GH);
    return a;
  }

  function fetchJSON(url, ok, fail){
    fetch(url, {method:'GET', cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(ok)
      .catch(function(e){ noty('fetch fail '+url.split('/')[2]+': '+e.message); (fail||function(){})(); });
  }

  function withRemote(cb){
    // inline
    var inSet=null, inMap=null, i, n;
    if (KP_IDS_INLINE && KP_IDS_INLINE.length){
      inSet=new Set(); for (i=0;i<KP_IDS_INLINE.length;i++){ n=toNum(KP_IDS_INLINE[i]); if(n>0) inSet.add(n); }
    }
    if (TITLE_MAP_INLINE && typeof TITLE_MAP_INLINE==='object'){
      inMap={}; for (var k in TITLE_MAP_INLINE){ var v=toNum(TITLE_MAP_INLINE[k]); if(v>0) inMap[k]=v; }
    }
    if (inSet || inMap){
      remoteSet=inSet||null; remoteTitles=inMap||null;
      noty('INLINE loaded');
      cb(true); return;
    }

    var cached = readLS(LS_REMOTE, null);
    if (cached && (Date.now()-(cached.ts||0) < REMOTE_TTL_MS)){
      var ids=cached.kpIds||[], set=null; if (ids.length){ set=new Set(); for (i=0;i<ids.length;i++){ n=toNum(ids[i]); if(n>0) set.add(n); } }
      remoteSet=set; remoteTitles=cached.titleMap||null;
      noty('REMOTE cache');
      cb(true); return;
    }

    if (fetching){ waiters.push(cb); return; }
    fetching=true;
    var list=buildFallbacks(), idx=0;

    function tryNext(){
      if (idx>=list.length){
        fetching=false; noty('REMOTE failed');
        cb(false); while(waiters.length) waiters.shift()(false);
        return;
      }
      var url=list[idx++]; noty('FETCH '+url.split('/')[2]);
      fetchJSON(url, function(j){
        var p=parseRemoteJson(j);
        remoteSet=p.set; remoteTitles=p.map;
        writeLS(LS_REMOTE, {ts:Date.now(), kpIds: remoteSet?Array.from(remoteSet):[], titleMap: remoteTitles||{}});
        fetching=false; cb(true); while(waiters.length) waiters.shift()(true);
      }, function(){ tryNext(); });
    }
    tryNext();
  }

  function matchFromRemote(meta){
    // ручной оверрайд
    var local=readLocal(), cand=keys(meta), k, i;
    for (i=0;i<cand.length;i++){ k=cand[i]; if(local.hasOwnProperty(k)) return {ok: !!local[k], key:k, src:'local'}; }

    // по kp_id
    if (remoteSet && meta.kp_id){
      var kpNum = toNum(meta.kp_id);
      if (!isNaN(kpNum) && remoteSet.has(kpNum)) return {ok:true, key:'kp:'+kpNum, src:'kp'};
    }

    // по названию/году (если есть titleMap)
    if (remoteTitles){
      var t1=keyFor(meta.title, meta.year), t2=keyFor(meta.original, meta.year);
      var id = remoteTitles[t1] || remoteTitles[t2] || remoteTitles[keyFor(meta.title,0)] || remoteTitles[keyFor(meta.original,0)];
      if (id && (!remoteSet || remoteSet.has(id))) return {ok:true, key:'kp:'+id, src:'title'};
    }

    return {ok:false, key:cand[0]||null, src:'none'};
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

  /* ====== Ожидание DOM и ререндер ====== */
  function waitForDetails(maxTries, delay, onReady){
    var tries=0;
    (function loop(){
      var ok = findDetailsContainers().length>0;
      if (ok) return onReady();
      if (++tries>=maxTries) return; // не нашли — молча сдаёмся
      setTimeout(loop, delay);
    })();
  }
  function attachRootObserver(){
    var root = $('.full-start, .full-start-new') || document.body;
    if(!root || root.__hds_observed) return;
    var pend=false, mo=new MutationObserver(function(){
      if (pend) return; pend=true;
      setTimeout(function(){ pend=false; kickoffOnce(); }, 80);
    });
    mo.observe(root, {childList:true, subtree:true});
    root.__hds_observed = true;
  }

  /* ====== Основной цикл ====== */
  function kickoffOnce(){
    var meta=activeMeta(); if(!meta || (!meta.tmdb_id && !meta.kp_id && !meta.title)) return;

    // всегда сначала ставим «минус», чтобы было видно виджет
    if (!renderAll(false)){
      // контейнер ещё не дорисовался — подождём
      waitForDetails(40, 100, function(){ renderAll(false); proceed(); });
      attachRootObserver();
      return;
    }
    proceed();

    function proceed(){
      withRemote(function(){
        var r=matchFromRemote(meta);
        renderAll(!!r.ok);
        enableToggle(meta, r.key);
        noty('match: '+r.src+(r.ok?' ✓':' ×'));
      });
    }
  }

  function onFull(e){
    if(!e) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){
      setTimeout(kickoffOnce, 150);
      attachRootObserver();
    }
  }
  function boot(){
    if(!window.Lampa||!Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull); return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();
})();

