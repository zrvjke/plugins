/**
 * Lampa plugin: KP Cast Override (v1.5.1 KPU->DEV->KPU)
 * Автор: Рома + твоя девочка :)
 *
 * Порядок источников:
 *   1) kinopoiskapiunofficial.tech (по названию/году)
 *   2) api.kinopoisk.dev (по IMDb/названию) -> получить kpId
 *   3) kinopoiskapiunofficial.tech /v1/staff по kpId (если п.1 не дал)
 *   4) api.kinopoisk.dev persons (как финальный резерв)
 *
 * Если в итоге ничего — оставляю TMDb-каст нетронутым.
 */

(function () {
  'use strict';

  /*** ====== КЛЮЧИ И НАСТРОЙКИ ====== ***/
  var KPU_API_KEY = 'dc9196ea-4cc8-48e8-8259-0cbdfa58eaf1';      // твой KPU
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';            // твой DEV
  var MAX_ACTORS  = 24;
  var CACHE_TTL   = 7 * 24 * 3600e3;                              // 7 дней
  var DEBUG       = false;                                        // true — включить Lampa.Noty

  var KPU_BASE = 'https://kinopoiskapiunofficial.tech';
  var DEV_BASE = 'https://api.kinopoisk.dev';
  var DETAILS  = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  /*** ====== УТИЛИТЫ ====== ***/
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$ (sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function rm(n){ if(n&&n.parentNode) n.parentNode.removeChild(n); }
  function noty(m){ try{ if(DEBUG && window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(m);}catch(e){} }
  function uniq(arr){ var u=[],i; for(i=0;i<arr.length;i++) if(u.indexOf(arr[i])<0) u.push(arr[i]); return u; }

  function fetchJSON(url, headers){
    return new Promise(function(resolve,reject){
      function done(ok,data,status){ ok?resolve({ok:true,data:data,status:status}):reject({ok:false,error:data,status:status}); }
      if (typeof fetch==='function'){
        fetch(url,{headers:headers||{'accept':'application/json'}})
          .then(function(r){ var s=r.status; if(!r.ok) return r.text().then(function(t){done(false,t||('HTTP '+s),s)}); return r.json().then(function(j){done(true,j,s)}); })
          .catch(function(e){ done(false, e && (e.message||String(e)) || 'network', 0); });
      } else {
        var x=new XMLHttpRequest(); x.open('GET',url,true);
        if(headers) for(var k in headers){ try{x.setRequestHeader(k,headers[k]);}catch(e){} }
        x.onreadystatechange=function(){
          if(x.readyState===4){ var s=x.status;
            if(s>=200&&s<300){ try{done(true,JSON.parse(x.responseText),s);}catch(e){done(false,'bad json',s);} }
            else done(false,'HTTP '+s,s);
          }
        };
        x.onerror=function(){ done(false,'network',0); };
        x.send();
      }
    });
  }

  // кэш
  function cget(key){
    try{ var raw=localStorage.getItem(key); if(!raw) return null;
      var obj=JSON.parse(raw); if(!obj||!obj.t) return null;
      if(Date.now()-obj.t>CACHE_TTL){ localStorage.removeItem(key); return null; }
      return obj.v;
    }catch(e){ return null; }
  }
  function cset(key,val){ try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), v:val})); }catch(e){} }

  /*** ====== ВЫДИРАНИЕ МЕТЫ ИЗ КАРТОЧКИ ====== ***/
  function extractImdb(){
    var a=document.querySelector('a[href*="imdb.com/title/tt"]'); if(a&&a.href){ var m=a.href.match(/tt\d{6,9}/i); if(m) return m[0].toLowerCase(); }
    var m2=document.body.innerText.match(/tt\d{6,9}/i); if(m2) return m2[0].toLowerCase();
    var e=document.querySelector('[data-imdb],[data-imdb-id]'); if(e){ var v=e.getAttribute('data-imdb')||e.getAttribute('data-imdb-id')||''; if(/tt\d{6,9}/i.test(v)) return v.toLowerCase(); }
    return null;
  }
  function extractTitleYear(){
    var tEl=$('.full-title, .full-start__title, .full-start-new__title, .full-title-name, .full__title, h1, h2');
    var title = tEl ? txt(tEl) : '';
    if(title){
      title=title.replace(/\s*\/\s*.+$/,'').replace(/\s*\(\d{4}\)\s*$/,'').replace(/\s*\[\d{4}\]\s*$/,'').trim();
    }
    var year=''; var det=$(DETAILS);
    if(det){ var spans=$$('span',det); for(var i=0;i<spans.length;i++){ var s=txt(spans[i]); if(/^\d{4}$/.test(s)){ year=s; break; } } }
    if(!year && document.title){ var m=document.title.match(/\b(19|20)\d{2}\b/); if(m) year=m[0]; }
    return {title:title, year:year};
  }

  /*** ====== ПОИСК КОНТЕЙНЕРА «АКТЁРЫ» ====== ***/
  var RE_ACTORS = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;

  function findActorsSection(){
    // 1) типичный заголовок
    var nodes=$$('h1,h2,h3,h4,h5,h6,div,span,p'), head=null, i,n,val;
    for(i=0;i<nodes.length;i++){ n=nodes[i]; val=norm(txt(n)); if(val && RE_ACTORS.test(val)){ head=n; break; } }
    var sec=null;
    if(head){
      var up=head,steps=0;
      while(up&&steps++<10){ if(up.parentElement&&(up.previousElementSibling||up.nextElementSibling)) break; up=up.parentElement; }
      sec=up||head;
    }
    // 2) запасные эвристики: блоки с карточками персон
    if(!sec){
      var candidates=$$('.full-persons, .persons, .full-section, .full-start__persons, .full-start-new__persons');
      if(candidates.length) sec=candidates[0];
    }
    // 3) ещё попытка: ищем грид/скролл людей внутри «full»
    if(!sec){
      var full = $('.full, .full-start, .full-start-new') || document.body;
      var lists = $$('[class*="person"],[class*="persons"],[class*="people"],[class*="cast"],[class*="actors"]', full);
      // берём контейнер с максимальным количеством карточек
      var best=null, bestCount=0;
      for(i=0;i<lists.length;i++){
        var count = $$('img, a, div', lists[i]).length;
        if(count>bestCount){ best=lists[i]; bestCount=count; }
      }
      if(best) sec=best.closest('.full-section, .full-start__block, .full-start-new__block') || best.parentElement || best;
    }
    return sec;
  }

  /*** ====== МАППИНГ АКТЁРОВ ====== ***/
  function mapActorsFromKPU(staff){
    return (staff||[]).filter(function(p){ return (p.professionKey||'').toUpperCase()==='ACTOR'; })
      .map(function(p){ return { name: p.nameRu || p.nameEn || 'Без имени', role: p.description||'', img: p.posterUrl||'' }; });
  }
  function mapActorsFromDEV(persons){
    return (persons||[]).filter(function(p){ var prof=((p.profession||'')+' '+(p.enProfession||'')).toLowerCase(); return /actor|акт/.test(prof); })
      .map(function(p){ return { name: p.name||p.enName||p.alternativeName||'Без имени', role: p.description||p.character||'', img: p.photo||'' }; });
  }

  /*** ====== РЕНДЕР ====== ***/
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function gridHTML(list){
    list=(list||[]).slice(0,MAX_ACTORS); if(!list.length) return '';
    var h='<div class="kp-actors-grid">'; for(var i=0;i<list.length;i++){ var p=list[i];
      h+='<div class="kp-actor">'+
           (p.img?'<img class="kp-actor__img" loading="lazy" src="'+escapeHtml(p.img)+'" alt="'+escapeHtml(p.name)+'">':'<div class="kp-actor__img" style="background:#2d2d2d;"></div>')+
           '<div class="kp-actor__name">'+escapeHtml(p.name)+'</div>'+
           (p.role?'<div class="kp-actor__role">'+escapeHtml(p.role)+'</div>':'')+
         '</div>';
    } return h+'</div>';
  }
  function injectCssOnce(){
    if($('#kp-cast-css')) return;
    var s=document.createElement('style'); s.id='kp-cast-css'; s.type='text/css';
    s.textContent='.kp-actors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:12px;margin-top:8px}'
                 +'.kp-actor{display:flex;flex-direction:column;align-items:center;text-align:center}'
                 +'.kp-actor__img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px}'
                 +'.kp-actor__name{margin-top:6px;font-size:13px;line-height:1.25;font-weight:600}'
                 +'.kp-actor__role{margin-top:2px;font-size:12px;opacity:.7}'
                 +'.kp-cast-badge{font-size:11px;opacity:.65;margin-left:6px}';
    document.head.appendChild(s);
  }

  function replaceActorsSection(mapped, badge){
    var sec=findActorsSection(); if(!sec){ noty('KP: не нашла секцию «Актёры»'); return false; }
    if(!mapped || !mapped.length){ noty('KP: пусто'); return false; }

    // Скрываю только явные гриды актёров
    var toHide=$$('[class*="person"],[class*="actors"],[class*="cast"],[class*="cards"],[class*="list"],[class*="scroll"]', sec);
    uniq(toHide).forEach(function(el){ el.style.display='none'; });

    // бейдж к заголовку
    var head = $$('h1,h2,h3,h4,h5,h6,div,span,p', sec).find(function(el){ return RE_ACTORS.test(norm(txt(el)))||/actors|cast/i.test(el.className||''); });
    if(head && !$('.kp-cast-badge', head)){
      var b=document.createElement('span'); b.className='kp-cast-badge'; b.textContent='('+ (badge||'Кинопоиск') +')'; head.appendChild(b);
    }

    // удалить старую мою сетку
    var old = $('.kp-actors-grid', sec); if(old) rm(old);

    var wrap=document.createElement('div'); wrap.innerHTML=gridHTML(mapped);
    var grid=wrap.firstChild; if(grid) sec.appendChild(grid);

    try{
      if(window.Lampa){ if(Lampa.Controller && Lampa.Controller.update) Lampa.Controller.update(); if(Lampa.Scroll && Lampa.Scroll.update) Lampa.Scroll.update(); }
      void document.body.offsetHeight; window.dispatchEvent(new Event('resize'));
    }catch(e){}

    noty('KP: актёры заменены ('+badge+')');
    return true;
  }

  /*** ====== API ВЫЗОВЫ ====== **/
  // KPU
  function kpu_search(title,page){
    var url = KPU_BASE + '/api/v2.1/films/search-by-keyword?keyword='+encodeURIComponent(title)+'&page='+(page||1);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  function kpu_staff(kpId){
    var url = KPU_BASE + '/api/v1/staff?filmId='+encodeURIComponent(kpId);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  // DEV
  function dev_byImdb(imdb){
    var url = DEV_BASE + '/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)
            + '&limit=1&selectFields=id&selectFields=year&selectFields=name&selectFields=enName&selectFields=persons';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_search(title){
    var url = DEV_BASE + '/v1.4/movie/search?query='+encodeURIComponent(title)
            + '&page=1&limit=10&selectFields=id&selectFields=year&selectFields=name&selectFields=enName';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_full(id){
    var url = DEV_BASE + '/v1.4/movie/'+encodeURIComponent(id)+'?selectFields=persons&selectFields=id&selectFields=year&selectFields=name';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }

  /*** ====== ПОЛУЧЕНИЕ КАСТА (KPU->DEV->KPU->DEV) ====== **/
  function getFromKPU(title, year){
    if(!title) return Promise.resolve(null);
    var ckey='kpu_cast_'+norm(title)+'_'+(year||''); var c=cget(ckey); if(c) return Promise.resolve(c);
    return kpu_search(title,1).then(function(r){
      if(!r.ok) throw r;
      var films = (r.data&&r.data.films)||r.data||[];
      if(!films.length) return null;
      // выбрать по году
      var yy=parseInt(year||'0',10), pick=null;
      if(yy){ for(var i=0;i<films.length;i++){ var fy=films[i].year||films[i].filmYear||films[i].startYear||0; if(fy===yy){ pick=films[i]; break; } } }
      pick = pick || films[0];
      var kpId = pick.kinopoiskId||pick.filmId||pick.kinopoiskID||pick.id;
      if(!kpId) return null;
      return kpu_staff(kpId).then(function(rr){
        if(!rr.ok) throw rr;
        var mapped = mapActorsFromKPU(rr.data||[]);
        cset(ckey,mapped); return mapped;
      });
    });
  }

  function getFromDEV(imdb, title, year){
    var ckey = 'dev_cast_' + (imdb?('imdb_'+imdb.toLowerCase()):('title_'+norm(title||'')+'_'+(year||'')));
    var c=cget(ckey); if(c) return Promise.resolve({mapped:c, id:null});
    var chain = Promise.resolve(null);
    if(imdb){
      chain = dev_byImdb(imdb).then(function(r){
        if(!r.ok) throw r;
        var doc=(r.data&&r.data.docs&&r.data.docs[0])||null;
        var persons = doc && doc.persons || [];
        var mapped = mapActorsFromDEV(persons);
        var id = doc && doc.id || null;
        if(!mapped.length && id){
          return dev_full(id).then(function(rr){
            if(!rr.ok) throw rr;
            var mapped2 = mapActorsFromDEV((rr.data&&rr.data.persons)||[]);
            cset(ckey,mapped2); return {mapped:mapped2,id:id};
          });
        }
        cset(ckey,mapped); return {mapped:mapped,id:id};
      });
    } else if (title){
      chain = dev_search(title).then(function(r){
        if(!r.ok) throw r;
        var docs=(r.data&&r.data.docs)||[];
        if(!docs.length) return {mapped:[], id:null};
        var yy=parseInt(year||'0',10), pick=null; if(yy){ for(var i=0;i<docs.length;i++){ if(docs[i].year===yy){ pick=docs[i]; break; } } }
        pick = pick || docs[0];
        return dev_full(pick.id).then(function(rr){
          if(!rr.ok) throw rr;
          var mapped = mapActorsFromDEV((rr.data&&rr.data.persons)||[]);
          cset(ckey,mapped); return {mapped:mapped, id: pick.id};
        });
      });
    }
    return chain;
  }

  /*** ====== ГЛАВНАЯ ЛОГИКА ====== **/
  function runOnce(){
    injectCssOnce();

    var imdb = extractImdb();
    var meta  = extractTitleYear();

    // 1) Сначала KPU (прямо по названию/году)
    getFromKPU(meta.title, meta.year).then(function(m1){
      if(m1 && m1.length){ replaceActorsSection(m1, 'KP Unofficial'); return; }

      // 2) DEV: добыть id +, если повезёт, persons
      return getFromDEV(imdb, meta.title, meta.year).then(function(rdev){
        var mappedDEV = rdev && rdev.mapped || [];
        var kpId      = rdev && rdev.id || null;

        // 3) Попробовать ещё раз KPU/staff по найденному kpId
        if (kpId){
          return kpu_staff(kpId).then(function(rr){
            if(rr.ok){
              var mappedKPU = mapActorsFromKPU(rr.data||[]);
              if(mappedKPU.length){ replaceActorsSection(mappedKPU, 'KP Unofficial'); return; }
            }
            // 4) Иначе — хоть DEV-persons покажем
            if(mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return; }
            noty('KP: не нашла актёров — TMDb остаётся');
          }).catch(function(){
            if(mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return; }
            noty('KP: не нашла актёров — TMDb остаётся');
          });
        } else {
          if(mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return; }
          noty('KP: не нашла актёров — TMDb остаётся');
        }
      });
    }).catch(function(err){
      noty('KP/KPU ошибка: '+(err && (err.status||err.error||'')));
    });
  }

  /*** ====== ИНИТ ====== **/
  function onFull(e){
    if(!e||!e.type) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){ setTimeout(runOnce, 160); }
  }
  function subscribe(){
    if(typeof window==='undefined'||typeof window.Lampa==='undefined'||!window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', onFull);
    setTimeout(runOnce, 380);
    return true;
  }
  (function wait(i){ i=i||0; if(subscribe()) return; if(i<200) setTimeout(function(){wait(i+1)},200); else setTimeout(runOnce,500); })();

})();

