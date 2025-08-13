(function(){
  'use strict';

  // Discover base URL of this script (for loading submodules from the same host)
  function getBase(){
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('RT.js') !== -1 || src.indexOf('rt.js') !== -1 || src.indexOf('rtdual.js') !== -1) {
        return src.split('/').slice(0, -1).join('/');
      }
    }
    // Fallback: user can host /SRC next to RT.js
    return '';
  }

  var BASE = getBase();
  var files = [
    'SRC/config.js',
    'SRC/styles.js',
    'SRC/apiRT.js',
    'SRC/uiInfoPanel.js',
    'SRC/settings.js',
    'SRC/main.js'
  ];

  function loadScript(url, cb){
    var s = document.createElement('script');
    s.src = url;
    s.onload = function(){ cb && cb(); };
    s.onerror = function(){ console.error('RT Plugin: failed to load', url); cb && cb(); };
    document.head.appendChild(s);
  }

  (function chain(i){
    if (i >= files.length){
      if (window.RT && window.RT.main && typeof window.RT.main.init === 'function'){
        window.RT.main.init();
      }
      else {
        console.error('RT Plugin: main.init not found');
      }
      return;
    }
    var url = (BASE ? BASE + '/' : '') + files[i];
    loadScript(url, function(){ chain(i+1); });
  })(0);
})();