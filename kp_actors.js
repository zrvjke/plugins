/**
 * Lampa plugin: KP Cast Override (v1.1.2)
 * Автор: Рома + твоя девочка :)
 *
 * Что делает:
 *  - Подменяет блок «Актёры» данными из api.kinopoisk.dev (v1.4)
 *  - 1 запрос на карточку (по IMDb ID; фолбэк — поиск по названию+году)
 *  - Кэш в localStorage (по умолчанию 7 дней)
 *  - Диагностика: показывает причины, если не удалось подтянуть (401/403/лимиты/не найдено)
 *  - Фолбэк: если Кинопоиск недоступен или пусто — оставляю TMDb-каст без изменений
 */

(function () {
  'use strict';

  /*** ====== НАСТРОЙКИ ====== ***/
  var KP_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // твой ключ
  var KP_BASE    = 'https://api.kinopoisk.dev';
  var MAX_ACTORS = 24;              // максимум актёров для показа
  var CACHE_TTL  = 7 * 24 * 3600e3; // 7 дней
  var DEBUG      = false;           // true — буду показывать всплывающие причины

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  /*** ====== УТИЛИТЫ ====== ***/
  function txt(n){ return (n && (n.textContent || n.innerText) || '').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function rm(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function noty(msg){ try{ if(DEBUG && window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); }catch(e){} }

  // GET JSON с заголовками; отдаю и статус для диагностики
  function getJSON(url){
    return new Promise(function(resolve,reject){
      function done(ok, data, status){
        if (ok) resolve({ ok:true, data:data, status:status });
        else reject({ ok:false, error:data, status:status });
      }
      if (typeof fetch === 'function'){
        fetch(url, {headers: {'accept':'application/json','X-API-KEY':KP_API_KEY}})
          .then(function(r){
            var st = r.status;
            if(!r.ok) return r.text().then(function(t){ done(false, t||('HTTP '+st), st); });
            return r.json().then(function(j){ done(true, j, st); });
          })
          .catch(function(e){ done(false, e && (e.message||String(e)) || 'network', 0); });
      } else {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.setRequestHeader('accept','application/json');
        x.setRequestHeader('X-API-KEY', KP_API_KEY);
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

  /*** ====== ИЗВЛЕЧЕНИЕ ИДЕНТИФИКАТОРОВ ====== ***/
  // IMDb ID
  function extractImdbId(){
    var a = document.querySelector('a[href*="imdb.com/title/tt"]');
    if (a && a.href){
      var m = a.href.match(/tt\d{6,9}/i);
      if (m) return m[0].toLowerCase();
    }
    var m2 = document.body.innerText.match(/tt\d{6,9}/i);
    if (m2) return m2[0].toLowerCase();
    var imdbEl = document.querySelector('[data-imdb], [data-imdb-id]');
    if (imdbEl){
      var v = imdbEl.getAttribute('data-imdb') || imdbEl.getAttribute('data-imdb-id') || '';
      if (/tt\d{6,9}/i.test(v)) return v.toLowerCase();
    }
    return null;
  }

  // Название + год
  function extractTitleYear(){
    // Заголовок
    var titleEl =
      $('.full-title, .full-start__title, .full-start-new__title, .full-title-name, .full__title, h1, h2');
    var title = titleEl ? txt(titleEl) : '';
    // Очистка хвостов
    if (title){
      title = title.replace(/\s*\/\s*.+$/, '') // "Название / Original"
                   .replace(/\s*\(\d{4}\)\s*$/, '') // "(2024)"
                   .replace(/\s*\[\d{4}\]\s*$/, '') // "[2024]"
                   .trim();
    }
    // Год — сначала в details
    var year = '';
    var details = document.querySelector(SELECTORS_DETAILS);
    if (details){
      var spans = details.querySelectorAll('span');
      for (var i=0;i<spans.length;i++){
        var s = txt(spans[i]);
        if (/^\d{4}$/.test(s)){ year = s; break; }
      }
    }
    // Подзаголовки/теги
    if (!year){
      var yEl = $('.full-start__tagline, .full-start-new__tagline, .full__tagline, .full-info');
      if (yEl){
        var m = txt(yEl).match(/\b(19|20)\d{2}\b/);
        if (m) year = m[0];
      }
    }
    // Из title / <title> вкладки
    if (!year && typeof document !== 'undefined' && document.title){
      var m2 = document.title.match(/\b(19|20)\d{2}\b/);
      if (m2) year = m2[0];
    }
    return {title:title, year:year};
  }

  /*** ====== ЗАПРОСЫ К КИНОПОИСК ====== ***/
  function kpFindByImdb(imdb){
    // Явно укажем selectFields, чтобы сразу получить persons, если повезёт
    var url = KP_BASE + '/v1.4/movie?externalId.imdb=' + encodeURIComponent(imdb)
            + '&limit=1'
            + '&selectFields=id'
            + '&selectFields=year'
            + '&selectFields=name'
            + '&selectFields=enName'
            + '&selectFields=type'
            + '&selectFields=persons';
    return getJSON(url).then(function(r){
      if (!r.ok) throw r;
      var j = r.data;
      if (j && j.docs && j.docs.length) return j.docs[0];
      return null;
    });
  }

  function kpFindByTitleYear(title, year){
    if (!title) return Promise.resolve(null);
    var url = KP_BASE + '/v1.4/movie/search?query=' + encodeURIComponent(title)
            + '&page=1&limit=10'
            + '&selectFields=id'
            + '&selectFields=year'
            + '&selectFields=name'
            + '&selectFields=enName'
            + '&selectFields=type';
    return getJSON(url).then(function(r){
      if (!r.ok) throw r;
      var j = r.data;
      if (!j || !j.docs || !j.docs.length) return null;
      var yy = parseInt(year||'0',10);
      var best = null;
      if (yy){
        // сначала точный год
        for (var i=0;i<j.docs.length;i++){
          var d = j.docs[i];
          if (d && (d.year===yy)) { best = d; break; }
        }
      }
      // если не нашли по году — берём первую
      return best || j.docs[0];
    });
  }

  function kpGetMovieFull(id){
    var url = KP_BASE + '/v1.4/movie/' + encodeURIComponent(id)
            + '?selectFields=persons'
            + '&selectFields=id'
            + '&selectFields=year'
            + '&selectFields=name'
            + '&selectFields=enName';
    return getJSON(url).then(function(r){
      if (!r.ok) throw r;
      return r.data || null;
    });
  }

  function pickPersons(movie){
    if (!movie) return null;
    if (movie.persons && movie.persons.length) return movie.persons;
    return null;
  }

  /*** ====== РЕНДЕР ====== ***/
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
    return String(s||'').replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function filterActors(persons){
    // На Кинопоиске профессии бывают: 'ACTOR' / 'actor' / 'Актёр' и т.п.
    return (persons||[]).filter(function(p){
      var prof = ((p.profession||'') + ' ' + (p.enProfession||'')).toLowerCase();
      return /actor|акт/.test(prof);
    }).slice(0, MAX_ACTORS);
  }

  function buildActorsHTML(persons){
    var list = filterActors(persons);
    if (!list.length) return '';
    var html = '<div class="kp-actors-grid">';
    for (var i=0;i<list.length;i++){
      var p = list[i];
      var name = p.name || p.enName || p.alternativeName || 'Без имени';
      var role = p.description || p.character || '';
      var img  = p.photo || '';
      html += '<div class="kp-actor">' +
                (img ? '<img class="kp-actor__img" loading="lazy" src="'+escapeHtml(img)+'" alt="'+escapeHtml(name)+'">' :
                       '<div class="kp-actor__img" style="background:#2d2d2d;"></div>') +
                '<div class="kp-actor__name">'+escapeHtml(name)+'</div>' +
                (role ? '<div class="kp-actor__role">'+escapeHtml(role)+'</div>' : '') +
              '</div>';
    }
    html += '</div>';
    return html;
  }

  function replaceActorsSection(persons){
    var sec = findActorsSection();
    if (!sec) { noty('KP: не нашла секцию «Актёры»'); return false; }

    // скрываю штатные карточки актёров только если у меня есть KP-данные
    var toHide = sec.querySelectorAll('[class*="person"],[class*="actor"],[class*="cards"],[class*="list"],[class*="scroll"]');
    for (var i=0;i<toHide.length;i++){ toHide[i].style.display='none'; }

    // бейдж к заголовку
    var head = sec.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
    if (head && !head.querySelector('.kp-cast-badge')){
      var badge = document.createElement('span');
      badge.className = 'kp-cast-badge';
      badge.textContent = '(Кинопоиск)';
      head.appendChild(badge);
    }

    // удалить старый мой блок (если перерисовка)
    var old = sec.querySelector('.kp-actors-grid');
    if (old) rm(old);

    // вставить сетку
    var wrap = document.createElement('div');
    wrap.innerHTML = buildActorsHTML(persons);
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

    noty('KP: актёры заменены');
    return true;
  }

  /*** ====== ОСНОВНАЯ ЛОГИКА ====== ***/
  function buildCacheKey(imdb, title, year){
    if (imdb) return 'kp_cast_imdb_' + imdb.toLowerCase();
    return 'kp_cast_title_' + norm(title||'') + '_' + (year||'');
  }

  function fetchKpPersons(){
    var imdb = extractImdbId();
    var meta  = extractTitleYear();
    var ckey  = buildCacheKey(imdb, meta.title, meta.year);
    var cached = cacheGet(ckey);
    if (cached && cached.persons) { noty('KP: из кэша'); return Promise.resolve(cached.persons); }

    var chain = Promise.resolve(null);

    if (imdb){
      chain = kpFindByImdb(imdb).then(function(m){
        if (!m) return null;
        var p = pickPersons(m);
        if (p) return p;
        if (m.id) return kpGetMovieFull(m.id).then(function(mm){ return pickPersons(mm); });
        return null;
      });
    } else if (meta.title){
      chain = kpFindByTitleYear(meta.title, meta.year).then(function(m){
        if (!m) return null;
        if (m.persons && m.persons.length) return m.persons;
        if (m.id) return kpGetMovieFull(m.id).then(function(mm){ return pickPersons(mm); });
        return null;
      });
    }

    return chain.then(function(persons){
      if (persons && persons.length){
        cacheSet(ckey, {persons:persons});
        return persons;
      }
      return null;
    }).catch(function(err){
      var msg = 'KP: ошибка запроса';
      if (err && err.status===401) msg = 'KP: 401 — неверный X-API-KEY';
      else if (err && err.status===403) msg = 'KP: 403 — доступ запрещён (лимит/тариф)';
      else if (err && err.status) msg = 'KP: HTTP '+err.status;
      noty(msg);
      return null;
    });
  }

  function runOnceOnPage(){
    injectCssOnce();
    fetchKpPersons().then(function(persons){
      if (persons && filterActors(persons).length){
        replaceActorsSection(persons);
      } else {
        noty('KP: актёры не найдены — оставляю TMDb');
      }
    });
  }

  /*** ====== ИНИТ ====== ***/
  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      setTimeout(runOnceOnPage, 120);
    }
  }

  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(runOnceOnPage, 300); // на случай уже открытой карточки
    return true;
  }

  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); }, 200);
    else setTimeout(runOnceOnPage, 400);
  })();

})();
