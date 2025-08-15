(function(){
  'use strict';
  /*
   * Lampa UI Tweaks — hide quality, add genres backdrop, remove comments
   * Version: 1.3.0 (2025-08-15)
   * ES5-only (for WebOS/Tizen). No arrow functions, no optional chaining, no let/const.
   */

  var DEBUG = false; // switch to true to see logs in console

  var CONFIG = {
    selectors: {
      // 1) Containers where genres live (varies across skins/themes)
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

      // 2) Comments blocks (both standalone and inside tabs)
      commentsBlocks: [
        '.comments',
        '.full-comments',
        '.panel-comments',
        '.tabs__content.comments',
        '.comments-block',
        '#comments',
        '[data-block="comments"]'
      ].join(','),

      // 3) Comments tab titles/buttons
      commentsTabTitles: [
        '.tabs__head .tabs__title',
        '.tabs__head .tabs__button',
        '.tabs__title',
        '.tab__title',
        '.tab-button'
      ].join(','),

      // 4) Quality badges/labels
      qualityWithin: [
        '.card [class*="quality"]',
        '.card [data-quality]',
        '.full [class*="quality"]',
        '.full [data-quality]',
        '.video [class*="quality"]',
        '.video [data-quality]'
      ].join(',')
    },

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

  // 1) Hide quality badges
  function hideQualityBadges(){
    try{
      var list = document.querySelectorAll(CONFIG.selectors.qualityWithin);
      for(var i=0;i<list.length;i++){
        var el = list[i];
        var cls = (el.className||'') + ' ' + (el.parentNode && el.parentNode.className || '');
        if(/progress|timeline|evolution|meter/i.test(cls)) continue; // safety
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('hideQualityBadges error', e); }
  }

  // 2) Remove comments UI (tab and content)
  function removeComments(){
    try{
      var titles = document.querySelectorAll(CONFIG.selectors.commentsTabTitles);
      for(var i=0;i<titles.length;i++){
        var t = titles[i];
        var txt = (t.textContent||'').toLowerCase();
        if(txt.indexOf('коммент') !== -1 || txt.indexOf('comments') !== -1){
          t.style.setProperty('display','none','important');
          t.setAttribute('aria-hidden','true');
        }
      }
      var blocks = document.querySelectorAll(CONFIG.selectors.commentsBlocks);
      for(var j=0;j<blocks.length;j++){
        var b = blocks[j];
        b.style.setProperty('display','none','important');
        b.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('removeComments error', e); }
  }

  // 3) Add translucent backdrop under genres, no layout shift
  function addGenreBackdrop(){
    try{
      var containers = document.querySelectorAll(CONFIG.selectors.genreContainers);
      for(var i=0;i<containers.length;i++){
        var box = containers[i];
        if(!box || !box.parentNode) continue;
        if(box.getAttribute('data-ui-bg') === '1') continue; // processed
        box.setAttribute('data-ui-bg','1');

        // Ensure stacking context
        var cs = window.getComputedStyle(box);
        var pos = (box.style.position||'') + ' ' + cs.position;
        if(!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

        // Mark with helper class to scope CSS resets
        if((' ' + box.className + ' ').indexOf(' ui-genre-wrap ') === -1){
          box.className += (box.className ? ' ' : '') + 'ui-genre-wrap';
        }

        // Overlay layer
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

        box.appendChild(bg);

        // Raise children above overlay
        var kids = box.children;
        for(var k=0;k<kids.length;k++){
          var ch = kids[k];
          if(ch === bg) continue;
          if(ch && ch.style){
            if(!ch.style.position) ch.style.position = 'relative';
            ch.style.zIndex = '1';
          }
        }
      }
    }catch(e){ log('addGenreBackdrop error', e); }
  }

  // Mutation observer (throttled)
  var mo = null;
  var refreshTimer = 0;
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){
      refreshTimer = 0;
      hideQualityBadges();
      removeComments();
      addGenreBackdrop();
    }, 60);
  }
  function observe(){
    try{
      if(mo) mo.disconnect();
      mo = new MutationObserver(function(){ scheduleRefresh(); });
      mo.observe(document.body, {childList:true, subtree:true});
    }catch(e){ log('observe error', e); }
  }

  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn,0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // Init
  ready(function(){
    try{
      injectCSS([
        // Hide quality badges quickly via CSS; JS pass will catch dynamic nodes
        '.card [class*="quality"], .card [data-quality],',
        '.full [class*="quality"], .full [data-quality],',
        '.video [class*="quality"], .video [data-quality]{display:none!important;}',

        // Hide comments blocks
        '.comments, .full-comments, .panel-comments, .tabs__content.comments, .comments-block, #comments, [data-block="comments"]{display:none!important;}',

        // Genres backdrop + anti-bullet/anti-::before fixes
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

      // Observe further DOM changes
      observe();

      // Tiny debug API
      window.__lampa_ui_tweaks__ = {
        version: '1.3.0',
        refresh: function(){ scheduleRefresh(); },
        debug: function(v){ DEBUG = !!v; log('debug mode', DEBUG); }
      };

      log('loaded v1.3.0');
    }catch(e){ log('init error', e); }
  });
})();
(function(){
  'use strict';
  /*
   * Lampa UI Tweaks — hide quality, add genres backdrop, remove comments
   * Version: 1.3.0 (2025-08-15)
   * ES5-only (for WebOS/Tizen). No arrow functions, no optional chaining, no let/const.
   */

  var DEBUG = false; // switch to true to see logs in console

  var CONFIG = {
    selectors: {
      // 1) Containers where genres live (varies across skins/themes)
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

      // 2) Comments blocks (both standalone and inside tabs)
      commentsBlocks: [
        '.comments',
        '.full-comments',
        '.panel-comments',
        '.tabs__content.comments',
        '.comments-block',
        '#comments',
        '[data-block="comments"]'
      ].join(','),

      // 3) Comments tab titles/buttons
      commentsTabTitles: [
        '.tabs__head .tabs__title',
        '.tabs__head .tabs__button',
        '.tabs__title',
        '.tab__title',
        '.tab-button'
      ].join(','),

      // 4) Quality badges/labels
      qualityWithin: [
        '.card [class*="quality"]',
        '.card [data-quality]',
        '.full [class*="quality"]',
        '.full [data-quality]',
        '.video [class*="quality"]',
        '.video [data-quality]'
      ].join(',')
    },

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

  // 1) Hide quality badges
  function hideQualityBadges(){
    try{
      var list = document.querySelectorAll(CONFIG.selectors.qualityWithin);
      for(var i=0;i<list.length;i++){
        var el = list[i];
        var cls = (el.className||'') + ' ' + (el.parentNode && el.parentNode.className || '');
        if(/progress|timeline|evolution|meter/i.test(cls)) continue; // safety
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('hideQualityBadges error', e); }
  }

  // 2) Remove comments UI (tab and content)
  function removeComments(){
    try{
      var titles = document.querySelectorAll(CONFIG.selectors.commentsTabTitles);
      for(var i=0;i<titles.length;i++){
        var t = titles[i];
        var txt = (t.textContent||'').toLowerCase();
        if(txt.indexOf('коммент') !== -1 || txt.indexOf('comments') !== -1){
          t.style.setProperty('display','none','important');
          t.setAttribute('aria-hidden','true');
        }
      }
      var blocks = document.querySelectorAll(CONFIG.selectors.commentsBlocks);
      for(var j=0;j<blocks.length;j++){
        var b = blocks[j];
        b.style.setProperty('display','none','important');
        b.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('removeComments error', e); }
  }

  // 3) Add translucent backdrop under genres, no layout shift
  function addGenreBackdrop(){
    try{
      var containers = document.querySelectorAll(CONFIG.selectors.genreContainers);
      for(var i=0;i<containers.length;i++){
        var box = containers[i];
        if(!box || !box.parentNode) continue;
        if(box.getAttribute('data-ui-bg') === '1') continue; // processed
        box.setAttribute('data-ui-bg','1');

        // Ensure stacking context
        var cs = window.getComputedStyle(box);
        var pos = (box.style.position||'') + ' ' + cs.position;
        if(!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

        // Mark with helper class to scope CSS resets
        if((' ' + box.className + ' ').indexOf(' ui-genre-wrap ') === -1){
          box.className += (box.className ? ' ' : '') + 'ui-genre-wrap';
        }

        // Overlay layer
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

        box.appendChild(bg);

        // Raise children above overlay
        var kids = box.children;
        for(var k=0;k<kids.length;k++){
          var ch = kids[k];
          if(ch === bg) continue;
          if(ch && ch.style){
            if(!ch.style.position) ch.style.position = 'relative';
            ch.style.zIndex = '1';
          }
        }
      }
    }catch(e){ log('addGenreBackdrop error', e); }
  }

  // Mutation observer (throttled)
  var mo = null;
  var refreshTimer = 0;
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){
      refreshTimer = 0;
      hideQualityBadges();
      removeComments();
      addGenreBackdrop();
    }, 60);
  }
  function observe(){
    try{
      if(mo) mo.disconnect();
      mo = new MutationObserver(function(){ scheduleRefresh(); });
      mo.observe(document.body, {childList:true, subtree:true});
    }catch(e){ log('observe error', e); }
  }

  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn,0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // Init
  ready(function(){
    try{
      injectCSS([
        // Hide quality badges quickly via CSS; JS pass will catch dynamic nodes
        '.card [class*="quality"], .card [data-quality],',
        '.full [class*="quality"], .full [data-quality],',
        '.video [class*="quality"], .video [data-quality]{display:none!important;}',

        // Hide comments blocks
        '.comments, .full-comments, .panel-comments, .tabs__content.comments, .comments-block, #comments, [data-block="comments"]{display:none!important;}',

        // Genres backdrop + anti-bullet/anti-::before fixes
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

      // Observe further DOM changes
      observe();

      // Tiny debug API
      window.__lampa_ui_tweaks__ = {
        version: '1.3.0',
        refresh: function(){ scheduleRefresh(); },
        debug: function(v){ DEBUG = !!v; log('debug mode', DEBUG); }
      };

      log('loaded v1.3.0');
    }catch(e){ log('init error', e); }
  });
})();


