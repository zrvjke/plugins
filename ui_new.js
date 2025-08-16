/**
 * Lampa plugin: Hide Details Noise (v2.3.0)
 *  - Movies: remove HH:MM in details line
 *  - Series: remove Seasons/Episodes in details line + "Следующая … / Осталось дней: N"
 *  - Fully remove Comments section (между «Актёры» → «Рекомендации»/«Коллекция») + якорные прокладки
 *  - Remove full Seasons section (диапазон «Сезон …» → перед «Актёры»)
 *  - Scroll fix: ghost-neutralization + overflow-anchor:none + interception of anchor/comment inserts
 *  - ES5, Unicode-safe
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function txt(n){ return (n && (n.textContent || n.innerText) || '').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function rm(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }
  function uniq(arr){ var out=[],i; for(i=0;i<arr.length;i++) if(out.indexOf(arr[i])===-1) out.push(arr[i]); return out; }

  function isNum(s){ return /^\d+$/.test((s||'').trim()); }
  function isTime(s){ return /^\d{1,2}:\d{2}$/.test((s||'').trim()); }
  function isSeparator(el){
    if(!el) return false;
    var cls = (el.className||'')+'';
    var t = txt(el);
    return /full-start.*__split/.test(cls) || /^[.\u2022\u00B7|\/]$/.test(t);
  }
  function cleanupLeadingSep(container){
    if(!container) return;
    var f = container.firstElementChild;
    while(f && isSeparator(f)){ rm(f); f = container.firstElementChild; }
  }
  function forceReflow(){
    try{
      void document.body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
      var sc = document.querySelectorAll('.scroll, .content, .layout__body, .full, .full-start, .full-start-new');
      for(var i=0;i<sc.length;i++){ sc[i].scrollTop = sc[i].scrollTop; }
    }catch(e){}
  }

  // ---------- ghost-neutralize (до удаления) ----------
  var ANCHOR_CLASS_RE = /(anchor|line__head|line__title|line-head)/i;
  var FOCUS_ATTR_RE = /^(tabindex|role|aria-.*|data-uid|data-focus|data-selector|data-nav|id)$/i;

  function ghost(n){
    if(!n || n.getAttribute('data-hds-ghost')==='1') return;
    n.setAttribute('data-hds-ghost','1');
    try{
      var names = n.getAttributeNames ? n.getAttributeNames() : [];
      for(var i=0;i<names.length;i++) if(FOCUS_ATTR_RE.test(names[i])) n.removeAttribute(names[i]);
      var all = n.querySelectorAll ? n.querySelectorAll('*') : [];
      for(var j=0;j<all.length;j++){
        var a = all[j], nm = a.getAttributeNames ? a.getAttributeNames() : [];
        for(var k=0;k<nm.length;k++) if(FOCUS_ATTR_RE.test(nm[k])) a.removeAttribute(nm[k]);
      }
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
  function ghostAndRemove(n){ if(!n) return; ghost(n); rm(n); }

  // ---------- details line (инфострока) ----------
  var RU_SEASON  = '(?:сезон(?:а|ы|ов)?)';
  var RU_EPISODE = '(?:серия|серии|серий)';
  var RE_LABEL = new RegExp('^(?:'+RU_SEASON+'|'+RU_EPISODE+'|seasons?|episodes?)\\s*:?$','i');
  var RE_INLINE_SEASON  = new RegExp('^(?:'+RU_SEASON+'|seasons?)\\s*:?\\s*\\d+$','i');
  var RE_INLINE_EPISODE = new RegExp('^(?:'+RU_EPISODE+'|episodes?)\\s*:?\\s*\\d+$','i');
  var RE_INLINE_NUM_FIRST_SEASON  = new RegExp('^\\d+\\s*(?:'+RU_SEASON+'|seasons?)$','i');
  var RE_INLINE_NUM_FIRST_EPISODE = new RegExp('^\\d+\\s*(?:'+RU_EPISODE+'|episodes?)$','i');

  function isSeriesLabel(t){ return !!t && RE_LABEL.test(t); }
  function isSeriesInline(t){
    return !!t && (RE_INLINE_SEASON.test(t) || RE_INLINE_EPISODE.test(t) ||
                   RE_INLINE_NUM_FIRST_SEASON.test(t) || RE_INLINE_NUM_FIRST_EPISODE.test(t));
  }

  var RU_MONTH = '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function isDatePiece(t){
    if(!t) return false;
    var s = (t||'').trim().toLowerCase();
    return /^\d{1,2}$/.test(s) || new RegExp('^'+RU_MONTH+'$','i').test(s) ||
           new RegExp('^'+EN_MONTH+'$','i').test(s) || /^\d{4}$/.test(s);
  }
  function hasNextLabel(t){ return /следующ|next\b/i.test(t||''); }
  function hasRemainLabel(t){ return /осталось\s*дней|days\s*left/i.test(t||''); }
  function isSlash(t){ return /^[/|\\-]$/.test((t||'').trim()); }

  function stripDetails(container){
    if(!container) return;
    var spans = container.querySelectorAll('span');
    var del = [], i, s, t;

    for(i=0;i<spans.length;i++){
      s = spans[i]; if(!s) continue; t = txt(s);

      // Movies: HH:MM
      if(isTime(t)){
        var p1=s.previousElementSibling, n1=s.nextElementSibling;
        if(isSeparator(p1)) del.push(p1); else if(isSeparator(n1)) del.push(n1);
        del.push(s); continue;
      }
      // Series inline: "Сезон 1" / "1 сезон" / "Серии: 8"
      if(isSeriesInline(t)){
        var p2=s.previousElementSibling, n2=s.nextElementSibling;
        if(isSeparator(p2)) del.push(p2); else if(isSeparator(n2)) del.push(n2);
        del.push(s); continue;
      }
      // Series split: label + number
      if(isSeriesLabel(t)){
        var L=s.previousElementSibling; if(isSeparator(L)) del.push(L);
        var n=s.nextElementSibling; if(isSeparator(n)){ del.push(n); n=s.nextElementSibling; }
        if(n && isNum(txt(n))){
          var a=n.nextElementSibling; if(isSeparator(a)) del.push(a);
          del.push(n);
        } else {
          var r=s.nextElementSibling; if(isSeparator(r)) del.push(r);
        }
        del.push(s); continue;
      }
      // "Следующая … / Осталось дней: N"
      if(hasNextLabel(t) || hasRemainLabel(t)){
        var pp=s.previousElementSibling; if(isSeparator(pp)) del.push(pp);
        del.push(s);
        var cur=s.nextElementSibling, guard=0;
        while(cur && guard++<30){
          var tc=txt(cur);
          if(isSeparator(cur) || isSlash(tc) || isDatePiece(tc) || isNum(tc) ||
             hasRemainLabel(tc) || hasNextLabel(tc)) { del.push(cur); cur=cur.nextElementSibling; continue; }
          break;
        }
        continue;
      }
      if(/^(?:осталось\s+дней|days\s+left)\s*:?\s*\d*\s*$/i.test(t)){
        var pr=s.previousElementSibling; if(isSeparator(pr)) del.push(pr);
        var nr=s.nextElementSibling; if(isSeparator(nr)) { del.push(nr); nr=nr.nextElementSibling; }
        if(nr && isNum(txt(nr))){ var an=nr.nextElementSibling; if(isSeparator(an)) del.push(an); del.push(nr); }
        del.push(s); continue;
      }
    }
    del = uniq(del);
    for(i=0;i<del.length;i++) rm(del[i]);
    cleanupLeadingSep(container);
  }
  function scanDetails(root){
    var scope=root||document, nodes=scope.querySelectorAll(SELECTORS_DETAILS), i;
    for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);
  }
  function observeDetails(el){
    if(!el || el.getAttribute('data-hds-observed')==='1') return;
    var pend=false, mo=new MutationObserver(function(){ if(pend) return; pend=true; setTimeout(function(){ pend=false; stripDetails(el); },0); });
    mo.observe(el,{childList:true,subtree:true}); el.setAttribute('data-hds-observed','1');
  }
  function attachDetailsObservers(root){
    var nodes=(root||document).querySelectorAll(SELECTORS_DETAILS), i;
    for(i=0;i<nodes.length;i++) observeDetails(nodes[i]);
  }

  // ---------- sections (актеры/реком/коллекции/комменты/сезоны) ----------
  var RE_ACTORS       = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  var RE_RECS         = /^(?:рекомендац[^\n\r]*|recommendations?)$/i;
  var RE_COLL         = /^(?:коллекц[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD    = /^(?:комментарии|comments?|reviews|отзывы)$/i;
  var RE_SEASONS_HEAD = /^(?:сезон(?:\s*\d+)?|сезоны(?:\s*\d+)?|seasons?(?:\s*\d+)?)$/i;

  function findHeading(re, root){
    var scope=root||document, nodes=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'), i,n,t;
    for(i=0;i<nodes.length;i++){ n=nodes[i]; t=norm(txt(n)); if(t && re.test(t)) return n; }
    return null;
  }
  function hasHeading(el, re){
    if(!el) return false;
    var nodes = el.querySelectorAll ? el.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p') : [];
    for(var i=0;i<nodes.length;i++) if(re.test(norm(txt(nodes[i])))) return true;
    return false;
  }
  function climbSection(el, maxUp){
    var up=el, steps=0; maxUp=maxUp||10;
    while(up && steps++<maxUp){
      if(up.parentElement && (up.previousElementSibling || up.nextElementSibling)) return up;
      up = up.parentElement;
    }
    return el;
  }
  function protectActors(el){ return hasHeading(el, RE_ACTORS); }

  function removeSection(node){
    if(!node || protectActors(node)) return;
    var prev = node.previousElementSibling;
    ghostAndRemove(node);
    while(prev){
      if(protectActors(prev)) break;
      var t = norm(txt(prev)), cls=((prev.className||'')+'');
      if(t==='' || ANCHOR_CLASS_RE.test(cls) || RE_SEASONS_HEAD.test(t) || RE_COMM_HEAD.test(t)){
        var p = prev.previousElementSibling;
        ghostAndRemove(prev);
        prev = p;
        continue;
      }
      break;
    }
  }

  // Комментарии по заголовку
  function nukeCommentsByHead(root){
    var scope=root||document, heads=scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    for(var i=0;i<heads.length;i++){
      var h=heads[i], t=norm(txt(h));
      if(t && RE_COMM_HEAD.test(t)){
        var sec = climbSection(h,10);
        removeSection(sec);
        var sib = h.nextElementSibling; if(sib) removeSection(sib);
      }
    }
  }
  // Назад от Рекомендаций/Коллекции к Актёрам — выносим мусор/якоря/комменты
  function nukeBetweenActorsAndNext(root){
    var scope=root||document;
    var hActors=findHeading(RE_ACTORS,scope);
    var hNext = findHeading(RE_RECS,scope) || findHeading(RE_COLL,scope);
    if(!hNext){
      var any2 = scope.querySelectorAll('[class*="comment"],[id*="comment"],[class*="review"],[id*="review"], [class*="anchor"],[id*="anchor"]');
      for(var k=0;k<any2.length;k++) removeSection(any2[k]);
      return;
    }
    var secActors = hActors ? climbSection(hActors,10) : null;
    var secNext   = climbSection(hNext,10);

    var cur = secNext.previousElementSibling, guard=0;
    while(cur && guard++<120){
      if(secActors && (cur===secActors || hasHeading(cur, RE_ACTORS))) break;
      var looks = ANCHOR_CLASS_RE.test(((cur.className||'')+'')) ||
                  (cur.querySelector && (cur.querySelector('[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]'))) ||
                  hasHeading(cur, RE_COMM_HEAD) ||
                  norm(txt(cur))==='';
      if(looks){
        var next = cur.previousElementSibling;
        removeSection(cur);
        cur = next;
        continue;
      }
      break;
    }
  }
  // Вперёд от Актёров: вырезаем только мусор/якоря/комменты до живого блока (Recs/Collection)
  function nukeForwardFromActors(root){
    var scope=root||document;
    var hActors=findHeading(RE_ACTORS,scope);
    if(!hActors) return;
    var start = climbSection(hActors,10);
    var cur = start.nextElementSibling, guard=0;
    while(cur && guard++<120){
      var head = cur.querySelector && cur.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
      var ht = head ? norm(txt(head)) : '';
      if(RE_RECS.test(ht) || RE_COLL.test(ht) || RE_ACTORS.test(ht)) break;

      var looks = ANCHOR_CLASS_RE.test(((cur.className||'')+'')) ||
                  (cur.querySelector && (cur.querySelector('[class*="comment"],[id*="comment"],[class*="review"],[id*="review"]'))) ||
                  hasHeading(cur, RE_COMM_HEAD) ||
                  norm(txt(cur))==='';
      if(looks){
        var next = cur.nextElementSibling;
        removeSection(cur);
        cur = next;
        continue;
      }
      break;
    }
  }
  // Сезоны: диапазон «Сезон …» → до «Актёры»
  function nukeSeasonsRange(root){
    var scope=root||document;
    var hSeas  = findHeading(RE_SEASONS_HEAD, scope);
    if(!hSeas) return;
    var start = climbSection(hSeas, 10);

    // зачистить слева прокладки
    var prev = start.previousElementSibling;
    while(prev){
      if(protectActors(prev)) break;
      var pt = norm(txt(prev)), pcl=((prev.className||'')+'');
      if(pt==='' || ANCHOR_CLASS_RE.test(pcl) || RE_SEASONS_HEAD.test(pt)){
        var pp = prev.previousElementSibling;
        ghostAndRemove(prev);
        prev = pp;
        continue;
      }
      break;
    }
    var hActors = findHeading(RE_ACTORS, scope);
    var endSection = hActors ? climbSection(hActors,10) : null;
    var cur = start, guard=0;
    while(cur && guard++<200){
      if(endSection && (cur===endSection || hasHeading(cur, RE_ACTORS))) break;
      var next = cur.nextElementSibling;
      removeSection(cur);
      cur = next;
    }
  }

  function nukeAll(root){
    nukeCommentsByHead(root);
    nukeBetweenActorsAndNext(root);
    nukeForwardFromActors(root);
    nukeSeasonsRange(root);
    forceReflow();
  }

  // ---------- CSS страховка ----------
  function injectCssOnce(){
    if(document.getElementById('hds-css')) return;
    var style = document.createElement('style');
    style.id = 'hds-css';
    style.type = 'text/css';
    style.textContent =
      '[data-hds-ghost="1"]{display:block !important;height:0 !important;min-height:0 !important;max-height:0 !important;padding:0 !important;margin:0 !important;overflow:hidden !important;pointer-events:none !important;}\n' +
      // отключаем anchor-коррекции и snap на ключевых контейнерах карточки
      'html, body, .content, .scroll, .layout__body, .full, .full-start, .full-start-new{overflow-anchor:none !important;scroll-snap-type:none !important;}\n' +
      // на всякий случай — мгновенно скрыть любые comments/review по классам в зоне full
      '.full [class*="comment"], .full-start [class*="comment"], .full-start-new [class*="comment"],' +
      '.full [id*="comment"], .full-start [id*="comment"], .full-start-new [id*="comment"],' +
      '.full [class*="review"], .full-start [class*="review"], .full-start-new [class*="review"],' +
      '.full [id*="review"], .full-start [id*="review"], .full-start-new [id*="review"]{display:none !important;}';
    document.head.appendChild(style);
  }

  // ---------- Interception: не даём якорям/комментам успеть зарегистрироваться ----------
  var patched=false;
  function shouldNukeNode(node){
    if(!(node && node.nodeType===1)) return false;
    var t = norm(txt(node));
    var cls = ((node.className||'')+'');
    if(ANCHOR_CLASS_RE.test(cls)) return true;
    if(/comment|review/i.test(cls)) return true;
    if(/comment|review/i.test((node.id||''))) return true;
    // заголовки «Комментарии/Reviews»
    if(RE_COMM_HEAD.test(t) || hasHeading(node, RE_COMM_HEAD)) return true;
    // секции Seasons (могут появляться «под актёрами»)
    if(RE_SEASONS_HEAD.test(t)) return true;
    return false;
  }
  function patchDomInsertions(){
    if(patched) return; patched=true;
    var ap = Element.prototype.appendChild;
    var ib = Element.prototype.insertBefore;
    Element.prototype.appendChild = function(child){
      try{ if(shouldNukeNode(child)) { ghost(child); return ap.call(this, document.createComment('hds')); } }catch(e){}
      var res = ap.call(this, child);
      try{ if(shouldNukeNode(res)) ghostAndRemove(res); }catch(e){}
      return res;
    };
    Element.prototype.insertBefore = function(newNode, ref){
      try{ if(shouldNukeNode(newNode)) { ghost(newNode); return ib.call(this, document.createComment('hds'), ref); } }catch(e){}
      var res = ib.call(this, newNode, ref);
      try{ if(shouldNukeNode(res)) ghostAndRemove(res); }catch(e){}
      return res;
    };
  }

  // ---------- Instant observer: мгновенно нейтрализуем добавленные якоря/комменты ----------
  var instantObserved=false;
  function ensureInstantObserver(){
    if(instantObserved || !document.body) return;
    var mo = new MutationObserver(function(muts){
      for(var m=0;m<muts.length;m++){
        var mut = muts[m];
        if(!mut.addedNodes) continue;
        for(var i=0;i<mut.addedNodes.length;i++){
          var node = mut.addedNodes[i];
          if(!(node instanceof HTMLElement)) continue;
          if(shouldNukeNode(node)){ ghostAndRemove(node); continue; }
        }
      }
    });
    var roots = document.querySelectorAll('.full, .full-start, .full-start-new, .content, .layout__body');
    for(var r=0;r<roots.length;r++) mo.observe(roots[r], {childList:true, subtree:true});
    instantObserved=true;
  }

  // ---------- Debounced root observer ----------
  var rootObserved=false;
  function ensureRootObserver(){
    if(rootObserved || !document.body) return;
    var pend=false, mo=new MutationObserver(function(){
      if(pend) return; pend=true;
      setTimeout(function(){
        pend=false;
        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);
        nukeAll(document);
        injectCssOnce();
      },20);
    });
    mo.observe(document.body,{childList:true,subtree:true});
    rootObserved=true;
  }

  // ---------- Events & boot ----------
  function handleFullEvent(e){
    if(!e || !e.type) return;
    if(e.type==='build' || e.type==='open' || e.type==='complite'){
      // максимально рано и синхронно
      (function(){
        injectCssOnce();
        patchDomInsertions();
        ensureInstantObserver();

        var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
        for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);

        nukeAll(document);
        ensureRootObserver();
      })();
    }
  }
  function subscribeOnce(){
    if(typeof window==='undefined' || typeof window.Lampa==='undefined' || !window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', handleFullEvent);
    setTimeout(function(){
      injectCssOnce();
      patchDomInsertions();
      ensureInstantObserver();

      var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
      for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);

      nukeAll(document);
      ensureRootObserver();
    },100);
    return true;
  }
  (function waitForLampa(tries){
    tries=tries||0;
    if(subscribeOnce()) return;
    if(tries<200) setTimeout(function(){ waitForLampa(tries+1); },200);
    else setTimeout(function(){
      injectCssOnce();
      patchDomInsertions();
      ensureInstantObserver();

      var nodes=document.querySelectorAll(SELECTORS_DETAILS), i;
      for(i=0;i<nodes.length;i++) stripDetails(nodes[i]);

      nukeAll(document);
      ensureRootObserver();
    },200);
  })();

})();

