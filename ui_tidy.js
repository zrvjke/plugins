(function(){
  'use strict';
  /*
   * Lampa UI Tweaks — Quality / Genres Backdrop / Remove Comments
   * Version: 1.2.0 (2025-08-15)
   * Goal:
   *   1) Hide quality badges/labels everywhere it matters (cards, full pages, video blocks)
   *   2) Add a translucent backdrop under the genre tags (как в rt_rating.js идея «подложки»)
   *   3) Hide/disable the Comments tab & block on movie/series cards
   *
   * Design notes:
   *   - 100% ES5 for WebOS/Tizen compatibility (no arrow functions / optional chaining / let/const)
   *   - Defensive DOM work + MutationObserver (throttled) because Lampa rebuilds views on navigation
   *   - Minimal footprint, avoids layout shifts (“уехавшая вёрстка”) and stray bullets/markers (“точка слева”)
   */

  var DEBUG = false; // set true for console logs

  var CONFIG = {
    selectors: {
      // Containers where genres usually live in different Lampa skins
      genreContainers: [
        '.full-genres',
        '.details__genres',
        '.film__genres',
        '.full__genres',
        '.card__genres',
        '.tags--genres',
        '.tag-list.genres',
        '.genres',
        '[data-block="genres"]'
      ].join(','),

      // Known comments areas & tab content
      commentsBlocks: [
        '.comments',
        '.full-comments',
        '.panel-comments',
        '.tabs__content.comments',
        '.comments-block',
        '#comments',
        '[data-block="comments"]'
      ].join(','),

      // Tab titles (we'll hide the one that says Комментарии/Comments)
      commentsTabTitles: '.tabs__head .tabs__title, .tabs__head .tabs__button, .tabs__title',

      // Quality badges/labels inside common contexts
      qualityWithin: [
        '.card [class*="quality"], .card [data-quality]',
        '.full [class*="quality"], .full [data-quality]',
        '.video [class*="quality"], .video [data-quality]'
      ].join(',')
    },

    // Visual style of the backdrop under genres
    genreBackdrop: {
      background: 'rgba(0,0,0,0.35)',
      borderRadius: '12px'
    }
  };

  function log(){
    if(!DEBUG) return;
    try{ console.log.apply(console, ['[Lampa UI Tweaks]'].concat([].slice.call(arguments))); }catch(e){}
  }

  function injectCSS(css){
    try{
      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    }catch(e){ log('injectCSS error', e); }
  }

  // === 1) Hide quality badges (CSS + JS pass for stubborn nodes) ===
  function hideQualityBadges(){
    try{
      var nodes = document.querySelectorAll(CONFIG.selectors.qualityWithin);
      for(var i=0;i<nodes.length;i++){
        var el = nodes[i];
        // Avoid false-positives like progress/timeline widgets just in case
        var cls = (el.className||'') + ' ' + (el.parentNode&&el.parentNode.className||'');
        if(/progress|timeline|evolution|meter/i.test(cls)) continue;
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('hideQualityBadges error', e); }
  }

  // === 2) Remove/hide Comments tab and content ===
  function removeComments(){
    try{
      // Hide tab titles that match text
      var titles = document.querySelectorAll(CONFIG.selectors.commentsTabTitles);
      for(var i=0;i<titles.length;i++){
        var t = titles[i];
        var txt = (t.textContent||'').toLowerCase();
        if(txt.indexOf('коммент') !== -1 || txt.indexOf('comments') !== -1){
          t.style.setProperty('display','none','important');
          t.setAttribute('aria-hidden','true');
        }
      }
      // Hide known blocks
      var blocks = document.querySelectorAll(CONFIG.selectors.commentsBlocks);
      for(var j=0;j<blocks.length;j++){
        var b = blocks[j];
        b.style.setProperty('display','none','important');
        b.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('removeComments error', e); }
  }

  // === 3) Add translucent backdrop under genres (safe, no layout shifts) ===
  function addGenreBackdrop(){
    try{
      var containers = document.querySelectorAll(CONFIG.selectors.genreContainers);
      for(var i=0;i<containers.length;i++){
        var box = containers[i];
        if(!box || !box.parentNode) continue;

        // Mark processed containers to avoid duplicates
        if(box.getAttribute('data-ui-bg') === '1') continue;
        box.setAttribute('data-ui-bg','1');

        // Ensure container is a proper stacking context for the overlay
        var cs = window.getComputedStyle(box);
        var pos = (box.style.position||'') + ' ' + cs.position;
        if(!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

        // Add a scoping class for CSS resets (bullets, ::before)
        if((' ' + box.className + ' ').indexOf(' ui-genre-wrap ') === -1){
          box.className += (box.className ? ' ' : '') + 'ui-genre-wrap';
        }

        // Create overlay layer
        var bg = document.createElement('div');
        bg.className = 'ui-genre-bg';
        bg.style.position = 'absolute';
        bg.style.left = '0';
        bg.style.top = '0';
        bg.style.right = '0';
        bg.style.bottom = '0';
        bg.style.pointerEvents = 'none';
        bg.style.background = CONFIG.genreBackdrop.background;
        bg.style.borderRadius = CONFIG.genreBackdrop.borderRadius;
        bg.style.zIndex = '0';

        // Insert as last child so it spans the container without affecting flow
        box.appendChild(bg);

        // Raise actual genre tags above the overlay
        var kids = box.children;
        for(var k=0;k<kids.length;k++){
          var child = kids[k];
          if(child === bg) continue;
          if(!child.style) continue;
          child.style.position = child.style.position || 'relative';
          child.style.zIndex = '1';
        }
      }
    }catch(e){ log('addGenreBackdrop error', e); }
  }

  // === Observer (throttled) ===
  var mo = null;
  var refreshTimer = 0;
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){
      refreshTimer = 0;
      try{
        hideQualityBadges();
        removeComments();
        addGenreBackdrop();
      }catch(e){ log('refresh error', e); }
    }, 60); // throttle bursts of mutations
  }

  function observe(){
    try{
      if(mo) mo.disconnect();
      mo = new MutationObserver(function(){ scheduleRefresh(); });
      mo.observe(document.body, {childList:true, subtree:true});
    }catch(e){ log('observe error', e); }
  }

  // === DOM Ready helper ===
  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn,0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // === Init ===
  ready(function(){
    try{
      // Base CSS shields (fast path). JS will finish the job for dynamically inserted nodes.
      injectCSS([
        // 1) Quality badges (scoped to common areas to avoid global side-effects)
        '.card [class*="quality"], .card [data-quality],',
        '.full [class*="quality"], .full [data-quality],',
        '.video [class*="quality"], .video [data-quality]{display:none!important;}',

        // 2) Comments blocks (several known containers)
        '.comments, .full-comments, .panel-comments, .tabs__content.comments, .comments-block, #comments, [data-block="comments"]{display:none!important;}',

        // 3) Genres backdrop scaffolding + anti-bullet/anti-::before
        '.ui-genre-wrap{position:relative!important;}',
        '.ui-genre-wrap .ui-genre-bg{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:12px;background:rgba(0,0,0,0.35);z-index:0;}',
        '.ui-genre-wrap>*:not(.ui-genre-bg){position:relative;z-index:1;}',
        '.ui-genre-wrap, .ui-genre-wrap ul, .ui-genre-wrap li{list-style:none!important;padding-left:0!important;margin-left:0!important;}',
        '.ui-genre-wrap a::before, .ui-genre-wrap span::before, .ui-genre-wrap li::before{content:none!important;}'
      ].join('
'));

      // First pass
      hideQualityBadges();
      removeComments();
      addGenreBackdrop();

      // Keep it alive across navigation
      observe();

      // Export tiny handle for debugging
      window.__lampa_ui_tweaks__ = {
        version: '1.2.0',
        refresh: function(){ scheduleRefresh(); },
        debug: function(v){ DEBUG = !!v; log('debug', DEBUG); }
      };

      log('loaded v1.2.0');
    }catch(e){ log('init error', e); }
  });
})();
(function(){
  'use strict';
  /*
   * Lampa UI Tweaks — Quality / Genres Backdrop / Remove Comments
   * Version: 1.2.0 (2025-08-15)
   * Goal:
   *   1) Hide quality badges/labels everywhere it matters (cards, full pages, video blocks)
   *   2) Add a translucent backdrop under the genre tags (как в rt_rating.js идея «подложки»)
   *   3) Hide/disable the Comments tab & block on movie/series cards
   *
   * Design notes:
   *   - 100% ES5 for WebOS/Tizen compatibility (no arrow functions / optional chaining / let/const)
   *   - Defensive DOM work + MutationObserver (throttled) because Lampa rebuilds views on navigation
   *   - Minimal footprint, avoids layout shifts (“уехавшая вёрстка”) and stray bullets/markers (“точка слева”)
   */

  var DEBUG = false; // set true for console logs

  var CONFIG = {
    selectors: {
      // Containers where genres usually live in different Lampa skins
      genreContainers: [
        '.full-genres',
        '.details__genres',
        '.film__genres',
        '.full__genres',
        '.card__genres',
        '.tags--genres',
        '.tag-list.genres',
        '.genres',
        '[data-block="genres"]'
      ].join(','),

      // Known comments areas & tab content
      commentsBlocks: [
        '.comments',
        '.full-comments',
        '.panel-comments',
        '.tabs__content.comments',
        '.comments-block',
        '#comments',
        '[data-block="comments"]'
      ].join(','),

      // Tab titles (we'll hide the one that says Комментарии/Comments)
      commentsTabTitles: '.tabs__head .tabs__title, .tabs__head .tabs__button, .tabs__title',

      // Quality badges/labels inside common contexts
      qualityWithin: [
        '.card [class*="quality"], .card [data-quality]',
        '.full [class*="quality"], .full [data-quality]',
        '.video [class*="quality"], .video [data-quality]'
      ].join(',')
    },

    // Visual style of the backdrop under genres
    genreBackdrop: {
      background: 'rgba(0,0,0,0.35)',
      borderRadius: '12px'
    }
  };

  function log(){
    if(!DEBUG) return;
    try{ console.log.apply(console, ['[Lampa UI Tweaks]'].concat([].slice.call(arguments))); }catch(e){}
  }

  function injectCSS(css){
    try{
      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    }catch(e){ log('injectCSS error', e); }
  }

  // === 1) Hide quality badges (CSS + JS pass for stubborn nodes) ===
  function hideQualityBadges(){
    try{
      var nodes = document.querySelectorAll(CONFIG.selectors.qualityWithin);
      for(var i=0;i<nodes.length;i++){
        var el = nodes[i];
        // Avoid false-positives like progress/timeline widgets just in case
        var cls = (el.className||'') + ' ' + (el.parentNode&&el.parentNode.className||'');
        if(/progress|timeline|evolution|meter/i.test(cls)) continue;
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('hideQualityBadges error', e); }
  }

  // === 2) Remove/hide Comments tab and content ===
  function removeComments(){
    try{
      // Hide tab titles that match text
      var titles = document.querySelectorAll(CONFIG.selectors.commentsTabTitles);
      for(var i=0;i<titles.length;i++){
        var t = titles[i];
        var txt = (t.textContent||'').toLowerCase();
        if(txt.indexOf('коммент') !== -1 || txt.indexOf('comments') !== -1){
          t.style.setProperty('display','none','important');
          t.setAttribute('aria-hidden','true');
        }
      }
      // Hide known blocks
      var blocks = document.querySelectorAll(CONFIG.selectors.commentsBlocks);
      for(var j=0;j<blocks.length;j++){
        var b = blocks[j];
        b.style.setProperty('display','none','important');
        b.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('removeComments error', e); }
  }

  // === 3) Add translucent backdrop under genres (safe, no layout shifts) ===
  function addGenreBackdrop(){
    try{
      var containers = document.querySelectorAll(CONFIG.selectors.genreContainers);
      for(var i=0;i<containers.length;i++){
        var box = containers[i];
        if(!box || !box.parentNode) continue;

        // Mark processed containers to avoid duplicates
        if(box.getAttribute('data-ui-bg') === '1') continue;
        box.setAttribute('data-ui-bg','1');

        // Ensure container is a proper stacking context for the overlay
        var cs = window.getComputedStyle(box);
        var pos = (box.style.position||'') + ' ' + cs.position;
        if(!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

        // Add a scoping class for CSS resets (bullets, ::before)
        if((' ' + box.className + ' ').indexOf(' ui-genre-wrap ') === -1){
          box.className += (box.className ? ' ' : '') + 'ui-genre-wrap';
        }

        // Create overlay layer
        var bg = document.createElement('div');
        bg.className = 'ui-genre-bg';
        bg.style.position = 'absolute';
        bg.style.left = '0';
        bg.style.top = '0';
        bg.style.right = '0';
        bg.style.bottom = '0';
        bg.style.pointerEvents = 'none';
        bg.style.background = CONFIG.genreBackdrop.background;
        bg.style.borderRadius = CONFIG.genreBackdrop.borderRadius;
        bg.style.zIndex = '0';

        // Insert as last child so it spans the container without affecting flow
        box.appendChild(bg);

        // Raise actual genre tags above the overlay
        var kids = box.children;
        for(var k=0;k<kids.length;k++){
          var child = kids[k];
          if(child === bg) continue;
          if(!child.style) continue;
          child.style.position = child.style.position || 'relative';
          child.style.zIndex = '1';
        }
      }
    }catch(e){ log('addGenreBackdrop error', e); }
  }

  // === Observer (throttled) ===
  var mo = null;
  var refreshTimer = 0;
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){
      refreshTimer = 0;
      try{
        hideQualityBadges();
        removeComments();
        addGenreBackdrop();
      }catch(e){ log('refresh error', e); }
    }, 60); // throttle bursts of mutations
  }

  function observe(){
    try{
      if(mo) mo.disconnect();
      mo = new MutationObserver(function(){ scheduleRefresh(); });
      mo.observe(document.body, {childList:true, subtree:true});
    }catch(e){ log('observe error', e); }
  }

  // === DOM Ready helper ===
  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn,0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // === Init ===
  ready(function(){
    try{
      // Base CSS shields (fast path). JS will finish the job for dynamically inserted nodes.
      injectCSS([
        // 1) Quality badges (scoped to common areas to avoid global side-effects)
        '.card [class*="quality"], .card [data-quality],',
        '.full [class*="quality"], .full [data-quality],',
        '.video [class*="quality"], .video [data-quality]{display:none!important;}',

        // 2) Comments blocks (several known containers)
        '.comments, .full-comments, .panel-comments, .tabs__content.comments, .comments-block, #comments, [data-block="comments"]{display:none!important;}',

        // 3) Genres backdrop scaffolding + anti-bullet/anti-::before
        '.ui-genre-wrap{position:relative!important;}',
        '.ui-genre-wrap .ui-genre-bg{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:12px;background:rgba(0,0,0,0.35);z-index:0;}',
        '.ui-genre-wrap>*:not(.ui-genre-bg){position:relative;z-index:1;}',
        '.ui-genre-wrap, .ui-genre-wrap ul, .ui-genre-wrap li{list-style:none!important;padding-left:0!important;margin-left:0!important;}',
        '.ui-genre-wrap a::before, .ui-genre-wrap span::before, .ui-genre-wrap li::before{content:none!important;}'
      ].join('
'));

      // First pass
      hideQualityBadges();
      removeComments();
      addGenreBackdrop();

      // Keep it alive across navigation
      observe();

      // Export tiny handle for debugging
      window.__lampa_ui_tweaks__ = {
        version: '1.2.0',
        refresh: function(){ scheduleRefresh(); },
        debug: function(v){ DEBUG = !!v; log('debug', DEBUG); }
      };

      log('loaded v1.2.0');
    }catch(e){ log('init error', e); }
  });
})();
