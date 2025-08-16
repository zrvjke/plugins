/**
 * Lampa plugin: Hide Details Noise
 *  - Movies: hide HH:MM in details line
 *  - Series: hide Seasons/Episodes in details line + "Next … / Days left: N"
 *  - Hide Comments section (between Actors → Recommendations/Collection or by heading/classes)
 *  - Hide Seasons block (the big section with season cards, e.g. "Сезон 5") on series pages
 *
 * Version: 1.7.0 (ASCII-safe, ES5)
 * Author: Roman + ChatGPT
 */

(function () {
  'use strict';

  var SELECTORS_DETAILS = '.full-start__details, .full-start__info, .full-start-new__details, .full-start-new__info';

  // ---------------- helpers ----------------
  function textOf(node){ return (node && (node.textContent || node.innerText) || '').trim(); }
  function removeNode(n){ if (n && n.parentNode) n.parentNode.removeChild(n); }
  function hideNode(n){ if (!n) return; n.style.display='none'; n.setAttribute('data-hds-hidden','1'); }
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

  // ---------- series tokens ----------
  var RU_SEASON  = '(?:\\u0441\\u0435\\u0437\\u043e\\u043d(?:\\u0430|\\u044b|\\u043e\\u0432)?)';
  var RU_EPISODE = '(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u0441\\u0435\\u0440\\u0438\\u0438|\\u0441\\u0435\\u0440\\u0438\\u0439)';

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
  var RU_MONTH = '(?:\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f|\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f|\\u043c\\u0430\\u0440\\u0442\\u0430|\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f|\\u043c\\u0430\\u044f|\\u0438\\u044e\\u043d\\u044f|\\u0438\\u044e\\u043b\\u044f|\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430|\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f|\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f|\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f)';
  var EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  function isDatePiece(t){
    if (!t) return false;
    var s = (t||'').trim().toLowerCase();
    return /^\d{1,2}$/.test(s) || new RegExp('^'+RU_MONTH+'$','i').test(s) ||
           new RegExp('^'+EN_MONTH+'$','i').test(s) || /^\d{4}$/.test(s);
  }
  var RE_NEXT_LABEL = new RegExp('^(?:\\u0421\\u043b\\u0435\\u0434\\u0443\\u044e\\u0449(?:\\u0430\\u044f|\\u0438\\u0439|\\u0435\\u0435|\\u0438\\u0435)?(?:\\s+(?:\\u0441\\u0435\\u0440\\u0438\\u044f|\\u044d\\u043f\\u0438\\u0437\\u043e\\u0434))?|next(?:\\s+(?:episode|ep))?)\\s*:?$', 'i');
  var RE_REMAIN_LABEL  = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?$', 'i');
  var RE_REMAIN_INLINE = new RegExp('^(?:\\u041e\\u0441\\u0442\\u0430\\u043b\\u043e\\u0441\\u044c\\s+\\u0434\\u043d\\u0435\\u0439|days\\s+left)\\s*:?\\s*\\d+\\s*$', 'i');

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

  // ---------- comments section killer ----------
  var RE_ACTORS = /^(?:\\u0410\\u043a\\u0442\\u0451\\u0440\\u044b|\\u0410\\u043a\\u0442\\u0435\\u0440\\u044b|\\u0412\\u0020\\u0440\\u043e\\u043b\\u044f\\u0445|actors?|cast)$/i;
  var RE_RECS   = /^(?:\\u0420\\u0435\\u043a\\u043e\\u043c\\u0435\\u043d\\u0434\\u0430\\u0446[^\n\r]*|recommendations?)$/i;
  var RE_COLL   = /^(?:\\u041a\\u043e\\u043b\\u043b\\u0435\\u043a\\u0446[^\n\r]*|collections?)$/i;
  var RE_COMM_HEAD = /^(?:\\u043a\\u043e\\u043c\\u043c\\u0435\\u043d\\u0442\\u0430\\u0440\\u0438\\u0438|comments?|reviews|\\u043e\\u0442\\u0437\\u044b\\u0432\\u044b)$/i;

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
  function looksLikeComments(el){
    if (!el) return false;
    if (el.querySelector(COMM_CLASS_SELECTOR)) return true;
    var head = el.querySelector('h1,h2,h3,h4,h5,h6,div,span,p');
    if (head && RE_COMM_HEAD.test(norm(textOf(head)))) return true;
    var plusBtn = el.querySelector('button,div,span');
    if (plusBtn && textOf(plusBtn)==='+') return true;
    return false;
  }

  function killCommentsByHeading(root){
    var scope = root || document;
    var heads = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i, h, t, section, sib;
    for (i=0;i<heads.length;i++){
      h = heads[i]; t = norm(textOf(h));
      if (!t) continue;
      if (RE_COMM_HEAD.test(t)){
        section = climbToSection(h, 10);
        hideNode(section);
        sib = h.nextElementSibling; if (sib) hideNode(sib);
      }
    }
  }
  function killBetweenActorsAndNext(root){
    var scope = root || document;
    var hActors = findFirstHeading(RE_ACTORS, scope);
    var hRecs   = findFirstHeading(RE_RECS, scope);
    var hColl   = findFirstHeading(RE_COLL, scope);
    var hNext   = hRecs || hColl;

    if (!hActors && !hNext){
      var any = scope.querySelectorAll(COMM_CLASS_SELECTOR), i;
      for (i=0;i<any.length;i++) hideNode(any[i]);
      return;
    }
    if (!hNext){
      var any2 = scope.querySelectorAll(COMM_CLASS_SELECTOR), k;
      for (k=0;k<any2.length;k++) hideNode(any2[k]);
      return;
    }
    var secActors = hActors ? climbToSection(hActors, 10) : null;
    var secNext   = climbToSection(hNext, 10);

    var cur = secNext.previousElementSibling, guard=0;
    while (cur && guard++<80){
      if (secActors && cur===secActors) break;
      if (looksLikeComments(cur)) { hideNode(cur); cur = cur.previousElementSibling; continue; }
      if (textOf(cur)==='' && (!cur.children || cur.children.length<=1)) { hideNode(cur); cur = cur.previousElementSibling; continue; }
      break;
    }
  }
  function killByClasses(root){
    var scope = root || document;
    var nodes = scope.querySelectorAll(COMM_CLASS_SELECTOR);
    var i; for (i=0;i<nodes.length;i++) hideNode(nodes[i]);
  }
  function killAllComments(root){
    killCommentsByHeading(root);
    killBetweenActorsAndNext(root);
    killByClasses(root);
  }

  // ---------- seasons section killer (big seasons list) ----------
  // Match headings like "Сезон", "Сезон 5", "Сезоны", "Seasons", "Season 3"
  var RE_SEASONS_HEAD = /^(?:\\u0441\\u0435\\u0437\\u043e\\u043d(?:\\s*\\d+)?|\\u0441\\u0435\\u0437\\u043e\\u043d\\u044b(?:\\s*\\d+)?|seasons?(?:\\s*\\d+)?)$/i;

  // Climb up from a heading to a container node that likely wraps the whole section
  function sectionFromHead(head, maxUp){
    var node = head, steps = 0; maxUp = maxUp || 10;
    while (node && steps++ < maxUp){
      // choose a parent that has siblings (i.e., is a section) and at least 2 children
      if (node.parentElement && (node.previousElementSibling || node.nextElementSibling) && node.children && node.children.length >= 1) {
        return node;
      }
      node = node.parentElement;
    }
    return head.parentElement || head;
  }

  function hideSeasonsSections(root){
    var scope = root || document;
    var nodes = scope.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p');
    var i, el, t, sec, sib;
    for (i=0;i<nodes.length;i++){
      el = nodes[i]; t = norm(textOf(el));
      if (!t) continue;
      if (RE_SEASONS_HEAD.test(t)){
        // это заголовок секции сезонов, прячем обёртку
        sec = sectionFromHead(el, 10);
        hideNode(sec);
        // если список сезонов вынесен в соседний узел — спрячем и его
        sib = el.nextElementSibling; if (sib) hideNode(sib);
      }
    }
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
        // details cleanup
        scanDetails(document);
        // comments + seasons sections
        killAllComments(document);
        hideSeasonsSections(document);
        injectCssOnce();
      },50);
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
        killAllComments(document);
        hideSeasonsSections(document);
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
      killAllComments(document);
      hideSeasonsSections(document);
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
      killAllComments(document);
      hideSeasonsSections(document);
      injectCssOnce();
      ensureRootObserver();
    },200);
  })();

})();
