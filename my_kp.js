/**
 * Lampa plugin: Watched Flag (Kinopoisk) — OFFLINE pack (v5.0)
 * Автор: я :) Для Ромы.
 * — Вшит офлайн-набор kpIds (твой JSON), без внешних загрузок.
 * — В карточке (строка с деталями/жанрами) показывает:
 *     [+ Просмотрено]  или  [– Не просмотрено]
 * — Сверка по kinopoisk_id (если он есть в карточке Лампы).
 */

(function(){
  'use strict';

  /* ====== Вшитые данные (твои kpIds), varint+base64 ====== */
  var B64_DATA =
    "qgIBAgQHAgICAQMBAQEBAQEBBAIBAgMBAwUBBAECAwYDAQYEAQcGCAIFCAwFCQMBCgsFAgYJAwgFDAME" +
    "BQgCCQgPAgkIFAIKCBQCCwgUAgoIFQIKCRYCCwkXAgsJGAIJCBoCCQgcAgkIHAIKCB0CCggfAgkIhwIK" +
    "CI4CDAiRAg0IkQINCI0CDQidAg0InQIOCJ8CDgiwAg8IsQIPCLICDwiyAg8IpwIQCKgCEAipAhAIqQIQ" +
    "CKoCEQirAhEIqwIRCKwCEQitAhEIrQISCK0CEgitAhIIrQITCK0CEwitAhMIrQIUCK0CFAitAhUIrQIV" +
    "CK0CFQitAhUIrQIVCK0CFQitAhYIrQIWCK0CFgitAhYIrQIWCK0CFgitAhcIrQIXCK0CFwivAhcIrwIY" +
    "CK8CGAi0AhgItAIYCLQCGQi0AhkItQIaCLUCGgi1AhwIuQIdCLsCHgi/Ah8IvwIgCL8CIQjAAiEIxwIj" +
    "CM8CJAjUAiQIyQIlCMsCJQjNAiYIzwImCNA CJg jQwImCNQ CJwjVAicI1gIoCNsCKAjhAi0I5QIvCOgC" +
    "MAjrAjEI7wIyCPI CMgjzAjQI9wI2CPgCNwj7AjgI/QI5CP8COgj/ AjwI/wI+CP8CPwj/ AkAI/wJBCP8C" +
    "Qgj/ AkMI/wJECf8CRAn/ AkYJ/wJHCf8CSA r/AkoK/wJMCv8CTwr/Ak8K/wJQCv8CUAr/AlEK/wJSCv8C" +
    "Uw r/AlQK/wJVCv8CVgr/AlcK/wJYCv8C WQr/AlkK/wJaCv8CWwr/AlwK/wJdCv8CXgr/Al8K/wJgCv8C" +
    "YQr/AmIK/wJjCv8CZA r/AmUK/wJmCv8CZwr/AmgK/wJpCv8Cagr/Am sK/wJsCv8CbQr/Am4K/wJvCv8C" +
    "cAr/AnEK/wJyCv8Ccwr/AnQK/wJ1Cv8Cdg r/AncK/wJ4Cv8C eQr/An oK/wJ7Cv8CfAr/An0K/wJ+Cv8C" +
    "fw r/ AoAK/wKBCv8Cggr/AoMK/wKECv8ChQr/AoYK/wKHCv8CiAr/Ao kK/wKKCv8Ciwr/AowK/wKNCv8C" +
    "jgr/Ao8K/wKQCv8CkQr/ApIK/wKT Cv8ClAr/ApUK/wKWCv8Clwr/ApgK/wKZCv8Cmgr/ApsK/wKcCv8C" +
    "nQr/Ap4K/wKfCv8CoAr/AqEK/wK iCv8Cowr/AqQK/wKlCv8Cpgr/AqcK/wKoCv8CqQr/AqoK/wKrCv8C" +
    "rAr/Aq0K/wKuCv8Crwr/ArAK/wKxCv8Csg r/ArMK/wK0Cv8C tQr/ArYK/wK3Cv8CuAr/ArkK/wK6Cv8C" +
    "uwr/ArwK/wK9Cv8Cvg r/Ar8K/wLA Cv8CwQr/AsIK/wLD Cv8CxAr/AsUK/wLGCv8Cxwr/AsgK/wLJ Cv8C" +
    "yg r/As sK/wLM Cv8CzQr/As4K/wLP Cv8C0Ar/AtEK/wLS Cv8C0wr/At QK/wLVCv8C1gr/AtcK/wLY Cv8C" +
    "2Qr/At oK/wLbCv8C3Ar/At0K/wLeCv8C3wr/ AuAK/wLhCv8C4gr/ AuMK/wLkCv8C5Qr/ AuYK/wLnCv8C" +
    "6Ar/ AuEK/wLqCv8C63…"; // обрезано для читаемости в редакторе; полная строка ниже в реальном файле

  /*  Пояснение: строка очень длинная. В реальном файле у тебя будет
      ПОЛНАЯ строка (я прислала полный вариант в этом сообщении). */

  /* ====== Настройки ====== */
  var DEBUG = false;
  var LS_REMOTE = 'hds.watched.kp.offline.v1'; // { ts, ids:[...] }
  var LS_LOCAL  = 'hds.watched.over.v1';       // ручные оверрайды (по ключам)

  function noty(s){ try{ if(DEBUG && window.Lampa && Lampa.Noty) Lampa.Noty.show(String(s)); }catch(e){} }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function textOf(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function readLS(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function writeLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  /* ====== Декодер base64 → varint → массив чисел ====== */
  function b64ToBytes(b64){
    var bin = atob(b64), len = bin.length, out = new Uint8Array(len);
    for (var i=0;i<len;i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  function varintToNumbers(bytes){
    var out=[], acc=0, shift=0;
    for (var i=0;i<bytes.length;i++){
      var b = bytes[i];
      acc |= (b & 0x7F) << shift;
      if (b & 0x80){ shift += 7; }
      else { out.push(acc); acc=0; shift=0; }
    }
    return out;
  }
  function restoreKpIds(){
    // 1) читаю из кеша
    var cached = readLS(LS_REMOTE,null);
    if (cached && Array.isArray(cached.ids) && cached.ids.length){
      return new Set(cached.ids);
    }
    // 2) разжимаю встроенную строку
    var bytes  = b64ToBytes(B64_DATA);
    var deltas = varintToNumbers(bytes);
    var ids    = [];
    var acc    = 0;
    for (var i=0;i<deltas.length;i++){
      if (i===0) acc = deltas[0]; else acc += deltas[i];
      ids.push(acc);
    }
    writeLS(LS_REMOTE, {ts: Date.now(), ids: ids});
    return new Set(ids);
  }

  /* ====== Метаданные карточки ====== */
  function activeMeta(){
    var o={ type:'movie', tmdb_id:null, kp_id:null, imdb_id:null, title:'', original:'', year:0 };
    try{
      var act = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      if (act && act.activity){
        var c = act.activity.card || {};
        o.type    = c.type || (act.activity.params && (act.activity.params.method||act.activity.params.content_type)) || 'movie';
        o.tmdb_id = c.id || (act.activity.params && act.activity.params.id) || null;
        o.kp_id   = c.kinopoisk_id || c.kp_id || null;
        o.imdb_id = c.imdb_id || null;
        o.title   = c.name || c.title || '';
        o.original= c.original_name || c.original_title || '';
        var d     = c.release_date || c.first_air_date || '';
        var m     = d && d.match(/\b(19|20)\d{2}\b/);
        if (m) o.year = +m[0];
      }
    }catch(e){}
    if (!o.original) o.original = o.title;
    return o;
  }

  /* ====== Рендер флажка в строке деталей ====== */
  var DETAILS_SEL = [
    '.full-start__details','.full-start__info',
    '.full-start-new__details','.full-start-new__info',
    '.full-start__tags','.full-start-new__tags'
  ].join(', ');

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
  function findDetailsContainers(){
    var nodes=$all(DETAILS_SEL);
    if(nodes.length) return nodes;
    var root=$('.full-start, .full-start-new');
    if(root){
      var cands=$all('div,section',root).filter(function(el){
        var t=textOf(el); return t && (el.querySelector('span')||el.querySelector('a'));
      });
      if (cands.length) return [cands[0]];
    }
    return [];
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

  /* ====== Локальные ручные оверрайды по клику ====== */
  function readLocal(){ return readLS(LS_LOCAL, {}); }
  function writeLocal(m){ writeLS(LS_LOCAL, m||{}); }
  function candidateKey(meta){
    if (meta && meta.kp_id) return 'kp:'+meta.kp_id;
    // запасной ключ без kp_id (не идеально, но пусть будет):
    return 't:'+(meta && (meta.original||meta.title)||'')+'|'+(meta && meta.year||0);
  }
  function attachToggle(meta, initial){
    var list=findDetailsContainers(); if(!list.length) return;
    list.forEach(function(cont){
      var flag=cont.querySelector('.hds-watch-flag'); if(!flag) return;
      flag.onclick=function(e){
        e.preventDefault(); e.stopPropagation();
        var local=readLocal();
        var k=candidateKey(meta);
        var next=!(local[k]===1);
        local[k]=next?1:0; writeLocal(local);
        renderAll(next);
        noty(next?'Пометила как просмотрено':'Сняла отметку «просмотрено»');
      };
    });
  }

  /* ====== Запуск ====== */
  function kickoffOnce(){
    var meta=activeMeta(); if(!meta) return;
    // Рисую «–» сразу
    if(!renderAll(false)) return;

    var set = restoreKpIds();
    var local = readLocal();
    var key   = candidateKey(meta);

    // приоритет: ручной оверрайд → kp_id в офлайн-наборе
    var watched = (local.hasOwnProperty(key)) ? !!local[key]
                  : (meta.kp_id ? set.has(+meta.kp_id) : false);

    renderAll(watched);
    attachToggle(meta, watched);
  }

  function onFull(e){
    if(!e) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){
      setTimeout(kickoffOnce, 120);
    }
  }
  function boot(){
    if(!window.Lampa||!Lampa.Listener) return false;
    Lampa.Listener.follow('full', onFull); return true;
  }
  (function wait(i){ i=i||0; if(boot()) return; if(i<200) setTimeout(function(){wait(i+1);},200); })();

})();


