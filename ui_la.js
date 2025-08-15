/*!
 * Lampa UI Tweaks v1.3.2
 * — скрывает качество
 * — убирает комментарии
 * — добавляет полупрозрачную подложку под жанрами
 * ES5-only (совместимо с WebOS/Tizen)
 */
(function(){
  'use strict';

  var DEBUG = false; // true — лог в консоль

  function log(){ if(!DEBUG) return; try{ console.log.apply(console, arguments); }catch(e){} }

  // Селекторы без join — сразу строками
  var SELECTORS_GENRES   = '.full-genres,.details__genres,.film__genres,.full__genres,.card__genres,.tags--genres,.tag-list.genres,.genres,[data-block="genres"]';
  var SELECTORS_COMMENTS = '.comments,.full-comments,.panel-comments,.tabs__content.comments,.comments-block,#comments,[data-block="comments"]';
  var SELECTORS_TABTITLES= '.tabs__head .tabs__title,.tabs__head .tabs__button,.tabs__title,.tab__title,.tab-button';
  var SELECTORS_QUALITY  = '.card [class*="quality"],.card [data-quality],.full [class*="quality"],.full [data-quality],.video [class*="quality"],.video [data-quality]';

  var BACKDROP_BG   = 'rgba(0,0,0,0.35)';
  var BACKDROP_RAD  = '12px';

  function injectCSS(css){
    try{
      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(style);
    }catch(e){ log('injectCSS error', e); }
  }

  // 1) Скрыть бейджи качества
  function hideQualityBadges(){
    try{
      var list = document.querySelectorAll(SELECTORS_QUALITY);
      for(var i=0;i<list.length;i++){
        var el = list[i];
        var cls = (el.className||'') + ' ' + (el.parentNode && el.parentNode.className || '');
        if(/progress|timeline|evolution|meter/i.test(cls)) continue; // страховка
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('hideQualityBadges error', e); }
  }

  // 2) Убрать вкладку/блок «Комментарии»
  function removeComments(){
    try{
      var titles = document.querySelectorAll(SELECTORS_TABTITLES);
      for(var i=0;i<titles.length;i++){
        var t = titles[i];
        var txt = (t.textContent||'').toLowerCase();
        if(txt.indexOf('коммент') !== -1 || txt.indexOf('comments') !== -1){
          t.style.setProperty('display','none','important');
          t.setAttribute('aria-hidden','true');
        }
      }
      var blocks = document.querySelectorAll(SELECTORS_COMMENTS);
      for(var j=0;j<blocks.length;j++){
        var b = blocks[j];
        b.style.setProperty('display','none','important');
        b.setAttribute('aria-hidden','true');
      }
    }catch(e){ log('removeComments error', e); }
  }

  // 3) Подложка под жанрами без смещения вёрстки
  function addGenreBackdrop(){
    try{
      var containers = document.querySelectorAll(SELECTORS_GENRES);
      for(var i=0;i<containers.length;i++){
        var box = containers[i];
        if(!box || !box.parentNode) continue;
        if(box.getAttribute('data-ui-bg') === '1') continue; // уже обработан
        box.setAttribute('data-ui-bg','1');

        // Контекст наложения
        var cs = window.getComputedStyle(box);
        var pos = (box.style.position||'') + ' ' + cs.position;
        if(!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

        // Класс-обёртка, чтобы заскопить CSS фиксы
        if((' ' + box.className + ' ').indexOf(' ui-genre-wrap ') === -1){
          box.className += (box.className ? ' ' : '') + 'ui-genre-wrap';
        }

        // Слой-подложка
        var bg = document.createElement('div');
        bg.className = 'ui-genre-bg';
        bg.style.position = 'absolute';
        bg.style.left = '0'; bg.style.top = '0'; bg.style.right = '0'; bg.style.bottom = '0';
        bg.style.pointerEvents = 'none';
        bg.style.background = BACKDROP_BG;
        bg.style.borderRadius = BACKDROP_RAD;
        bg.style.zIndex = '0';
        box.appendChild(bg);

        // Поднимаем жанры над подложкой
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

  // Наблюдение (с троттлингом) + резерв без MutationObserver
  var mo = null, refreshTimer = 0;
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){
      refreshTimer = 0;
      hideQualityBadges();
      removeComments();
      addGenreBackdrop();
    }, 60);
  }
  function startObservers(){
    try{
      if(typeof MutationObserver !== 'undefined'){
        if(mo) mo.disconnect();
        mo = new MutationObserver(function(){ scheduleRefresh(); });
        mo.observe(document.body, {childList:true, subtree:true});
      } else {
        setInterval(scheduleRefresh, 200);
      }
    }catch(e){ log('observer error', e); }
  }

  // DOM ready
  function ready(fn){
    if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn,0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // Инициализация
  ready(function(){
    try{
      // Базовые стили — одной строкой, без join
      var CSS = ''
        + '.card [class*="quality"], .card [data-quality],'
        + '.full [class*="quality"], .full [data-quality],'
        + '.video [class*="quality"], .video [data-quality]{display:none!important;}' + '\n'
        + SELECTORS_COMMENTS + '{display:none!important;}' + '\n'
        + '.ui-genre-wrap{position:relative!important;}' + '\n'
        + '.ui-genre-wrap .ui-genre-bg{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:' + BACKDROP_RAD + ';background:' + BACKDROP_BG + ';z-index:0;}' + '\n'
        + '.ui-genre-wrap>*:not(.ui-genre-bg){position:relative;z-index:1;}' + '\n'
        + '.ui-genre-wrap, .ui-genre-wrap ul, .ui-genre-wrap li{list-style:none!important;padding-left:0!important;margin-left:0!important;}' + '\n'
        + '.ui-genre-wrap a::before, .ui-genre-wrap span::before, .ui-genre-wrap li::before{content:none!important;}';

      injectCSS(CSS);

      hideQualityBadges();
      removeComments();
      addGenreBackdrop();
      startObservers();

      window.__lampa_ui_tweaks__ = {
        version: '1.3.2',
        refresh: function(){ scheduleRefresh(); },
        debug: function(v){ DEBUG = !!v; log('debug', DEBUG); }
      };
    }catch(e){ log('init error', e); }
  });
})();
