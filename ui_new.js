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
  function forceReflow(){
    try{
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
      var scrollers = document.querySelectorAll('.scroll, .content, .layout__body, .full, .full-start, .full-start-new');
      for (var i=0;i<scrollers.length;i++){ scrollers[i].scrollTop = scrollers[i].scrollTop; }
    }catch(e){}
  }

  // ---------- series tokens (инфострока) ----------
  var RE_COMM_HEAD    = /^(?:комментарии|comments?|reviews|отзывы)$/i;

  // ---------- очистка инфостроки ----------
  function stripTokensIn(container){
    if (!container) return;
    var spans = container.querySelectorAll('span');
    var rm = [], i, s, txt;
    for (i=0;i<spans.length;i++){
      s = spans[i]; if (!s) continue; txt = textOf(s);

      // комментарии: удаляем только блоки комментариев и их якоря
      if (RE_COMM_HEAD.test(txt)){
        var p3=s.previousElementSibling, n3=s.nextElementSibling;
        if (isSeparatorNode(p3)) rm.push(p3);
        rm.push(s);
        var cur=n3, guard=0;
        while (cur && guard++<30){
          var tc=textOf(cur);
          if (isSeparatorNode(cur) || isSlashDivider(tc) || isDatePiece(tc) || isPureNumber(tc) ||
              containsRemainLabel(tc) || containsNextLabel(tc)) { rm.push(cur); cur=cur.nextElementSibling; continue; }
          break;
        }
        continue;
      }
    }

    // dedup & remove
    var uniq=[], j; for (j=0;j<rm.length;j++) if (uniq.indexOf(rm[j])===-1) uniq.push(rm[j]);
    for (j=0;j<uniq.length;j++) removeNode(uniq[j]);
    cleanupLeadingSeparators(container);
  }

  // ---------- секции (комменты/рекомендации/актеры/коллекция/сезоны) ----------
  var COMM_CLASS_SELECTOR = '[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]';

  function findFirstHeading(re, root){
    var scope=root||document, nodes=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'), i,n,t;
    for (i=0;i<nodes.length;i++){ n=nodes[i]; t=norm(textOf(n)); if (t && re.test(t)) return n; }
    return null;
  }
  function climbToSection(el, maxUp){
    var up=el, steps=0; maxUp=maxUp||10;
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
    // убрать пустые/якорные прокладки рядом
    while (prev){
      var txt = norm(textOf(prev));
      var cls = ((prev.className||'')+'').toLowerCase();
      if (txt==='' || /anchor|line__head|line__title|line-head/.test(cls)){
        var p = prev.previousElementSibling;
        removeNode(prev);
        prev = p;
        continue;
      }
      break;
    }
  }

  // A) комментарии
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

  // B) убираем комментарии между актерами и рекомендациями
  function nukeBetweenActorsAndNext(root){
    var scope=root||document;
    var hActors=findFirstHeading(/^(?:актёры|актеры|в ролях|actors?|cast)$/i,scope);
    var hNext = findFirstHeading(/^(?:рекомендац[^\n\r]*|recommendations?)$/i,scope) || findFirstHeading(/^(?:коллекц[^\n\r]*|collections?)$/i,scope);
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
        if (!looks && head && /^(?:комментарии|comments?|reviews|отзывы)$/i.test(norm(textOf(head)))) looks=true;
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

  // запускаем очистку на странице
  function nukeAllNoise(root){
    nukeCommentsByHeading(root);
    nukeBetweenActorsAndNext(root);
    forceReflow();
  }

  // ---------- root observer ----------
  var rootObserved=false;
  function ensureRootObserver(){
    if (rootObserved || !document.body) return;
    var pend=false, mo=new MutationObserver(function(){
      if (pend) return; pend=true;
      setTimeout(function(){
        pend=false;
        // инфострока + секции
        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
        nukeAllNoise(document);
      },25);
    });
    mo.observe(document.body,{childList:true,subtree:true});
    rootObserved=true;
  }

  // запускаем все события и подписки
  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      (function(){
        nukeAllNoise(document);
        ensureRootObserver();
      })();
    }
  }

  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(function(){
      nukeAllNoise(document);
      ensureRootObserver();
    },120);
    return true;
  }

  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); },200);
    else setTimeout(function(){
      nukeAllNoise(document);
      ensureRootObserver();
    },200);
  })();

})();

