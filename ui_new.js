/**
 * Lampa plugin: Hide Details Noise (v2.4.1-safe)
 *  - Movies: remove HH:MM in details line
 *  - Series: remove Seasons/Episodes in details line + "Следующая … / Осталось дней: N"
 *  - Remove full Comments section (между «Актёры» → «Рекомендации/Коллекция»)
 *  - Remove full Seasons section (диапазон «Сезон …» → до «Актёры»)
 *  - Scroll fix: мягкое обновление контроллера/скролла + overflow-anchor:none
 *  - ES5, Unicode-safe, без monkey-patch DOM
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function t(n){ return (n && (n.textContent || n.innerText) || '').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function rm(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }
  function isNum(s){ return /^\d+$/.test((s||'').trim()); }
  function isTime(s){ return /^\d{1,2}:\d{2}$/.test((s||'').trim()); }
  function isSep(el){
    if(!el) return false;
    var cls=(el.className||'')+'', x=t(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(x);
  }
  function cleanupSep(container){
    if(!container) return;
    var f=container.firstElementChild;
    while(f && isSep(f)){ rm(f); f=container.firstElementChild; }
  }
  function reflowAndRefresh(){
    try{
      // обновить контроллеры Lampa, чтобы она пересчитала секции/якоря
      if (window.Lampa) {
        if (Lampa.Controller && typeof Lampa.Controller.update === 'function') Lampa.Controller.update();
        if (Lampa.Scroll && typeof Lampa.Scroll.update === 'function') Lampa.Scroll.update();
      }
      // форс-рефлоу
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }catch(e){}
  }

  // ---------- details line ----------
  var RU_SEASON  = '(?:сезон(?:а|ы|ов)?)';
  var RU_EPISODE = '(?:серия|серии|серий)';
  var RE_LABEL = new RegExp('^(?:'+RU_SEASON+'|'+RU_EPISODE+'|seasons?|episodes?)\\s*:?$','i');
  var RE_INLINE_SEASON  = new RegExp('^(?:'+RU_SEASON+'|seasons?)\\s*:?\\s*\\d+$','i');
  var RE_INLINE_EPISODE = new RegExp('^(?:'+RU_EPISODE+'|episodes?)\\s*:?\\s*\\d+$','i');
  var RE_INLINE_NUM_FIRST_SEASON  = new RegExp('^\\d+\\s*(?:'+RU_SEASON+'|seasons?)$','i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:'+RU_EPISODE+'|episodes?)$','i');

  function isSeriesLabel(x){ return !!x && RE_LABEL.test(x); }
  function isSeriesInline(x){
    return !!x && (RE_INLINE_SEASON.test(x) || RE_INLINE_EPISODE.test(x) ||
                   RE_INLINE_NUM_FIRST_SEASON.test(x) || RE_INLINE_NUM_FIRST_EPISODE.test(x));
  }

  var RU_MONTH='(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
  var EN_MONTH='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function isDatePiece(x){
    if(!x) return false; var s=(x||'').trim().toLowerCase();
    return /^\d{1,2}$/.test(s) || new RegExp('^'+RU_MONTH+'$','i').test(s) ||
           new RegExp('^'+EN_MONTH+'$','i').test(s) || /^\d{4}$/.test(s);
  }
  function hasNext(x){ return /следующ|next\b/i.test(x||''); }
  function hasRemain(x){ return /осталось\s*дней|days\s*left/i.test(x||''); }
  function isSlash(x){ return /^[/|\\-]$/.test((x||'').trim()); }

  function stripDetails(container){
    if(!container) return;
    var spans=container.querySelectorAll('span');
    var del=[], i, s, x;

    for(i=0;i<spans.length;i++){
      s=spans[i]; x=t(s);

      if(isTime(x)){
        var p1=s.previousElementSibling, n1=s.nextElementSibling;
        if(isSep(p1)) del.push(p1); else if(isSep(n1)) del.push(n1);
        del.push(s); continue;
      }
      if(isSeriesInline(x)){
        var p2=s.previousElementSibling, n2=s.nextElementSibling;
        if(isSep(p2)) del.push(p2); else if(isSep(n2)) del.push(n2);
        del.push(s); continue;
      }
      if(isSeriesLabel(x)){
        var L=s.previousElementSibling; if(isSep(L)) del.push(L);
        var n=s.nextElementSibling; if(isSep(n)){ del.push(n); n=s.nextElementSibling; }
        if(n && isNum(t(n))){
          var a=n.nextElementSibling; if(isSep(a)) del.push(a);
          del.push(n);
        } else {
          var r=s.nextElementSibling; if(isSep(r)) del.push(r);
        }
        del.push(s); continue;
      }
      if(hasNext(x) || hasRemain(x)){
        var pp=s.previousElementSibling; if(isSep(pp)) del.push(pp);
        del.push(s);
        var cur=s.nextElementSibling, g=0;
        while(cur && g++<30){
          var tc=t(cur);
          if(isSep(cur) || isSlash(tc) || isDatePiece(tc) || isNum(tc) || hasRemain(tc) || hasNext(tc)){
            del.push(cur); cur=cur.nextElementSibling; continue;
          }
          break;
        }
        continue;
      }
      if(/^(?:осталось\s+дней|days\s+left)\s*:?\s*\d*\s*$/i.test(x)){
        var pr=s.previousElementSibling; if(isSep(pr)) del.push(pr);
        var nr=s.nextElementSibling; if(isSep(nr)) { del.push(nr); nr=nr.nextElementSibling; }
        if(nr && isNum(t(nr))){ var an=nr.nextElementSibling; if(isSep(an)) del.push(an); del.push(nr); }
        del.push(s); continue;
      }
    }
    for(i=0;i<del.length;i++) rm(del[i]);
    cleanupSep(container);
  }

  function scanDetails(root){
    var scope=root||document, nodes=scope.querySelectorAll(SELECTORS_DETAILS), i;
    for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);
  }
  function observeDetails(el){
    if(!el || el.getAttribute('data-hds-observed')==='1') return;
    var pend=false, mo=new MutationObserver(function(){ if(pend) return; pend=true; setTimeout(function(){ pend=false; stripDetails(el); reflowAndRefresh(); },0); });
    mo.observe(el,{childList:true,subtree:true}); el.setAttribute('data-hds-observed','1');
  }
  function attachDetailsObservers(root){
    var nodes=(root||document).querySelectorAll(SELECTORS_DETAILS), i;
    for(i=0;i<nodes.length;i++) observeDetails(nodes[i]);
  }

  // ---------- sections ----------
  var RE_ACTORS       = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  var RE_RECS         = /^(?:рекомендац[^\n\r]*|recommendations?)$/i;
  var RE_COLL         = /^(?:коллекц[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD    = /^(?:комментарии|comments?|reviews|отзывы)$/i;
  var RE_SEASONS_HEAD = /^(?:сезон(?:\s*\d+)?|сезоны(?:\s*\d+)?|seasons?(?:\s*\d+)?)$/i;
  var ANCHOR_CLASS_RE = /(anchor|line__head|line__title|line-head)/i;

  function hasHead(el, re){
    if(!el) return false;
    var nodes = el.querySelectorAll ? el.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p') : [];
    for(var i=0;i<nodes.length;i++){ if(re.test(norm(t(nodes[i])))) return true; }
    return false;
  }
  function findHead(re, root){
    var scope=root||document, nodes=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'), i,n,x;
    for(i=0;i<nodes.length;i++){ n=nodes[i]; x=norm(t(n)); if(x && re.test(x)) return n; }
    return null;
  }
  function climb(el, maxUp){
    var up=el, steps=0; maxUp=maxUp||10;
    while(up && steps++<maxUp){
      if(up.parentElement && (up.previousElementSibling || up.nextElementSibling)) return up;
      up = up.parentElement;
    }
    return el;
  }
  function safeRemoveSection(node){
    if(!node) return;
    if (hasHead(node, RE_ACTORS)) return; // актёров не трогаю
    var prev=node.previousElementSibling;
    rm(node);
    while(prev){
      if (hasHead(prev, RE_ACTORS)) break;
      var txt = norm(t(prev)), cls=((prev.className||'')+'');
      if (txt==='' || ANCHOR_CLASS_RE.test(cls) || RE_SEASONS_HEAD.test(txt) || RE_COMM_HEAD.test(txt)){
        var p = prev.previousElementSibling; rm(prev); prev=p; continue;
      }
      break;
    }
  }

  // удалить блоки комментариев по заголовку
  function nukeComments(root){
    var scope=root||document, heads=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    for (var i=0;i<heads.length;i++){
      var h=heads[i], x=norm(t(h));
      if (x && RE_COMM_HEAD.test(x)){
        var sec = climb(h,10); safeRemoveSection(sec);
        var sib = h.nextElementSibling; if (sib) safeRemoveSection(sib);
      }
    }
  }

  // зачистка диапазона от Рекомендаций/Коллекции назад к Актёрам (мусор/якоря/комменты)
  function nukeBetweenActorsAndNext(root){
    var scope=root||document;
    var hActors=findHead(RE_ACTORS,scope);
    var hNext  = findHead(RE_RECS,scope) || findHead(RE_COLL,scope);
    if (!hNext) return;

    var secActors = hActors ? climb(hActors,10) : null;
    var secNext   = climb(hNext,10);

    var cur = secNext.previousElementSibling, g=0;
    while (cur && g++<80){
      if (secActors && (cur===secActors || hasHead(cur, RE_ACTORS))) break;
      var isAnchor = ANCHOR_CLASS_RE.test(((cur.className||'')+'')) || norm(t(cur))==='';
      var isComm   = hasHead(cur, RE_COMM_HEAD) || (cur.querySelector && cur.querySelector('[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]'));
      if (isAnchor || isComm){
        var next = cur.previousElementSibling; safeRemoveSection(cur); cur = next; continue;
      }
      break;
    }
  }

  // от Актёров вперёд — убрать мусор до живой секции
  function nukeForwardFromActors(root){
    var scope=root||document, hActors=findHead(RE_ACTORS,scope);
    if (!hActors) return;
    var start = climb(hActors,10);
    var cur = start.nextElementSibling, g=0;
    while (cur && g++<80){
      var head = cur.querySelector && cur.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
      var ht = head ? norm(t(head)) : '';
      if (RE_RECS.test(ht) || RE_COLL.test(ht) || RE_ACTORS.test(ht)) break;

      var isAnchor = ANCHOR_CLASS_RE.test(((cur.className||'')+'')) || norm(t(cur))==='';
      var isComm   = hasHead(cur, RE_COMM_HEAD) || (cur.querySelector && cur.querySelector('[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]'));
      if (isAnchor || isComm){
        var next = cur.nextElementSibling; safeRemoveSection(cur); cur = next; continue;
      }
      break;
    }
  }

  // сезоны: диапазон «Сезон …» → до «Актёры»
  function nukeSeasonsRange(root){
    var scope=root||document, hSeas=findHead(RE_SEASONS_HEAD, scope);
    if (!hSeas) return;
    var start = climb(hSeas,10);

    // убрать слева возможные заглушки/якоря
    var prev = start.previousElementSibling;
    while (prev){
      if (hasHead(prev, RE_ACTORS)) break;
      var pt = norm(t(prev)), pcl=((prev.className||'')+'');
      if (pt==='' || ANCHOR_CLASS_RE.test(pcl) || RE_SEASONS_HEAD.test(pt)){
        var pp = prev.previousElementSibling; rm(prev); prev = pp; continue;
      }
      break;
    }

    var hActors=findHead(RE_ACTORS, scope), end = hActors ? climb(hActors,10) : null;
    var cur = start, g=0;
    while (cur && g++<160){
      if (end && (cur===end || hasHead(cur, RE_ACTORS))) break;
      var next = cur.nextElementSibling; safeRemoveSection(cur); cur = next;
    }
  }

  function nukeAll(root){
    nukeComments(root);
    nukeBetweenActorsAndNext(root);
    nukeForwardFromActors(root);
    nukeSeasonsRange(root);
    reflowAndRefresh();
  }

  // ---------- CSS: отключаем anchoring только в зоне карточки + скрываем явные comments/review ----------
  function injectCssOnce(){
    if (document.getElementById('hds-safe-css')) return;
    var s=document.createElement('style');
    s.id='hds-safe-css';
    s.type='text/css';
    s.textContent =
      '.full, .full-start, .full-start-new{overflow-anchor:none !important;}\n' +
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"],' +
      '.full [class*="review"], .full-start [class*="review"], .full-start-new [class*="review"],' +
      '.full [id*="review"], .full-start [id*="review"], .full-start-new [id*="review"]{display:none !important;}';
    document.head.appendChild(s);
  }

  // ---------- observers ----------
  var rootObserved=false;
  function ensureRootObserver(){
    if (rootObserved || !document.body) return;
    var pend=false, mo=new MutationObserver(function(){
      if (pend) return; pend=true;
      setTimeout(function(){
        pend=false;
        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);
        nukeAll(document);
        injectCssOnce();
      },25);
    });
    // слушаем только карточку, чтобы не трогать главную/листы
    var roots=document.querySelectorAll('.full, .full-start, .full-start-new');
    for (var r=0;r<roots.length;r++) mo.observe(roots[r], {childList:true, subtree:true});
    rootObserved=true;
  }

  // ---------- events & boot ----------
  function handleFull(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      // делаю всё после сборки, без вмешательства в процесс создания DOM
      setTimeout(function(){
        injectCssOnce();
        scanDetails(document);
        attachDetailsObservers(document);
        nukeAll(document);
        ensureRootObserver();
      }, 50);
    }
  }

  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFull);
    setTimeout(function(){
      injectCssOnce();
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAll(document);
      ensureRootObserver();
    }, 150);
    return true;
  }

  (function wait(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ wait(tries+1); }, 200);
    else setTimeout(function(){
      injectCssOnce();
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAll(document);
      ensureRootObserver();
    }, 200);
  })();

})();
