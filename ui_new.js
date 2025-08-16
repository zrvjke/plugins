/**
 * Lampa plugin: Hide Details Noise
 *  - Movies: remove HH:MM from details line
 *  - Series: remove Seasons/Episodes in details line + "Следующая … / Осталось дней: N"
 *  - REMOVE Comments section (вокруг «Актёры», якорные прокладки)
 *  - REMOVE full Seasons section (диапазон "Сезон …" → перед "Актёры")
 *  - Ghost-neutralization: моментально обнуляю размеры/фокус до удаления,
 *    чтобы не было «зацепа» скролла за невидимые якоря
 *
 * Version: 2.0.0
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function textOf(node){ return (node && (node.textContent || node.innerText) || '').trim(); }
  function removeNode(n){ if (n && n.parentNode) n.parentNode.removeChild(n); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function isPureNumber(s){ return /^\d+$/.test((s||'').trim()); }
  function isTimeToken(s){ return /^\d{1,2}:\d{2}$/.test((s||'').trim()); }

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

  // ---------- neutralize (обнуляем габариты и фокус ДО удаления) ----------
  var ANCHOR_CLASS_RE = /(anchor|line__head|line__title|line-head)/i;
  var FOCUS_ATTR_RE = /^(tabindex|role|aria-.*|data-uid|data-focus|data-selector|data-nav|id)$/i;

  function neutralizeNode(n){
    if (!n || n.getAttribute('data-hds-ghost')==='1') return;
    n.setAttribute('data-hds-ghost','1');
    // убрать фокус/якорь
    try{
      // снять известные фокус-атрибуты
      var attrs = n.getAttributeNames ? n.getAttributeNames() : [];
      for (var i=0;i<attrs.length;i++){
        var a = attrs[i];
        if (FOCUS_ATTR_RE.test(a)) n.removeAttribute(a);
      }
      // и с потомков
      var all = n.querySelectorAll('*');
      for (var j=0;j<all.length;j++){
        var el = all[j], names = el.getAttributeNames ? el.getAttributeNames() : [];
        for (var k=0;k<names.length;k++){
          var nm = names[k];
          if (FOCUS_ATTR_RE.test(nm)) el.removeAttribute(nm);
        }
      }
      // обнулить размеры и клики
      n.style.setProperty('display','block','important');
      n.style.setProperty('height','0','important');
      n.style.setProperty('min-height','0','important');
      n.style.setProperty('max-height','0','important');
      n.style.setProperty('padding','0','important');
      n.style.setProperty('margin','0','important');
      n.style.setProperty('overflow','hidden','important');
      n.style.setProperty('pointer-events','none','important');
    }catch(e){}
  }

  // ---------- details line (инфострока) ----------
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

  function stripTokensIn(container){
    if (!container) return;
    var spans = container.querySelectorAll('span');
    var rm = [], i, s, txt;

    for (i=0;i<spans.length;i++){
      s = spans[i]; if (!s) continue; txt = textOf(s);

      if (isTimeToken(txt)){
        var p1=s.previousElementSibling, n1=s.nextElementSibling;
        if (isSeparatorNode(p1)) rm.push(p1); else if (isSeparatorNode(n1)) rm.push(n1);
        rm.push(s); continue;
      }
      if (isSeriesInlineToken(txt)){
        var p2=s.previousElementSibling, n2=s.nextElementSibling;
        if (isSeparatorNode(p2)) rm.push(p2); else if (isSeparatorNode(n2)) rm.push(n2);
        rm.push(s); continue;
      }
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
      if (/^(?:осталось\s+дней|days\s+left)\s*:?\s*\d*\s*$/i.test(txt)){
        var pr=s.previousElementSibling; if (isSeparatorNode(pr)) rm.push(pr);
        var nr=s.nextElementSibling; if (isSeparatorNode(nr)) { rm.push(nr); nr=nr.nextElementSibling; }
        if (nr && isPureNumber(textOf(nr))){ var an=nr.nextElementSibling; if (isSeparatorNode(an)) rm.push(an); rm.push(nr); }
        rm.push(s); continue;
      }
    }
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

  // ---------- секции (актеры/реком/коллекции/комменты/сезоны) ----------
  var RE_ACTORS       = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  var RE_RECS         = /^(?:рекомендац[^\n\r]*|recommendations?)$/i;
  var RE_COLL         = /^(?:коллекц[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD    = /^(?:комментарии|comments?|reviews|отзывы)$/i;
  var RE_SEASONS_HEAD = /^(?:сезон(?:\s*\d+)?|сезоны(?:\s*\d+)?|seasons?(?:\s*\d+)?)$/i;

  var COMM_CLASS_SELECTOR = '[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]';

  function containsHeading(el, re){
    if (!el) return false;
    var nodes = el.querySelectorAll && el.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    if (!nodes) return false;
    for (var i=0;i<nodes.length;i++){ if (re.test(norm(textOf(nodes[i])))) return true; }
    return false;
  }
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
  function isAnchorish(el){
    var cls = ((el && el.className)||'')+'';
    return ANCHOR_CLASS_RE.test(cls);
  }
  function maybeGhostAndRemove(el){
    if (!el) return;
    neutralizeNode(el); // моментально обнуляю габариты и фокус
    removeNode(el);     // затем вырезаю
  }
  function removeSectionNode(node){
    if (!node) return;
    // не трогаю секцию, если внутри «Актёры»
    if (containsHeading(node, RE_ACTORS)) return;
    var prev = node.previousElementSibling;
    maybeGhostAndRemove(node);
    // зачистка прокладок слева
    while (prev){
      if (containsHeading(prev, RE_ACTORS)) break;
      var t = norm(textOf(prev));
      if (t==='' || isAnchorish(prev) || RE_SEASONS_HEAD.test(t) || RE_COMM_HEAD.test(t)){
        var p = prev.previousElementSibling;
        maybeGhostAndRemove(prev);
        prev = p;
        continue;
      }
      break;
    }
  }

  // Комментарии по заголовку
  function nukeCommentsByHeading(root){
    var scope=root||document, heads=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    for (var i=0;i<heads.length;i++){
      var h=heads[i], t=norm(textOf(h));
      if (t && RE_COMM_HEAD.test(t)){
        var sec = climbToSection(h,10);
        removeSectionNode(sec);
        var sib = h.nextElementSibling; if (sib) removeSectionNode(sib);
      }
    }
  }
  // От Реком/Коллекции назад до Актёров
  function nukeBetweenActorsAndNext(root){
    var scope=root||document;
    var hActors=findFirstHeading(RE_ACTORS,scope);
    var hNext = findFirstHeading(RE_RECS,scope) || findFirstHeading(RE_COLL,scope);
    if (!hNext){
      var any2 = scope.querySelectorAll(COMM_CLASS_SELECTOR+', [class*="anchor"], [id*="anchor"]');
      for (var k=0;k<any2.length;k++) removeSectionNode(any2[k]);
      return;
    }
    var secActors = hActors ? climbToSection(hActors,10) : null;
    var secNext   = climbToSection(hNext,10);

    var cur = secNext.previousElementSibling, guard=0;
    while (cur && guard++<120){
      if (secActors && (cur===secActors || containsHeading(cur, RE_ACTORS))) break;
      var looks = isAnchorish(cur) ||
                  (cur.querySelector && cur.querySelector(COMM_CLASS_SELECTOR)) ||
                  containsHeading(cur, RE_COMM_HEAD) ||
                  norm(textOf(cur))==='';
      if (looks){
        var next = cur.previousElementSibling;
        removeSectionNode(cur);
        cur = next;
        continue;
      }
      break;
    }
  }
  // Вперёд от Актёров: вырезаю только «мусор» до живой секции
  function nukeForwardFromActors(root){
    var scope=root||document;
    var hActors=findFirstHeading(RE_ACTORS,scope);
    if (!hActors) return;
    var start = climbToSection(hActors,10);
    var cur = start.nextElementSibling, guard=0;
    while (cur && guard++<120){
      // стоп на живых секциях
      var head = cur.querySelector && cur.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
      var ht = head ? norm(textOf(head)) : '';
      if (RE_RECS.test(ht) || RE_COLL.test(ht) || RE_ACTORS.test(ht)) break;

      var looks = isAnchorish(cur) ||
                  (cur.querySelector && cur.querySelector(COMM_CLASS_SELECTOR)) ||
                  containsHeading(cur, RE_COMM_HEAD) ||
                  norm(textOf(cur))==='';
      if (looks){
        var next = cur.nextElementSibling;
        removeSectionNode(cur);
        cur = next;
        continue;
      }
      break;
    }
  }
  // Добивка по классам
  function nukeByClasses(root){
    var scope=root||document, nodes=scope.querySelectorAll(COMM_CLASS_SELECTOR+', [class*="anchor"], [id*="anchor"]');
    for (var i=0;i<nodes.length;i++) removeSectionNode(nodes[i]);
  }
  // Сезоны: диапазон "Сезон …" → до «Актёры»
  function nukeSeasonsRange(root){
    var scope=root||document;
    var hSeas  = findFirstHeading(RE_SEASONS_HEAD, scope);
    if (!hSeas) return;
    var start = climbToSection(hSeas, 10);
    // зачистка левых прокладок
    var prev = start.previousElementSibling;
    while (prev){
      if (containsHeading(prev, RE_ACTORS)) break;
      var pt = norm(textOf(prev));
      if (pt==='' || isAnchorish(prev) || RE_SEASONS_HEAD.test(pt)){
        var pp = prev.previousElementSibling;
        maybeGhostAndRemove(prev);
        prev = pp;
        continue;
      }
      break;
    }
    var hActors = findFirstHeading(RE_ACTORS, scope);
    var endSection = hActors ? climbToSection(hActors,10) : null;
    var cur = start, guard=0;
    while (cur && guard++<200){
      if (endSection && (cur===endSection || containsHeading(cur, RE_ACTORS))) break;
      var next = cur.nextElementSibling;
      removeSectionNode(cur);
      cur = next;
    }
  }

  function nukeAllNoise(root){
    nukeCommentsByHeading(root);
    nukeBetweenActorsAndNext(root);
    nukeForwardFromActors(root);
    nukeByClasses(root);
    nukeSeasonsRange(root);
    forceReflow();
  }

  // ---------- CSS страховка ----------
  function injectCssOnce(){
    if (document.getElementById('hds-comments-css')) return;
    var style = document.createElement('style');
    style.id = 'hds-comments-css';
    style.type = 'text/css';
    style.textContent =
      '[data-hds-ghost="1"]{display:block !important;height:0 !important;min-height:0 !important;max-height:0 !important;padding:0 !important;margin:0 !important;overflow:hidden !important;pointer-events:none !important;}\n' +
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"],' +
      '.full [class*="review"], .full-start [class*="review"], .full-start-new [class*="review"],' +
      '.full [id*="review"], .full-start [id*="review"], .full-start-new [id*="review"]{display:none !important;}';
    document.head.appendChild(style);
  }

  // ---------- INSTANT observer: нейтрализация до регистрации якоря ----------
  var instantObserved=false;
  function ensureInstantObserver(){
    if (instantObserved || !document.body) return;
    var mo = new MutationObserver(function(muts){
      for (var m=0;m<muts.length;m++){
        var mut = muts[m];
        if (!mut.addedNodes) continue;
        for (var i=0;i<mut.addedNodes.length;i++){
          var node = mut.addedNodes[i];
          if (!(node instanceof HTMLElement)) continue;

          // если рядом с «Актёры» — нейтрализуем любые якорные/комментные/пустые блоки мгновенно
          if (isAnchorish(node) || node.matches && node.matches(COMM_CLASS_SELECTOR)){
            neutralizeNode(node);
            // удаляем в тот же кадр
            removeNode(node);
            continue;
          }
          // если узел содержит заголовок «Комментарии»
          if (containsHeading(node, RE_COMM_HEAD)){
            neutralizeNode(node);
            removeNode(node);
            continue;
          }
        }
      }
    });
    // наблюдаем основные контейнеры карточки
    var roots = document.querySelectorAll('.full, .full-start, .full-start-new, .content, .layout__body');
    for (var r=0;r<roots.length;r++){
      mo.observe(roots[r], {childList:true, subtree:true});
    }
    instantObserved=true;
  }

  // ---------- root observer (дебаунс) ----------
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
      },20);
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
        ensureInstantObserver();  // нейтрализую узлы сразу при появлении
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
      ensureInstantObserver();
      ensureRootObserver();
    },100);
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
      ensureInstantObserver();
      ensureRootObserver();
    },200);
  })();

})();

