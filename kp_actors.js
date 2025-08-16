/**
 * Lampa plugin: KP Cast Override (v1.7.0 — multi-title, translit, verbose debug)
 * Автор: Рома + твоя девочка :)
 *
 * Порядок:
 *  0) Пытаюсь вынуть kpId прямо из DOM → KPU /v1/staff.
 *  1) KPU: поиск по наборам названий (ru, original, alt, poster alt, translit, англ.синонимы) + год → staff.
 *  2) DEV: поиск по тем же наборам (или IMDb, если нашёлся) → persons и/или kpId.
 *     2a) Если появился kpId — ещё раз KPU /v1/staff по нему (предпочтительнее), иначе показываю DEV persons.
 *  3) Если пусто — оставляю TMDb.
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
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

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

  /*** Извлечение меты ***/
  function extractImdb(){
    var a=document.querySelector('a[href*="imdb.com/title/tt"]'); if(a&&a.href){ var m=a.href.match(/tt\d{6,9}/i); if(m) return m[0].toLowerCase(); }
    var m2=document.body.innerText.match(/tt\d{6,9}/i); if(m2) return m2[0].toLowerCase();
    var e=document.querySelector('[data-imdb],[data-imdb-id]'); if(e){ var v=e.getAttribute('data-imdb')||e.getAttribute('data-imdb-id')||''; if(/tt\d{6,9}/i.test(v)) return v.toLowerCase(); }
    return null;
  }
  function extractKpIdFromDOM(){
    var el = document.querySelector('[data-kp],[data-kpid],[data-kinopoisk],[data-kp-id]');
    if (el){
      var v = el.getAttribute('data-kp')||el.getAttribute('data-kpid')||el.getAttribute('data-kinopoisk')||el.getAttribute('data-kp-id');
      if (v && /^\d{3,9}$/.test(v)) return v;
    }
    var links = $$('a[href*="kinopoisk."]');
    for (var i=0;i<links.length;i++){
      var h = links[i].href||'';
      var m = h.match(/kinopoisk\.(?:ru|by|kz)\/(?:film|series|name)\/(\d{3,9})/i);
      if (m) return m[1];
    }
    var m2 = document.body.innerText.match(/\bKP(?:ID)?[:\s#-]*?(\d{3,9})\b/i);
    if (m2) return m2[1];
    return null;
  }
  function extractTitles(){
    var titles = [];
    var titleEl = $('.full-title, .full-start__title, .full-start-new__title, .full-title-name, .full__title, h1, h2');
    if (titleEl){
      var raw = txt(titleEl);
      if (raw){
        // «Русское / Original»
        var parts = raw.split('/');
        if (parts.length>1){
          titles.push(parts[0].trim());
          titles.push(parts.slice(1).join('/').trim());
        } else titles.push(raw.trim());
      }
    }
    // оригинал отдельно
    var cand = $$('[class*="original"],[class*="orig"],[data-original]');
    cand.forEach(function(n){ var t=txt(n); if(t) titles.push(t); });
    // alt у постера
    var poster = $('img[alt], .full-poster img[alt], .full-start__left img[alt]');
    if (poster && poster.alt) titles.push(poster.alt);

    // подчистить
    titles = titles.map(function(t){ return t.replace(/\s*\(\d{4}\)\s*$/,'').replace(/\s*\[\d{4}\]\s*$/,'').trim(); })
                   .filter(function(t){ return t && t.length>0; });

    // транслитерация (для рус. однословных)
    function translit(s){
      var a={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
      return s.toLowerCase().replace(/[а-яё]/g,function(ch){return a[ch]||ch;}).replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    }
    var more = [];
    titles.forEach(function(t){
      if (/[а-яё]/i.test(t)) more.push(translit(t));
    });

    // частые однословные карты -> англ. синонимы
    var synonyms = {
      'ограбление':['heist','robbery'],
      'вторжение':['invasion'],
      'искупление':['redemption'],
      'побег':['escape','breakout']
    };
    titles.forEach(function(t){
      var k = norm(t);
      if (synonyms[k]) Array.prototype.push.apply(more, synonyms[k]);
    });

    titles = uniq(titles.concat(more)).slice(0,6); // не плодим слишком много
    if (DEBUG) noty('KP: к поиску названий → ' + titles.join(' | '));
    return titles;
  }
  function extractYear(){
    var year=''; var det=$(DETAILS);
    if(det){ var spans=$$('span',det); for(var i=0;i<spans.length;i++){ var s=txt(spans[i]); if(/^\d{4}$/.test(s)){ year=s; break; } } }
    if(!year && document.title){ var m=document.title.match(/\b(19|20)\d{2}\b/); if(m) year=m[0]; }
    return year;
  }

  /*** Поиск «Актёры» ***/
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
    return (persons||[]).filter(function(p){ var prof=((p.profession||'')+' '+(p.enProfession||'')).toLowerCase(); return /actor|акт|voice/.test(prof); })
      .map(function(p){ return { name:p.name||p.enName||p.alternativeName||'Без имени', role:p.description||p.character||'', img:p.photo||'' }; });
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
  function kpu_search(title,page){
    var url = KPU_BASE + '/api/v2.1/films/search-by-keyword?keyword='+encodeURIComponent(title)+'&page='+(page||1);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  // DEV
  function dev_byImdb(imdb){
    var url = DEV_BASE + '/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)
            + '&limit=1&selectFields=id&selectFields=kpId&selectFields=year&selectFields=name&selectFields=enName&selectFields=persons';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_search(title){
    var url = DEV_BASE + '/v1.4/movie/search?query='+encodeURIComponent(title)
            + '&page=1&limit=10&selectFields=id&selectFields=kpId&selectFields=year&selectFields=name&selectFields=enName';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_full(id){
    var url = DEV_BASE + '/v1.4/movie/'+encodeURIComponent(id)+'?selectFields=persons&selectFields=id&selectFields=kpId&selectFields=year&selectFields=name';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }

  /*** Получение с KPU ***/
  function getKPUByKpId(kpId){
    if(!kpId) return Promise.resolve(null);
    var ckey='kpu_staff_'+kpId, c=cget(ckey); if(c) { noty('KPU staff (кэш) kpId='+kpId+' актёров: '+c.length); return Promise.resolve(c); }
    noty('KPU staff по kpId='+kpId);
    return kpu_staff(kpId).then(function(r){
      if(!r.ok) throw r;
      var mapped = mapActorsFromKPU(r.data||[]);
      noty('KPU staff вернул актёров: '+mapped.length);
      cset(ckey, mapped);
      return mapped;
    });
  }
  function getKPUByTitles(titles, year){
    if(!titles || !titles.length) return Promise.resolve(null);
    var tryOne = function(q){
      var ckey='kpu_cast_'+q+'_'+(year||''), c=cget(ckey); if(c){ noty('KPU «'+q+'» (кэш) → '+c.length); return Promise.resolve(c); }
      noty('KPU поиск «'+q+'»'+(year?(' ('+year+')'):''));
      return kpu_search(q,1).then(function(r){
        if(!r.ok) throw r;
        var films=(r.data&&r.data.films)||r.data||[];
        noty('KPU «'+q+'»: найдено фильмов '+films.length);
        if(!films.length) return null;
        var yy=parseInt(year||'0',10), pick=null;
        if(yy){
          for(var i=0;i<films.length;i++){ var f=films[i], fy=f.year||f.filmYear||f.startYear||0; if(fy===yy){ pick=f; break; } }
        }
        pick = pick || films[0];
        var kpId = pick.kinopoiskId||pick.filmId||pick.kinopoiskID||pick.id;
        if(!kpId) return null;
        return getKPUByKpId(kpId).then(function(mapped){ if(mapped && mapped.length) cset(ckey, mapped); return mapped; });
      });
    };
    // пробуем последовательно
    return titles.reduce(function(p,q){
      return p.then(function(res){ if(res && res.length) return res; return tryOne(q).catch(function(){ return null; }); });
    }, Promise.resolve(null));
  }

  /*** Получение с DEV ***/
  function getDEV(imdb, titles, year){
    // сначала IMDb, если есть
    if (imdb){
      noty('DEV по IMDb: '+imdb);
      return dev_byImdb(imdb).then(function(r){
        if(!r.ok) throw r;
        var doc=(r.data&&r.data.docs&&r.data.docs[0])||null;
        var persons = doc && doc.persons || [];
        var mapped = mapActorsFromDEV(persons);
        var kpId = (doc && (doc.kpId || doc.id)) || null;
        if(mapped.length){ noty('DEV persons по IMDb: '+mapped.length); return {mapped:mapped,kpId:kpId}; }
        if(kpId){
          return dev_full(kpId).then(function(rr){
            if(!rr.ok) throw rr;
            var mapped2 = mapActorsFromDEV((rr.data&&rr.data.persons)||[]);
            noty('DEV full по kpId '+kpId+': '+mapped2.length);
            return {mapped:mapped2,kpId:kpId};
          });
        }
        return {mapped:[],kpId:null};
      }).catch(function(){ return {mapped:[],kpId:null}; });
    }

    // иначе перебор названий
    function tryTitle(q){
      noty('DEV поиск «'+q+'»');
      return dev_search(q).then(function(r){
        if(!r.ok) throw r;
        var docs=(r.data&&r.data.docs)||[];
        noty('DEV «'+q+'»: найдено '+docs.length);
        if(!docs.length) return {mapped:[],kpId:null};
        var yy=parseInt(year||'0',10), pick=null; if(yy){ for(var i=0;i<docs.length;i++){ if(docs[i].year===yy){ pick=docs[i]; break; } } }
        pick = pick || docs[0];
        var id = pick.kpId || pick.id;
        return dev_full(id).then(function(rr){
          if(!rr.ok) throw rr;
          var mapped = mapActorsFromDEV((rr.data&&rr.data.persons)||[]);
          noty('DEV full '+id+': '+mapped.length);
          return {mapped:mapped,kpId:id};
        });
      }).catch(function(){ return {mapped:[],kpId:null}; });
    }

    return titles.reduce(function(p,q){
      return p.then(function(res){ if(res && (res.mapped||[]).length) return res; return tryTitle(q); });
    }, Promise.resolve({mapped:[],kpId:null}));
  }

  /*** Основной поток ***/
  function runOnce(){
    injectCssOnce();

    var imdb = extractImdb();
    var kpIdDom = extractKpIdFromDOM();
    var titles = extractTitles();
    var year   = extractYear();

    // 0) kpId из DOM → staff
    var start = Promise.resolve(null);
    if (kpIdDom){
      noty('Нашла kpId в DOM: '+kpIdDom);
      start = getKPUByKpId(kpIdDom).then(function(m){ if(m && m.length){ replaceActorsSection(m, 'KP Unofficial'); return 'done'; } return null; })
                                   .catch(function(){ return null; });
    }

    start.then(function(flag){
      if (flag==='done') return;

      // 1) KPU по наборам названий
      return getKPUByTitles(titles, year).then(function(m1){
        if (m1 && m1.length){ replaceActorsSection(m1, 'KP Unofficial'); return 'done'; }

        // 2) DEV (IMDb/названия) → persons/kpId; если kpId — повторное KPU
        return getDEV(imdb, titles, year).then(function(rdev){
          var mappedDEV = rdev && rdev.mapped || [];
          var kpId      = rdev && rdev.kpId || null;

          if (kpId){
            return getKPUByKpId(kpId).then(function(m2){
              if (m2 && m2.length){ replaceActorsSection(m2, 'KP Unofficial'); return 'done'; }
              if (mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return 'done'; }
              noty('KP: не нашла актёров — TMDb остаётся'); return 'done';
            }).catch(function(){
              if (mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return 'done'; }
              noty('KP: не нашла актёров — TMDb остаётся'); return 'done';
            });
          } else {
            if (mappedDEV.length){ replaceActorsSection(mappedDEV, 'Кинопоиск DEV'); return 'done'; }
            noty('KP: не нашла актёров — TMDb остаётся'); return 'done';
          }
        });
      });
    }).catch(function(err){
      noty('Ошибка цепочки: ' + (err && (err.status||err.error||'')));
    });
  }

  /*** Инициализация ***/
  function onFull(e){
    if(!e||!e.type) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){ setTimeout(runOnce, 200); }
  }
  function subscribe(){
    if(typeof window==='undefined'||typeof window.Lampa==='undefined'||!window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', onFull);
    setTimeout(runOnce, 500);
    return true;
  }
  (function wait(i){ i=i||0; if(subscribe()) return; if(i<200) setTimeout(function(){wait(i+1)},200); else setTimeout(runOnce,700); })();

})();

