(function () {
  'use strict';

  /*** 1) Где лежит твой список ***/
  var KP_WATCH_JSON_URLS = [
    // твой gist raw
    'https://gist.githubusercontent.com/zrvjke/a8756cd00ed4e2a6653eb9fb33a667e9/raw/kp-watched.json',
    // резерв — GitHub raw (если положишь туда)
    'https://raw.githubusercontent.com/zrvjke/plugins/refs/heads/main/kp-watched.json'
  ];

  /*** 2) Ключ для api.kinopoisk.dev ***/
  var KPDEV_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // ← твой

  /*** 3) Отладка ***/
  var WANT_DEBUG = false;

  /* ---------------- Internals ---------------- */

  var LS_WATCH   = 'hds.kp.watch.set.v2'; // {ts, ids:[], titleMap:{}}
  var LS_MAP     = 'hds.kp.cross.v2';     // { tmdb:<id> -> kpId, 't:<title>|<year>' -> kpId }
  var WATCH_TTL  = 7 * 24 * 60 * 60 * 1000; // кэш списка на 7 дней
  var MAP_TTL    = 60 * 24 * 60 * 60 * 1000; // карта соответствий на 60 дней

  function noty(s){ try{ if(WANT_DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toNum(x){ if(typeof x==='number')return x; if(typeof x==='string'&&/^\d+$/.test(x))return +x; return NaN; }
  function normTitle(s){ if(!s) return ''; s=(s+'').toLowerCase().replace(/[ё]/g,'е').replace(/[“”„"«»]/g,'').replace(/[.:;!?()\[\]{}]/g,'').replace(/[-–—]/g,' ').replace(/\s+/g,' ').trim(); return s; }
  function keyFor(t,y){ return 't:'+normTitle(t)+'|'+(y||0); }

  /* ------------ Парс карточки ------------ */
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
    }catch(e){ console.error("Error in activeMeta:", e); }
    if(!o.original) o.original=o.title;
    return o;
  }

  /* ------------ Куда рисовать ------------ */
  var DETAILS_SEL=[ '.full-start__details','.full-start__info', '.full-start-new__details','.full-start-new__info', '.full-start__tags','.full-start-new__tags' ].join(', ');

  function findDetailsContainers(){
    var nodes=$all(DETAILS_SEL);
    if(nodes.length) return nodes;
    var root=$('.full-start, .full-start-new');
    if(root){
      var cands=$all('div,section',root).filter(function(el){
        var t=textOf(el); return t && (el.querySelector('span')||el.querySelector('a'));
      });
      if(cands.length) return [cands[0]];
    }
    return [];
  }

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

  /* ------------ Загрузка твоего списка ------------ */
  var WATCH_SET=null;      // Set<number>
  var WATCH_TITLEMAP={};   // опционально

  function applyWatchJson(obj){
    var ids=null, map={};
    if (Array.isArray(obj)){
      ids=[]; for (var i=0;i<obj.length;i++){ var n=toNum(obj[i]); if(n>0) ids.push(n); }
    } else if (obj && typeof obj==='object'){
      if (Array.isArray(obj.kpIds)){
        ids=[]; for (var j=0;j<obj.kpIds.length;j++){ var m=toNum(obj.kpIds[j]); if(m>0) ids.push(m); }
      }
      if (obj.titleMap && typeof obj.titleMap==='object'){
        for (var k in obj.titleMap){ var v=toNum(obj.titleMap[k]); if(v>0) map[k]=v; }
      }
    }
    WATCH_SET = new Set(ids);
    WATCH_TITLEMAP = map;
    noty('Загружен список просмотренных');
  }

  function loadWatchJson(){
    var urls = KP_WATCH_JSON_URLS;
    var idx = 0;
    function fetchNext(){
      if (idx >= urls.length) return noty('Не удалось загрузить список просмотров');
      var url = urls[idx++];
      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) { applyWatchJson(data); })
        .catch(function() { fetchNext(); });
    }
    fetchNext();
  }

  /* ------------ Основной запуск ------------ */
  function kickoff(){
    var meta = activeMeta();
    if(!meta || (!meta.title && !meta.year)) return;
    loadWatchJson();
    renderAll(false);
  }

  // Запускаем плагин после загрузки
  window.addEventListener('load', kickoff);

})();

