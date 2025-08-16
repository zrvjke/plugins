/**
 * Lampa plugin: Hide Details Noise
 *  - Movies: remove HH:MM from details line
 *  - Series: remove Seasons/Episodes in details line + "Следующая … / Осталось дней: N"
 *  - Remove Comments section (by heading/classes and between Actors → (Recommendations/Collection))
 *  - Remove Seasons block (big section like "Сезон 1")
 *  - Hard remove from DOM + forced reflow to avoid focus/scroll stops
 *
 * Version: 1.7.6 (Unicode-safe, ES5)
 * Author: Roman + ChatGPT
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function textOf(node){ return (node && (node.textContent || node.innerText) || '').trim(); }
  function removeNode(n){ if (n && n.parentNode) n.parentNode.removeChild(n); }
  function isPureNumber(s){ return /^\d+$/.test((s||'').trim()); }
  function isTimeToken(s){ return /^\d{1,2}:\d{2}$/.test((s||'').trim()); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }

  function isSeparatorNode(el){
    if (!el) return false;
    var cls = (el.className||'')+'';
    var txt = textOf(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(txt);
  }
  function cleanupLeadingSeparators(container){
    if (!container) return;
    var first = container.firstElementChild;
    while (first && isSeparatorNode(first)) {
      removeNode(first);
      first = container.firstElementChild;
    }
  }
  // заставляем интерфейс пересчитать размеры/навигацию
  function forceReflow(){
    try{
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
      var scrollers = document.querySelectorAll('.scroll, .content, .layout__body, .full, .full-start, .full-start-new');
      for (var i=0;i<scrollers.length;i++){
        scrollers[i].scrollTop = scrollers[i].scrollTop;
      }
    }catch(e){}
  }

  // ---------- series tokens ----------
  var RU_SEASON  = '(?:сезон(?:а|ы|ов)?)';
  var RU_EPISODE = '(?:серия|серии|серий)';

  var RE_LABEL = new RegExp('^(?:' + RU_SEASON + '|' + RU_EPISODE + '|seasons?|episodes?)\\s*:?$', 'i');
  var RE_INLINE_SEASON  = new RegExp('^(?:' + RU_SEASON + '|seasons?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_EPISODE = new RegExp('^(?:' + RU_EPISODE + '|episodes?)\\s*:?\\s*\\d+$', 'i');
  var RE_INLINE_NUM_FIRST_SEASON  = new RegExp('^\\d+\\s*(?:' + RU_SEASON + '|seasons?)$', 'i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:' + RU_EPISODE + '|episodes?)$', 'i');

  function isSeriesLabelToken(t){ return !!t && RE_LABEL.test(t); }
  function isSeriesInlineToken(t){
    return !!t && (RE_INLINE_SEASON.test(t) || RE_INLINE_EPISODE.test(t) ||
                   RE_INLINE_NUM_FIRST_SEASON.test(t) || RE_INLINE_NUM_FIRST_EPISODE.test(t));
  }

  // ---------- next-air tokens ----------
  var RU_MONTH = '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(t){
    if (!t) return false;
    var s = (t||'').trim().toLowerCase();
    return /^\d{1,2}$/.test(s) || new RegExp('^'+RU_MONTH+'$','i').test(s) ||
           new RegExp('^'+EN_MONTH+'$','i').test(s) || /^\d{4}$/.test(s);
  }
  var RE_NEXT_LABEL = /^(?:следующ(?:ая|ий|ие|ее)(?:\s+(?:серия|эпизод))?|next(?:\s+(?:episode|ep))?)\s*:?\s*$/i;
  var RE_REMAIN_LABEL  = /^(?:осталось\s+дней|days\s+left)\s*:?$/i;
  var RE_REMAIN_INLINE = /^(?:осталось\s+дней|days\s+left)\s*:?[\s\d]+$/i;

  function isNextLabelToken(t){ return !!t && RE_NEXT_LABEL.test(t); }
  function isRemainLabelToken(t){ return !!t && RE_REMAIN_LABEL.test(t); }
  function isRemainInlineToken(t){ return !!t && RE_REMAIN_INLINE.test(t); }

  // ---------- details line cleanup ----------
  function stripTokensIn(container){
    if (!container) return;
    var spans = container.querySelectorAll('span');
    var rm = [], i, s, txt;

    for (i=0;i<spans.length;i++){
      s = spans[i]; if (!s) continue; txt = textOf(s);

      // Movies: HH:MM
      if (isTimeToken(txt)){
        var p1=s.previousElementSibling, n1=s.nextElementSibling;
        if (isSeparatorNode(p1)) rm.push(p1); else if (isSeparatorNode(n1)) rm.push(n1);
        rm.push(s); continue;
      }
      // Series: inline seasons/episodes
      if (isSeriesInlineToken(txt)){
        var p2=s.previousElementSibling, n2=s.nextElementSibling;
        if (isSeparatorNode(p2)) rm.push(p2); else if (isSeparatorNode(n2)) rm.push(n2);
        rm.push(s); continue;
      }
      // Series: split "label" + number
      if (isSeriesLabelToken(txt)){
        var left=s.previousElementSibling; if (isSeparatorNode(left)) rm.push(left);
        var n=s.nextElementSibling; if (isSeparatorNode(n)) { rm.push(n); n=s.nextElementSibling; }
        if (n && isPureNumber(textOf(n))){
          var after=n.nextElementSibling; if (isSeparatorNode(after)) rm.push(after);
          rm.push(n);
        } else {
          var rsep=s.nextElementSibling; if (isSeparatorNode(rsep)) rm.push(rsep);
        }
        rm.push(s); continue;
      }
      // Series: "Next … / Days left: N"
      if (isNextLabelToken(txt) || isRemainInlineToken(txt)){
        var pn=s.previousElementSibling; if (isSeparatorNode(pn)) rm.push(pn);
        rm.push(s);
        var cur=s.nextElementSibling, guard=0;
        while (cur && guard++<20){
          var tc=textOf(cur);
          if (isSeparatorNode(cur) || isDatePiece(tc) || isPureNumber(tc) ||
              isRemainInlineToken(tc) || isRemainLabelToken(tc)) { rm.push(cur); cur=cur.nextElementSibling; continue; }
          break;
        }
        continue;
      }
      if (isRemainLabelToken(txt)){
        var pr=s.previousElementSibling; if (isSeparatorNode(pr)) rm.push(pr);
        var nr=s.nextElementSibling; if (isSeparatorNode(nr)) { rm.push(nr); nr=s.nextElementSibling; }
        if (nr && isPureNumber(textOf(nr))){
          var an=nr.nextElementSibling; if (isSeparatorNode(an)) rm.push(an);
          rm.push(nr);
        } else {
          var r2=s.nextElementSibling; if (isSeparatorNode(r2)) rm.push(r2);
        }
        rm.push(s); continue;
      }
    }
    // dedup & remove
    var uniq=[], j; for (j=0;j<rm.length;j++) if (uniq.indexOf(rm[j])===-1) uniq.push(rm[j]);
    for (j=0;j<uniq.length;j++) removeNode(uniq[j]);
    cleanupLeadingSeparators(container);
  }
  function scanDetails(root){
    var scope=root||document, nodes=scope.querySelectorAll(SELECTORS_DETAILS), i;
    for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
  }
  function observeDetails(el){
    if (!el || el.getAttribute('data-hds-observed')==='1') return;
    var pend=false, mo=new MutationObserver(function(){ if (pend) return; pend=true; setTimeout(function(){ pend=false; stripTokensIn(el); },0); });
    mo.observe(el,{childList:true,subtree:true}); el.setAttribute('data-hds-observed','1');
  }
  function attachDetailsObservers(root){
    var nodes=(root||document).querySelectorAll(SELECTORS_DETAILS), i;
    for (i=0;i<nodes.length;i++) observeDetails(nodes[i]);
  }

  // ---------- sections to remove (comments & seasons) ----------
  var RE_ACTORS = /^(?:Актёры|Актеры|В ролях|actors?|cast)$/i;
  var RE_RECS   = /^(?:Рекомендац[^\n\r]*|recommendations?)$/i;
  var RE_COLL   = /^(?:Коллекц[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD = /^(?:комментарии|comments?|reviews|отзывы)$/i;
  var RE_SEASONS_HEAD = /^(?:сезон(?:\s*\d+)?|сезоны(?:\s*\d+)?|seasons?(?:\s*\d+)?)$/i;

  var COMM_CLASS_SELECTOR = '[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]';

  function findFirstHeading(re, root){
    var scope=root||document, nodes=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'), i,n,t;
    for (i=0;i<nodes.length;i++){ n=nodes[i]; t=norm(textOf(n)); if (t && re.test(t)) return n; }
    return null;
  }
  function climbToSection(el, maxUp){
    var up=el, steps=0; maxUp=maxUp||8;
    while (up && steps++<maxUp){
      if (up.parentElement && (up.previousElementSibling || up.nextElementSibling)) return up;
      up = up.parentElement;
    }
    return el;
  }
  function removeSectionNode(node){
    if (!node) return;
    var prev = node.previousElementSibling;
    removeNode(node);
    // зачистим пустые «прокладки» сразу рядом
    while (prev && norm(textOf(prev))==='' && (!prev.children || prev.children.length===0)){
      var p = prev.previousElementSibling;
      removeNode(prev);
      prev = p;
    }
  }

  // A) по заголовку — удалить целую секцию комментариев
  function nukeCommentsByHeading(root){
    var scope = root || document;
    var heads = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i,h,t,sec,sib;
    for (i=0;i<heads.length;i++){
      h=heads[i]; t=norm(textOf(h));
      if (!t) continue;
      if (RE_COMM_HEAD.test(t)){
        sec = climbToSection(h,10);
        removeSectionNode(sec);
        sib = h.nextElementSibling; if (sib) removeSectionNode(sib);
      }
    }
  }

  // B) удалить всё между «Актёры» ←→ первой из (Рекомендации|Коллекция), если это похоже на комментарии
  function nukeBetweenActorsAndNext(root){
    var scope=root||document;
    var hActors=findFirstHeading(RE_ACTORS,scope);
    var hNext = findFirstHeading(RE_RECS,scope) || findFirstHeading(RE_COLL,scope);
    if (!hActors && !hNext){
      var any = scope.querySelectorAll(COMM_CLASS_SELECTOR), i;
      for (i=0;i<any.length;i++) removeSectionNode(any[i]);
      return;
    }
    if (!hNext){
      var any2 = scope.querySelectorAll(COMM_CLASS_SELECTOR), k;
      for (k=0;k<any2.length;k++) removeSectionNode(any2[k]);
      return;
    }
    var secActors = hActors ? climbToSection(hActors,10) : null;
    var secNext   = climbToSection(hNext,10);

    var cur = secNext.previousElementSibling, guard=0;
    while (cur && guard++<80){
      if (secActors && cur===secActors) break;
      var looks=false;
      if (cur.querySelector) {
        if (cur.querySelector(COMM_CLASS_SELECTOR)) looks=true;
        var head = cur.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
        if (!looks && head && RE_COMM_HEAD.test(norm(textOf(head)))) looks=true;
        var plusBtn = cur.querySelector('button,div,span');
        if (!looks && plusBtn && textOf(plusBtn)==='+') looks=true;
      }
      if (looks || (norm(textOf(cur))==='' && (!cur.children || cur.children.length<=1))){
        var next = cur.previousElementSibling;
        removeSectionNode(cur);
        cur = next;
        continue;
      }
      break;
    }
  }

  // C) по классам/ID — добивка
  function nukeByClasses(root){
    var scope=root||document, nodes=scope.querySelectorAll(COMM_CLASS_SELECTOR), i;
    for (i=0;i<nodes.length;i++) removeSectionNode(nodes[i]);
  }

  // D) секции сезонов (большой блок)
  function nukeSeasonsSections(root){
    var scope = root || document;
    var nodes = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i, el, t, sec, sib;
    for (i=0;i<nodes.length;i++){
      el = nodes[i]; t = norm(textOf(el));
      if (!t) continue;
      if (RE_SEASONS_HEAD.test(t)){
        sec = climbToSection(el,10);
        removeSectionNode(sec);
        sib = el.nextElementSibling; if (sib) removeSectionNode(sib);
      }
    }
  }

  function nukeAllNoise(root){
    nukeCommentsByHeading(root);
    nukeBetweenActorsAndNext(root);
    nukeByClasses(root);
    nukeSeasonsSections(root);
    forceReflow();
  }

  // ---------- CSS safety net ----------
  function injectCssOnce(){
    if (document.getElementById('hds-comments-css')) return;
    var style = document.createElement('style');
    style.id = 'hds-comments-css';
    style.type = 'text/css';
    style.textContent =
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"],' +
      '.full [class*="review"], .full-start [class*="review"], .full-start-new [class*="review"],' +
      '.full [id*="review"], .full-start [id*="review"], .full-start-new [id*="review"]{display:none !important;}';
    document.head.appendChild(style);
  }

  // ---------- root observer ----------
  var rootObserved=false;
  function ensureRootObserver(){
    if (rootObserved || !document.body) return;
    var pend=false, mo=new MutationObserver(function(){
      if (pend) return; pend=true;
      setTimeout(function(){
        pend=false;
        scanDetails(document);
        nukeAllNoise(document);
        injectCssOnce();
      },30);
    });
    mo.observe(document.body,{childList:true,subtree:true});
    rootObserved=true;
  }

  // ---------- events & boot ----------
  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      setTimeout(function(){
        scanDetails(document);
        attachDetailsObservers(document);
        nukeAllNoise(document);
        injectCssOnce();
        ensureRootObserver();
      },50);
    }
  }
  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(function(){
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    },200);
    return true;
  }
  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); },200);
    else setTimeout(function(){
      scanDetails(document);
      attachDetailsObservers(document);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    },200);
  })();

})();
