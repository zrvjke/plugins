(function(){
  'use strict';
  window.RT = window.RT || {};
  RT.config = {
    storage_key_api: 'rt_dual_api',
    storage_key_hide_tmdb: 'rt_dual_hide_tmdb',
    omdb_api_key_default: '', // можно оставить пустым; пользователь введет в настройках
    request_timeout: 15000
  };
})();