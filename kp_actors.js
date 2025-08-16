/**
 * Lampa plugin: KP Cast Override (v1.0.0)
 * Автор: Рома + твоя девочка :)
 *
 * Что делает:
 *  - Подменяет блок «Актёры» в карточках (фильмы/сериалы) данными из api.kinopoisk.dev
 *  - 1 запрос на карточку (по IMDb ID, при его отсутствии — поиск по названию+году)
 *  - Кэширует результат в localStorage (по умолчанию 7 дней)
 *  - Фолбэк: если не нашли в Кинопоиске/лимит, оставляю TMDb-актеров как есть
 *
 * ВАЖНО: тут встроен твой ключ X-API-KEY. Если захочешь, вынесу в настройки.
 */

(function () {
  'use strict';

  /*** ====== НАСТРОЙКИ ====== ***/
  var KP_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G'; // твой ключ
  var KP_BASE    = 'https://api.kinopoisk.dev';
  var MAX_ACTORS = 24;              // показывать не больше N актеров
  var CACHE_TTL  = 7 * 24 * 3600e3; // 7 дней
  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  /*** ====== УТИЛИТЫ ====== ***/
  function txt(n){ return (n && (n.textContent || n.innerText) || '').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function rm(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $all(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  // простой GET JSON с заголовками
  function getJSON(url){
    return new Promise(function(resolve,reject){
      if (typeof fetch === 'function'){
        fetch(url, {headers: {'accept':'application/json','X-API-KEY':KP_API_KEY}})
          .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
          .then(resolve).catch(reject);
      } else {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.setRequestHeader('accept','application/json');
        x.setRequestHeader('X-API-KEY', KP_API_KEY);
        x.onreadystatechange = function(){
          if (x.readyState===4){
            if (x.status>=200 && x.status<300){
              try { resolve(JSON.parse(x.responseText)); } catch(e){ reject(e); }
            } else reject(new Error('HTTP '+x.status));
          }
        };
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

  /*** ====== ДОСТАЕМ ID ФИЛЬМА/СЕРИАЛА ====== ***/
  // IMDb ID из DOM
  function extractImdbId(){
    // ссылки на imdb.com/title/ttXXXXXXX
    var a = document.querySelector('a[href*="imdb.com/title/tt"]');
    if (a && a.href){
      var m = a.href.match(/tt\d{6,9}/i);
      if (m) return m[0].toLowerCase();
    }
    // голый ttXXXXXXXX где-то в тексте
    var m2 = document.body.innerText.match(/tt\d{6,9}/i);
    if (m2) return m2[0].toLowerCase();
    // data-атрибуты
    var imdbEl = document.querySelector('[data-imdb], [data-imdb-id]');
    if (imdbEl){
      var v = imdbEl.getAttribute('data-imdb') || imdbEl.getAttribute('data-imdb-id') || '';
      if (/tt\d{6,9}/i.test(v)) return v.toLowerCase();
    }
    return null;
  }

  // Название и год с экрана
  function extractTitleYear(){
    // Заголовок
    var titleEl = $('.full-title, .full-start__title, .full-start-new__title, h1, .full-title-name');
    var title = titleEl ? txt(titleEl) : '';
    // Год — ищем в инфо-строке
    var year = '';
    var details = document.querySelector(SELECTORS_DETAILS);
    if (details){
      var spans = details.querySelectorAll('span');
      for (var i=0;i<spans.length;i++){
        var s = txt(spans[i]);
        if (/^\d{4}$/.test(s)){ year = s; break; }
      }
    }
    // иногда год в подзаголовке
    if (!year){
      var yEl = $('.full-start__tagline, .full-start-new__tagline');
      if (yEl){
        var m = txt(yEl).match(/\b(19|20)\d{2}\b/);
        if (m) year = m[0];
      }
    }
    // почистить хвосты из title типа «/ …»
    if (title){
      title = title.replace(/\s*\/\s*.+$/, '').trim();
    }
    return {title:title, year:year};
  }

  /*** ====== ЗАПРОСЫ К КИНОПОИСК ====== ***/
  // 1) по IMDb
  function kpFindByImdb(imdb){
    // берём первый подходящий
    var url = KP_BASE + '/v1.4/movie?externalId.imdb=' + encodeURIComponent(imdb) + '&limit=1';
    return getJSON(url).then(function(j){
      if (j && j.docs && j.docs.length) return j.docs[0];
      return null;
    });
  }
  // 2) по названию+году (фолбэк)
  function kpFindByTitleYear(title, year){
    if (!title) return Promise.resolve(null);
    // Поиск: у v1.4 есть endpoint /movie/search?query=...
    // Если вдруг вернёт пусто — возвращаем null.
    var url = KP_BASE + '/v1.4/movie/search?query=' + encodeURIComponent(title) + '&page=1&limit=5';
    return getJSON(url).then(function(j){
      if (!j || !j.docs || !j.docs.length) return null;
      // выбрать лучший по году
      var best = null, yy = parseInt(year||'0',10);
      if (yy){
        for (var i=0;i<j.docs.length;i++){
          var d = j.docs[i];
          if (d && (d.year===yy || (d.releaseYears && d.releaseYears[0] && d.releaseYears[0].start===yy))){
            best = d; break;
          }
        }
      }
      return best || j.docs[0];
    }).catch(function(){ return null; });
  }
  // 3) если получили id, дотянуть persons (на случай, если в поисковой выдаче нет полного массива)
  function kpGetMovieFull(id){
    var url = KP_BASE + '/v1.4/movie/' + encodeURIComponent(id);
    return getJSON(url).then(function(j){ return j || null; });
  }

  /*** ====== РЕНДЕР ====== ***/
  // готовим контейнер секции «Актёры»
  var RE_ACTORS = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  function findActorsSection(){
    // Найти заголовок «Актёры»
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var head = null, i, n, val;
    for (i=0;i<nodes.length;i++){
      n=nodes[i]; val = norm(txt(n));
      if (val && RE_ACTORS.test(val)){ head = n; break; }
    }
    if (!head) return null;
    // Подняться до секции (первый предок, у которого есть соседи)
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

  function buildActorsHTML(persons){
    // оставляем только актёров
    var list = (persons||[]).filter(function(p){
      var prof = (p.profession || p.enProfession || '').toString().toLowerCase();
      return prof.indexOf('actor') !== -1 || prof.indexOf('акт') !== -1;
    }).slice(0, MAX_ACTORS);

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

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function replaceActorsSection(persons){
    var sec = findActorsSection();
    if (!sec) return false;

    // Скрыть штатный список актёров (не удаляю — вдруг верстка завязана)
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

    // обновить контроллер скролла Lampa, чтобы фокус/якоря не дурили
    try{
      if (window.Lampa) {
        if (Lampa.Controller && typeof Lampa.Controller.update === 'function') Lampa.Controller.update();
        if (Lampa.Scroll && typeof Lampa.Scroll.update === 'function') Lampa.Scroll.update();
      }
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }catch(e){}

    return true;
  }

  /*** ====== ЛОГИКА ПОЛУЧЕНИЯ КАСТА ====== ***/
  function buildCacheKey(imdb, title, year){
    if (imdb) return 'kp_cast_imdb_' + imdb.toLowerCase();
    return 'kp_cast_title_' + norm(title||'') + '_' + (year||'');
  }

  function fetchKpPersons(){
    var imdb = extractImdbId();
    var meta  = extractTitleYear();
    var ckey  = buildCacheKey(imdb, meta.title, meta.year);
    var cached = cacheGet(ckey);
    if (cached && cached.persons) return Promise.resolve(cached.persons);

    // стратегия:
    // 1) по IMDb → persons
    // 2) иначе по названию+году → persons
    // 3) если в карточке нет persons, добираем /movie/{id}
    function pickPersons(movie){
      if (!movie) return null;
      if (movie.persons && movie.persons.length) return movie.persons;
      return null;
    }

    var chain = Promise.resolve(null);
    if (imdb){
      chain = kpFindByImdb(imdb).then(function(m){
        if (!m) return null;
        var p = pickPersons(m);
        if (p) return p;
        // попытаться дотянуть полный
        if (m.id) return kpGetMovieFull(m.id).then(function(mm){ return pickPersons(mm); });
        return null;
      });
    } else if (meta.title){
      chain = kpFindByTitleYear(meta.title, meta.year).then(function(m){
        if (!m) return null;
        var p = pickPersons(m);
        if (p) return p;
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
    }).catch(function(){ return null; });
  }

  /*** ====== ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ====== ***/
  function runOnceOnPage(){
    injectCssOnce();

    // пробуем заменить
    fetchKpPersons().then(function(persons){
      if (persons && persons.length){
        replaceActorsSection(persons);
      }
    });
  }

  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      // чуть подождать, чтобы секция успела нарисоваться
      setTimeout(runOnceOnPage, 120);
    }
  }

  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    // на случай, если уже открыта карточка
    setTimeout(runOnceOnPage, 300);
    return true;
  }

  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); }, 200);
    else setTimeout(runOnceOnPage, 400);
  })();

})();
