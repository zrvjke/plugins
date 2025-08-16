/**
 * Lampa plugin: KP Cast via TMDB (v2.1.0 — fallback TMDB search)
 * Автор: Рома + твоя девочка :)
 *
 * Алгоритм:
 *  1) Пытаюсь достать TMDB id и тип (movie/tv) из Activity или URL.
 *  2) Если id нет — через Lampa.TMDB.api делаю TMDB search (movie/tv/multi) по названию(+варианты) и году,
 *     выбираю первый подходящий результат → получаю exact id+type.
 *  3) TMDB /external_ids → imdb_id.
 *  4) По imdb_id: api.kinopoisk.dev → kpId/persons; если kpId есть → staff с kinopoiskapiunofficial.tech.
 *  5) Если ничего — оставляю TMDb каст как есть.
 */

(function () {
  'use strict';

  /*** КЛЮЧИ / НАСТРОЙКИ ***/
  var KPU_API_KEY = 'dc9196ea-4cc8-48e8-8259-0cbdfa58eaf1'; // kinopoiskapiunofficial.tech
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';       // api.kinopoisk.dev
  var MAX_ACTORS  = 24;
  var CACHE_TTL   = 7 * 24 * 3600e3;
  var DEBUG       = true;

  var KPU_BASE = 'https://kinopoiskapiunofficial.tech';
  var DEV_BASE = 'https://api.kinopoisk.dev';
  var DETAILS  = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  /*** Утилиты ***/
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function rm(n){ if(n&&n.parentNode) n.parentNode.removeChild(n); }
  function noty(m){ try{ if(DEBUG && window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(m);}catch(e){} }
  function uniq(a){ var u=[],i; for(i=0;i<a.length;i++) if(a[i] && u.indexOf(a[i])<0) u.push(a[i]); return u; }

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
        x.onreadystatechange=function(){ if(x.readyState===4){ var s=x.status;
          if(s>=200&&s<300){ try{done(true,JSON.parse(x.responseText),s);}catch(e){done(false,'bad json',s);} }
          else done(false,'HTTP '+s,s);
        }};
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

  /*** Извлечение названий/года для поиска ***/
  function extractTitles(){
    var titles = [];
    var titleEl = $('.full-title, .full-start__title, .full-start-new__title, .full-title-name, .full__title, h1, h2');
    if (titleEl){
      var raw = txt(titleEl);
      if (raw){
        var parts = raw.split('/');
        if (parts.length>1){
          titles.push(parts[0].trim());
          titles.push(parts.slice(1).join('/').trim());
        } else titles.push(raw.trim());
      }
    }
    // оригинал/альт
    var cand = $$('[class*="original"],[class*="orig"],[data-original]');
    cand.forEach(function(n){ var t=txt(n); if(t) titles.push(t); });
    // alt постера
    var poster = $('img[alt], .full-poster img[alt], .full-start__left img[alt]');
    if (poster && poster.alt) titles.push(poster.alt);
    // подчистить и уникализировать
    titles = uniq(titles.map(function(t){ return t.replace(/\s*\(\d{4}\)\s*$/,'').replace(/\s*\[\d{4}\]\s*$/,'').trim(); })
                         .filter(function(t){ return t && t.length>0; }))
             .slice(0,6);
    if (DEBUG) noty('TMDB search titles → ' + titles.join(' | '));
    return titles;
  }
  function extractYear(){
    var year=''; var det=$(DETAILS);
    if(det){ var spans=$$('span',det); for(var i=0;i<spans.length;i++){ var s=txt(spans[i]); if(/^\d{4}$/.test(s)){ year=s; break; } } }
    if(!year && document.title){ var m=document.title.match(/\b(19|20)\d{2}\b/); if(m) year=m[0]; }
    return year;
  }

  /*** TMDB helpers (через встроенный прокси Лампы) ***/
  function tmdbApi(path, params){
    return new Promise(function(resolve,reject){
      if (!window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api !== 'function'){
        return reject('no-tmdb-proxy');
      }
      Lampa.TMDB.api(path, params || {}, function(json){ resolve(json||{}); }, function(){ reject('tmdb-error'); });
    });
  }

  function getCardFromActivity(){
    try{
      if (window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function'){
        var act = Lampa.Activity.active();
        if (act && act.activity){
          var p = act.activity.params || {};
          var id = p.id || (act.activity.card && act.activity.card.id) || null;
          var method = p.method || p.content_type || (act.activity.card && act.activity.card.type) || null;
          return { id: id, method: method };
        }
      }
    }catch(e){}
    // URL-хэш запасной
    var h = String(location.hash||'');
    var id  = (h.match(/[?&]id=(\d+)/)||[])[1] || null;
    var mth = (h.match(/[?&](?:method|content_type)=(movie|tv)/)||[])[1] || null;
    return { id:id, method:mth };
  }

  function resolveTmdbId(){
    var card = getCardFromActivity();
    if (card.id && card.method){
      if (DEBUG) noty('TMDB from Activity: ' + card.method + ' #' + card.id);
      return Promise.resolve(card);
    }
    // fallback: TMDB search
    var titles = extractTitles();
    var year   = extractYear();

    function tryMovie(q){
      return tmdbApi('search/movie', { query:q, include_adult:false, year:year||undefined, language:'ru-RU' })
        .then(function(res){ var r=(res&&res.results)||[]; return r.length ? {method:'movie', id:r[0].id} : null; })
        .catch(function(){ return null; });
    }
    function tryTV(q){
      return tmdbApi('search/tv', { query:q, include_adult:false, first_air_date_year:year||undefined, language:'ru-RU' })
        .then(function(res){ var r=(res&&res.results)||[]; return r.length ? {method:'tv', id:r[0].id} : null; })
        .catch(function(){ return null; });
    }
    function tryMulti(q){
      return tmdbApi('search/multi', { query:q, include_adult:false, language:'ru-RU' })
        .then(function(res){
          var r=(res&&res.results)||[];
          for (var i=0;i<r.length;i++){
            if (r[i].media_type==='movie' || r[i].media_type==='tv') return {method:r[i].media_type, id:r[i].id};
          }
          return null;
        })
        .catch(function(){ return null; });
    }

    // перебираем названия: movie -> tv -> multi
    var chain = Promise.resolve(null);
    titles.forEach(function(q){
      chain = chain.then(function(found){
        if (found) return found;
        if (DEBUG) noty('TMDB search «'+q+'»');
        return tryMovie(q).then(function(res){ return res || tryTV(q); })
                          .then(function(res){ return res || tryMulti(q); });
      });
    });

    return chain.then(function(found){
      if (found){ if (DEBUG) noty('TMDB resolved: '+found.method+' #'+found.id); return found; }
      throw 'tmdb-not-found';
    });
  }

  /*** Поиск секции «Актёры» ***/
  var RE_ACTORS = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  function findActorsSection(){
    var nodes=$$('h1,h2,h3,h4,h5,h6,div,span,p'), head=null, i,n,val;
    for(i=0;i<nodes.length;i++){ n=nodes[i]; val=norm(txt(n)); if(val && RE_ACTORS.test(val)){ head=n; break; } }
    var sec=null;
    if(head){
      var up=head,steps=0;
      while(up&&steps++<10){ if(up.parentElement&&(up.previousElementSibling||up.nextElementSibling)) break; up=up.parentElement; }
      sec=up||head;
    }
    if(!sec){
      var candidates=$$('.full-persons, .persons, .full-section, .full-start__persons, .full-start-new__persons');
      if(candidates.length) sec=candidates[0];
    }
    if(!sec){
      var full = $('.full, .full-start, .full-start-new') || document.body;
      var lists = $$('[class*="person"],[class*="persons"],[class*="people"],[class*="cast"],[class*="actors"]', full);
      var best=null, bestCount=0;
      for(i=0;i<lists.length;i++){
        var count = $$('img, a, div', lists[i]).length;
        if(count>bestCount){ best=lists[i]; bestCount=count; }
      }
      if(best) sec=best.closest('.full-section, .full-start__block, .full-start-new__block') || best.parentElement || best;
    }
    return sec;
  }

  /*** Маппинг актёров ***/
  function mapActorsFromKPU(staff){
    var OK = ['ACTOR','HIMSELF','HERSELF','SELF','VOICE','VOICE_MALE','VOICE_FEMALE'];
    return (staff||[]).filter(function(p){ return OK.indexOf((p.professionKey||'').toUpperCase())!==-1; })
      .map(function(p){ return { name: p.nameRu||p.nameEn||'Без имени', role: p.description||'', img: p.posterUrl||'' }; });
  }
  function mapActorsFromDEV(persons){
    return (persons||[]).filter(function(p){
      var prof=((p.profession||'')+' '+(p.enProfession||'')).toLowerCase();
      return /actor|акт|voice/.test(prof);
    }).map(function(p){
      return { name:p.name||p.enName||p.alternativeName||'Без имени', role:p.description||p.character||'', img:p.photo||'' };
    });
  }

  /*** Рендер ***/
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
    if(!mapped || !mapped.length){ noty('KP: пустой список актёров'); return false; }

    var toHide=$$('[class*="person"],[class*="actors"],[class*="cast"],[class*="cards"],[class*="list"],[class*="scroll"]', sec);
    uniq(toHide).forEach(function(el){ el.style.display='none'; });

    var head = $$('h1,h2,h3,h4,h5,h6,div,span,p', sec).find(function(el){ return RE_ACTORS.test(norm(txt(el)))||/actors|cast/i.test(el.className||''); });
    if(head && !$('.kp-cast-badge', head)){
      var b=document.createElement('span'); b.className='kp-cast-badge'; b.textContent='('+ (badge||'Кинопоиск') +')'; head.appendChild(b);
    }
    var old = $('.kp-actors-grid', sec); if(old) rm(old);

    var wrap=document.createElement('div'); wrap.innerHTML=gridHTML(mapped);
    var grid=wrap.firstChild; if(grid) sec.appendChild(grid);

    try{
      if(window.Lampa){ if(Lampa.Controller && Lampa.Controller.update) Lampa.Controller.update(); if(Lampa.Scroll && Lampa.Scroll.update) Lampa.Scroll.update(); }
      void document.body.offsetHeight; window.dispatchEvent(new Event('resize'));
    }catch(e){}

    noty('Вставила '+mapped.length+' актёров ('+badge+')');
    return true;
  }

  /*** API ***/
  // KPU
  function kpu_staff(kpId){
    var url = KPU_BASE + '/api/v1/staff?filmId='+encodeURIComponent(kpId);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  // DEV
  function dev_byImdb(imdb){
    var url = DEV_BASE + '/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)
            + '&limit=1&selectFields=id&selectFields=kpId&selectFields=persons';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_full(id){
    var url = DEV_BASE + '/v1.4/movie/'+encodeURIComponent(id)+'?selectFields=persons&selectFields=id&selectFields=kpId';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }

  /*** Главный поток ***/
  function runOnce(){
    injectCssOnce();

    resolveTmdbId().then(function(found){
      // 1) берём imdb_id у TMDB
      return tmdbApi(found.method + '/' + found.id + '/external_ids', {}).then(function(json){
        var imdb = json && (json.imdb_id || json.imdbId);
        if (!imdb){ noty('TMDB: imdb_id не найден'); return null; }
        noty('IMDb: ' + imdb);
        return { imdb: imdb };
      });
    }).then(function(state){
      if (!state || !state.imdb) return;

      // 2) DEV → kpId/persons
      return dev_byImdb(state.imdb).then(function(r){
        if (!r.ok) throw r;
        var doc = r.data && r.data.docs && r.data.docs[0];
        var kpId = doc && (doc.kpId || doc.id);
        var devPersons = mapActorsFromDEV(doc && doc.persons || []);

        if (kpId){
          // 3) staff от KPU предпочтительно
          return kpu_staff(kpId).then(function(rr){
            if (rr.ok){
              var mapped = mapActorsFromKPU(rr.data || []);
              if (mapped.length){ replaceActorsSection(mapped, 'KP Unofficial'); return; }
            }
            if (devPersons.length){ replaceActorsSection(devPersons, 'Кинопоиск DEV'); return; }
            noty('KP: не нашла актёров — TMDb остаётся');
          });
        } else {
          if (devPersons.length){ replaceActorsSection(devPersons, 'Кинопоиск DEV'); return; }
          // добивка, если списочный метод DEV не вернул persons
          if (doc && (doc.id || doc.kpId)){
            return dev_full(doc.id || doc.kpId).then(function(fr){
              if (!fr.ok) throw fr;
              var mapped2 = mapActorsFromDEV(fr.data && fr.data.persons || []);
              if (mapped2.length){ replaceActorsSection(mapped2, 'Кинопоиск DEV'); }
              else noty('KP: не нашла актёров — TMDb остаётся');
            });
          }
          noty('KP: не нашла актёров — TMDb остаётся');
        }
      });
    }).catch(function(err){
      if (DEBUG) noty('Ошибка цепочки: '+(err&&err.toString?err.toString():String(err)));
    });
  }

  /*** Инициализация ***/
  function onFull(e){
    if(!e||!e.type) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){ setTimeout(runOnce, 220); }
  }
  function subscribe(){
    if(typeof window==='undefined'||typeof window.Lampa==='undefined'||!window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', onFull);
    setTimeout(runOnce, 600); // если карточка уже открыта
    return true;
  }
  (function wait(i){ i=i||0; if(subscribe()) return; if(i<200) setTimeout(function(){wait(i+1)},200); else setTimeout(runOnce,800); })();

})();

