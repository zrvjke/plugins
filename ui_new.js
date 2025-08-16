/**
 * Lampa plugin: Hide Details Noise
 *  - Movies: remove HH:MM from details line
 *  - Series: remove Seasons/Episodes in details line + "Следующая … / Осталось дней: N"
 *  - REMOVE Comments section (по заголовкам/классам, между Актёры → (Рекомендации|Коллекция))
 *  - REMOVE full Seasons block in series (диапазон "Сезон …" → перед "Актёры", включая якорные прокладки)
 *  - Hard remove + forced reflow to avoid focus/scroll stops
 *
 * Version: 1.8.9 (ES5, Unicode-safe)
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
  function forceReflow(){
    try{
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
      var scrollers = document.querySelectorAll('.scroll, .content, .layout__body, .full, .full-start, .full-start-new');
      for (var i=0;i<scrollers.length;i++){ scrollers[i].scrollTop = scrollers[i].scrollTop; }
    }catch(e){}
  }

  // ---------- series tokens (инфострока) ----------
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
  function containsNextLabel(t){ return /следующ|next\b/i.test(t||''); }
  function containsRemainLabel(t){ return /осталось\s*дней|days\s*left/i.test(t||''); }
  function isSlashDivider(t){ return /^[/|\\-]$/.test((t||'').trim()); }

  // ---------- очистка инфостроки ----------
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

      // Series: "Следующая … / Осталось дней: N" — ловлю и внутри одного span
      if (containsNextLabel(txt) || containsRemainLabel(txt)){
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

      // строгий "Осталось дней: N"
      if (/^(?:осталось\s+дней|days\s+left)\s*:?\s*\d*\s*$/i.test(txt)){
        var pr=s.previousElementSibling; if (isSeparatorNode(pr)) rm.push(pr);
        var nr=s.nextElementSibling; if (isSeparatorNode(nr)) { rm.push(nr); nr=nr.nextElementSibling; }
        if (nr && isPureNumber(textOf(nr))){ var an=nr.nextElementSibling; if (isSeparatorNode(an)) rm.push(an); rm.push(nr); }
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

  // ---------- секции (комменты/рекомендации/актеры/коллекция/сезоны) ----------
  var RE_ACTORS       = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  var RE_RECS         = /^(?:рекомендац[^\n\r]*|recommendations?)$/i;
  var RE_COLL         = /^(?:коллекц[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD    = /^(?:комментарии|comments?|reviews|отзывы)$/i;
  var RE_SEASONS_HEAD = /^(?:сезон(?:\s*\d+)?|сезоны(?:\s*\d+)?|seasons?(?:\s*\d+)?)$/i;

  var COMM_CLASS_SELECTOR = '[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]';
  var ANCHOR_CLASS_RE = /(anchor|line__head|line__title|line-head)/i;

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
      var cls = ((prev.className||'')+'');
      if (txt==='' || ANCHOR_CLASS_RE.test(cls) || RE_SEASONS_HEAD.test(txt)){
        var p = prev.previousElementSibling;
        removeNode(prev);
        prev = p;
        continue;
      }
      break;
    }
  }

  // A) комментарии по заголовку
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

  // B) назад от Рекомендаций/Коллекции (зачистка комментариев/якорей/пустых блоков)
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
      }
      var cls = ((cur.className||'')+'');
      if (!looks && (ANCHOR_CLASS_RE.test(cls) || norm(textOf(cur))==='')) looks = true;

      if (looks){
        var next = cur.previousElementSibling;
        removeSectionNode(cur);
        cur = next;
        continue;
      }
      break;
    }
  }

  // C) ВПЕРЁД от Актёров: удалить вообще всё до первой «живой» секции (Рекомендации|Коллекция)
  function nukeForwardFromActors(root){
    var scope=root||document;
    var hActors=findFirstHeading(RE_ACTORS,scope);
    if (!hActors) return;

    var start = climbToSection(hActors,10);
    var hNext = findFirstHeading(RE_RECS,scope) || findFirstHeading(RE_COLL,scope);
    if (!hNext){
      // если конца ещё нет — ничего радикально не трогаю (подгрузится → добъёт observer),
      // но аккуратно снимаю якорные/пустые прокладки сразу после актёров:
      var curA = start.nextElementSibling, guardA=0;
      while (curA && guardA++<40){
        var clsA = ((curA.className||'')+'');
        var txtA = norm(textOf(curA));
        if (ANCHOR_CLASS_RE.test(clsA) || txtA===''){
          var nxA = curA.nextElementSibling;
          removeSectionNode(curA);
          curA = nxA;
          continue;
        }
        break;
      }
      return;
    }
    // конец найден — удаляю всё между ними ПОЛНОСТЬЮ
    var end = climbToSection(hNext,10);
    var cur = start.nextElementSibling, guard=0;
    while (cur && guard++<200){
      if (cur===end) break;
      var next = cur.nextElementSibling;
      removeSectionNode(cur);
      cur = next;
    }
  }

  // D) добивка по классам/ID
  function nukeByClasses(root){
    var scope=root||document, nodes=scope.querySelectorAll(COMM_CLASS_SELECTOR+', [class*="anchor"], [id*="anchor"]'), i;
    for (i=0;i<nodes.length;i++) removeSectionNode(nodes[i]);
  }

  // E) сезоны: диапазон "Сезон …" → до «Актёры»
  function nukeSeasonsRange(root){
    var scope = root || document;
    var hSeas  = findFirstHeading(RE_SEASONS_HEAD, scope);
    if (!hSeas) return;

    var start = climbToSection(hSeas, 10);

    var prev = start.previousElementSibling;
    while (prev){
      var ptxt = norm(textOf(prev));
      var pcl  = ((prev.className||'')+'');
      if (ptxt==='' || ANCHOR_CLASS_RE.test(pcl) || RE_SEASONS_HEAD.test(ptxt)){
        var pp = prev.previousElementSibling;
        removeNode(prev);
        prev = pp;
        continue;
      }
      break;
    }

    var hActors = findFirstHeading(RE_ACTORS, scope);
    var hStop   = hActors || findFirstHeading(RE_COMM_HEAD, scope) || findFirstHeading(RE_RECS, scope) || findFirstHeading(RE_COLL, scope);
    var endSection = hStop ? climbToSection(hStop,10) : null;

    var cur = start, guard=0;
    while (cur && guard++<160){
      if (endSection && cur === endSection) break;
      var next = cur.nextElementSibling;
      removeSectionNode(cur);
      cur = next;
    }
  }

  function nukeAllNoise(root){
    nukeCommentsByHeading(root);
    nukeBetweenActorsAndNext(root);
    nukeForwardFromActors(root);  // ключевой фикс: убираю всё между Актёры → (Рекомендации|Коллекция)
    nukeByClasses(root);
    nukeSeasonsRange(root);
    forceReflow();
  }

  // ---------- CSS страхующий ----------
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
        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
        nukeAllNoise(document);
        injectCssOnce();
      },25);
    });
    mo.observe(document.body,{childList:true,subtree:true});
    rootObserved=true;
  }

  // ---------- events & boot ----------
  function handleFullEvent(e){
    if (!e || !e.type) return;
    if (e.type==='build' || e.type==='open' || e.type==='complite'){
      (function(){
        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
        nukeAllNoise(document);
        injectCssOnce();
        ensureRootObserver();
      })();
    }
  }
  function subscribeOnce(){
    if (typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(function(){
      var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
      for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    },120);
    return true;
  }
  (function waitForLampa(tries){
    tries=tries||0;
    if (subscribeOnce()) return;
    if (tries<200) setTimeout(function(){ waitForLampa(tries+1); },200);
    else setTimeout(function(){
      var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
      for (i=0;i<nodes.length;i++) stripTokensIn(nodes[i]);
      nukeAllNoise(document);
      injectCssOnce();
      ensureRootObserver();
    },200);
  })();

})();
