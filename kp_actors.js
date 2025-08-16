/**
 * Lampa plugin: KP Cast Override (v1.4.0 KPU-first)
 * Автор: Рома + твоя девочка :)
 *
 * Что делает:
 *  - Подменяет блок «Актёры» в карточке данными из Кинопоиска.
 *  - ПРИОРИТЕТ: 1) kinopoiskapiunofficial.tech (KPU), 2) api.kinopoisk.dev (DEV, фолбэк).
 *  - 1–2 запроса на карточку. Кэш 7 дней. Если ничего не нашли — оставляю TMDb-каст.
 *  - Можно включить DEBUG, чтобы видеть всплывающие подсказки (Lampa.Noty).
 */

(function () {
  'use strict';

  /*** ====== КЛЮЧИ И НАСТРОЙКИ ====== ***/
  // 1) Твой ключ от kinopoiskapiunofficial.tech (первым делом пробую его)
  var KPU_API_KEY = 'dc9196ea-4cc8-48e8-8259-0cbdfa58eaf1';
  // 2) Ключ от api.kinopoisk.dev (резерв/фолбэк)
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';

  var MAX_ACTORS = 24;              // максимум актёров на экране
  var CACHE_TTL  = 7 * 24 * 3600e3; // 7 дней
  var DEBUG      = false;           // true — включить всплывающие уведомления

  // Базы API
  var KPU_BASE   = 'https://kinopoiskapiunofficial.tech'; // v2.1/v2.2 + /v1/staff
  var DEV_BASE   = 'https://api.kinopoisk.dev';           // v1.4

  // где искать год и заголовок
  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  /*** ====== УТИЛИТЫ ====== ***/
  function txt(n){ return (n && (n.textContent || n.innerText) || '').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function rm(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function noty(msg){ try{ if(DEBUG && window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); }catch(e){} }

  function fetchJSON(url, headers){
    return new Promise(function(resolve,reject){
      function done(ok, data, status){
        if (ok) resolve({ ok:true, data:data, status:status });
        else reject({ ok:false, error:data, status:status });
      }
      if (typeof fetch === 'function'){
        fetch(url, {headers: headers || {'accept':'application/json'}})
          .then(function(r){
            var st = r.status;
            if(!r.ok) return r.text().then(function(t){ done(false, t||('HTTP '+st), st); });
            return r.json().then(function(j){ done(true, j, st); });
          })
          .catch(function(e){ done(false, e && (e.message||String(e)) || 'network', 0); });
      } else {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        if (headers) for (var k in headers){ try{x.setRequestHeader(k, headers[k]);}catch(e){} }
        x.onreadystatechange = function(){
          if (x.readyState===4){
            var st = x.status;
            if (st>=200 && st<300){
              try { done(true, JSON.parse(x.responseText), st); } catch(e){ done(false, 'bad json', st); }
            } else done(false, 'HTTP '+st, st);
          }
        };
        x.onerror = function(){ done(false, 'network', 0); };
        x.send();
      }
    });
  }

  // кэш
  function cacheGet(key){
    try{
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.t || !obj.v) return null;
      if (Date.now() - obj.t > CACHE_TTL) { localStorage.removeItem(key); return null; }
      return obj.v;
    }catch(e){ return null; }
  }
  function cacheSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), v:val})); }catch(e){}
  }

  /*** ====== ИЗВЛЕЧЕНИЕ ID/МЕТЫ ИЗ КАРТОЧКИ ====== ***/
  function extractImdbId(){
    var a = document.querySelector('a[href*="imdb.com/title/tt"]');
    if (a && a.href){ var m = a.href.match(/tt\d{6,9}/i); if (m) return m[0].toLowerCase(); }
    var m2 = document.body.innerText.match(/tt\d{6,9}/i);
    if (m2) return m2[0].toLowerCase();
    var imdbEl = document.querySelector('[data-imdb], [data-imdb-id]');
    if (imdbEl){
      var v = imdbEl.getAttribute('data-imdb') || imdbEl.getAttribute('data-imdb-id') || '';
      if (/tt\d{6,9}/i.test(v)) return v.toLowerCase();
    }
    return null;
  }
  function extractTitleYear(){
    var titleEl = $('.full-title, .full-start__title, .full-start-new__title, .full-title-name, .full__title, h1, h2');
    var title = titleEl ? txt(titleEl) : '';
    if (title){
      title = title.replace(/\s*\/\s*.+$/, '') // «Название / Original»
                   .replace(/\s*\(\d{4}\)\s*$/, '')
                   .replace(/\s*\[\d{4}\]\s*$/, '')
                   .trim();
    }
    var year = '';
    var details = document.querySelector(SELECTORS_DETAILS);
    if (details){
      var spans = details.querySelectorAll('span');
      for (var i=0;i<spans.length;i++){ var s = txt(spans[i]); if (/^\d{4}$/.test(s)){ year = s; break; } }
    }
    if (!year && document.title){ var m = document.title.match(/\b(19|20)\d{2}\b/); if (m) year = m[0]; }
    return {title:title, year:year};
  }

  /*** ====== РЕНДЕР «АКТЁРОВ» ====== ***/
  var RE_ACTORS = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;

  function findActorsSection(){
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var head = null, i, n, val;
    for (i=0;i<nodes.length;i++){
      n=nodes[i]; val = norm(txt(n));
      if (val && RE_ACTORS.test(val)){ head = n; break; }
    }
    if (!head) return null;
    var up=head, steps=0;
    while (up && steps++<10){
      if (up.parentElement && (up.previousElementSibling || up.nextElementSibling)) break;
      up = up.parentElement;
    }
    return up||head;
  }

  function injectCssOnce(){
    if (document.getElementById('kp-cast-css')) return;
    var s=document.createElement('style');
    s.id='kp-cast-css'; s.type='text/css';
    s.textContent =
      '.kp-actors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:12px;margin-top:8px}\n' +
      '.kp-actor{display:flex;flex-direction:column;align-items:center;text-align:center}\n' +
      '.kp-actor__img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px}\n' +
      '.kp-actor__name{margin-top:6px;font-size:13px;line-height:1.25;font-weight:600}\n' +
      '.kp-actor__role{margin-top:2px;font-size:12px;opacity:.7}\n' +
      '.kp-cast-badge{font-size:11px;opacity:.65;margin-left:6px}\n';
    document.head.appendChild(s);
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }

  function mapActorsFromKPU(staff){
    // staff: [{nameRu, nameEn, description, posterUrl, professionKey}]
    return (staff||[]).filter(function(p){
      return (p.professionKey||'').toUpperCase() === 'ACTOR';
    }).map(function(p){
      return {
        name: p.nameRu || p.nameEn || 'Без имени',
        role: p.description || '',
        img:  p.posterUrl || ''
      };
    });
  }

  function mapActorsFromDEV(persons){
    // persons: [{name, enName, alternativeName, description, photo, profession/enProfession}]
    return (persons||[]).filter(function(p){
      var prof = ((p.profession||'') + ' ' + (p.enProfession||'')).toLowerCase();
      return /actor|акт/.test(prof);
    }).map(function(p){
      return {
        name: p.name || p.enName || p.alternativeName || 'Без имени',
        role: p.description || p.character || '',
        img:  p.photo || ''
      };
    });
  }

  function buildActorsHTML(mapped){
    var list = (mapped||[]).slice(0, MAX_ACTORS);
    if (!list.length) return '';
    var html = '<div class="kp-actors-grid">';
    for (var i=0;i<list.length;i++){
      var p = list[i];
      html += '<div class="kp-actor">' +
                (p.img ? '<img class="kp-actor__img" loading="lazy" src="'+escapeHtml(p.img)+'" alt="'+escapeHtml(p.name)+'">' :
                         '<div class="kp-actor__img" style="background:#2d2d2d;"></div>') +
                '<div class="kp-actor__name">'+escapeHtml(p.name)+'</div>' +
                (p.role ? '<div class="kp-actor__role">'+escapeHtml(p.role)+'</div>' : '') +
              '</div>';
    }
    html += '</div>';
    return html;
  }

  function replaceActorsSection(mapped, badge){
    var sec = findActorsSection();
    if (!sec){ noty('KP: не нашла секцию «Актёры»'); return false; }
    if (!mapped || !mapped.length){ noty('KP: пустой список актёров'); return false; }

    // скрыть штатные карточки актёров
    var toHide = sec.querySelectorAll('[class*="person"],[class*="actor"],[class*="cards"],[class*="list"],[class*="scroll"]');
    for (var i=0;i<toHide.length;i++){ toHide[i].style.display='none'; }

    // бейдж к заголовку
    var head = sec.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
    if (head && !head.querySelector('.kp-cast-badge')){
      var b = document.createElement('span');
      b.className = 'kp-cast-badge';
      b.textContent = '(' + (badge||'Кинопоиск') + ')';
      head.appendChild(b);
    }

    // удалить мой старый блок (если обновление)
    var old = sec.querySelector('.kp-actors-grid'); if (old) rm(old);

    // вставить сетку
    var wrap = document.createElement('div');
    wrap.innerHTML = buildActorsHTML(mapped);
    var grid = wrap.firstChild;
    if (grid) sec.appendChild(grid);

    // обновить контроллеры/скролл Lampa
    try{
      if (window.Lampa) {
        if (Lampa.Controller && typeof Lampa.Controller.update === 'function') Lampa.Controller.update();
        if (Lampa.Scroll && typeof Lampa.Scroll.update === 'function') Lampa.Scroll.update();
      }
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }catch(e){}

    noty('KP: актёры заменены ('+badge+')');
    return true;
  }

  /*** ====== ЗАПРОСЫ: KPU (первым делом) ====== **/
  function kpu_searchByKeyword(title, page){
    var url = KPU_BASE + '/api/v2.1/films/search-by-keyword?keyword=' + encodeURIComponent(title) + '&page=' + (page||1);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  function kpu_staffByFilmId(id){
    var url = KPU_BASE + '/api/v1/staff?filmId=' + encodeURIComponent(id);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }

  function useKPU(meta){
    var ckey = 'kpu_cast_' + norm(meta.title||'') + '_' + (meta.year||'');
    var cval = cacheGet(ckey);
    if (cval && cval.length) { noty('KPU: из кэша'); return Promise.resolve(cval); }
    if (!meta.title) return Promise.resolve(null);

    return kpu_searchByKeyword(meta.title, 1).then(function(r){
      if (!r.ok) throw r;
      var j = r.data || {};
      var films = j.films || j.docs || [];
      if (!films.length) return null;

      // выбрать по году, если он есть
      var yy = parseInt(meta.year||'0',10), best = null;
      if (yy){
        for (var i=0;i<films.length;i++){
          var f = films[i], fy = f.year || f.filmYear || f.startYear || 0;
          if (fy === yy) { best = f; break; }
        }
      }
      var pick = best || films[0];
      var kpId = pick.kinopoiskId || pick.filmId || pick.kinopoiskID || pick.id;
      if (!kpId) return null;

      return kpu_staffByFilmId(kpId).then(function(rr){
        if (!rr.ok) throw rr;
        var mapped = mapActorsFromKPU(rr.data||[]);
        cacheSet(ckey, mapped);
        return mapped;
      });
    }).catch(function(err){
      // пробрасываю наружу, чтобы можно было уйти на DEV
      throw err;
    });
  }

  /*** ====== ЗАПРОСЫ: DEV (фолбэк) ====== **/
  function dev_findByImdb(imdb){
    var url = DEV_BASE + '/v1.4/movie?externalId.imdb=' + encodeURIComponent(imdb)
            + '&limit=1'
            + '&selectFields=id&selectFields=year&selectFields=name&selectFields=enName'
            + '&selectFields=type&selectFields=persons';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_findByTitle(title){
    var url = DEV_BASE + '/v1.4/movie/search?query=' + encodeURIComponent(title)
            + '&page=1&limit=10'
            + '&selectFields=id&selectFields=year&selectFields=name&selectFields=enName&selectFields=type';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_getMovieFull(id){
    var url = DEV_BASE + '/v1.4/movie/' + encodeURIComponent(id)
            + '?selectFields=persons&selectFields=id&selectFields=year&selectFields=name&selectFields=enName';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }

  function useDEV(imdb, meta){
    var ckey = 'dev_cast_' + (imdb ? ('imdb_'+imdb.toLowerCase()) : ('title_'+norm(meta.title||'')+'_'+(meta.year||'')));
    var cval = cacheGet(ckey);
    if (cval && cval.length) { noty('DEV: из кэша'); return Promise.resolve(cval); }

    var chain = Promise.resolve(null);
    if (imdb){
      chain = dev_findByImdb(imdb).then(function(r){
        if (!r.ok) throw r;
        var doc = (r.data && r.data.docs && r.data.docs[0]) || null;
        if (doc && doc.persons && doc.persons.length){
          var mapped = mapActorsFromDEV(doc.persons);
          cacheSet(ckey, mapped); return mapped;
        }
        if (doc && doc.id){
          return dev_getMovieFull(doc.id).then(function(rr){
            if (!rr.ok) throw rr;
            var mapped = mapActorsFromDEV((rr.data && rr.data.persons)||[]);
            cacheSet(ckey, mapped); return mapped;
          });
        }
        return null;
      });
    } else if (meta.title){
      chain = dev_findByTitle(meta.title).then(function(r){
        if (!r.ok) throw r;
        var docs = (r.data && r.data.docs) || [];
        if (!docs.length) return null;
        var yy = parseInt(meta.year||'0',10), best = null, i;
        if (yy) for(i=0;i<docs.length;i++){ if (docs[i].year===yy){ best = docs[i]; break; } }
        var pick = best || docs[0];
        return pick ? dev_getMovieFull(pick.id) : null;
      }).then(function(rr){
        if (!rr) return null;
        if (!rr.ok) throw rr;
        var mapped = mapActorsFromDEV((rr.data && rr.data.persons)||[]);
        cacheSet(ckey, mapped); return mapped;
      });
    }
    return chain;
  }

  /*** ====== ГЛАВНЫЙ ПОТОК ====== **/
  function injectAndRefresh(mapped, badge){
    if (mapped && mapped.length){
      replaceActorsSection(mapped, badge);
    } else {
      noty('KP: актёры не найдены — оставляю TMDb');
    }
  }

  function runOnceOnPage(){
    injectCssOnce();

    var imdb = extractImdbId();
    var meta  = extractTitleYear();

    // 1) Пытаюсь KPU (первым делом)
    useKPU(meta).then(function(mapped){
      if (mapped && mapped.length){
        injectAndRefresh(mapped, 'KP Unofficial');
        return;
      }
      // 2) Фолбэк DEV
      return useDEV(imdb, meta).then(function(mapped2){
        injectAndRefresh(mapped2, 'Кинопоиск DEV');
      });
    }).catch(function(err){
      // Если на KPU ошибка — пробую DEV
      noty('KPU ошибка: ' + (err && (err.status||err.error||'')));
      useDEV(imdb, meta).then(function(mapped2){
        injectAndRefresh(mapped2, 'Кинопоиск DEV');
      }).catch(function(e2){
        noty('DEV ошибка: ' + (e2 && (e2.status||e2.error||'')));
      });
    });
  }

  /*** ====== ИНИТ ====== **/
  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      setTimeout(runOnceOnPage, 150);
    }
  }
  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(runOnceOnPage, 350); // если карточка уже открыта
    return true;
  }
  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); }, 200);
    else setTimeout(runOnceOnPage, 500);
  })();

})();

