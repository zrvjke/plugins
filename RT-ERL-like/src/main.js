(function(){
  'use strict';
  window.RT = window.RT || {};

  RT.main = {
    init: function(){
      // 1) Зарегистрировать настройки
      if (RT.settings && typeof RT.settings.register === 'function') RT.settings.register();

      // 2) Слушать открытие карточек
      Lampa.Listener.follow('full', function(e){
        if (e.type !== 'complite') return;

        var card = (e.data && (e.data.movie || e.data.tv || e.data)) || {};
        var imdb = card.imdb_id || card.imdb || '';
        var title = card.title || card.name || '';
        var year = card.release_year || card.year || '';

        if (!title && !imdb) return;

        // скрыть TMDb при необходимости
        if (e.body) RT.ui.hideTMDbIfNeeded($(e.body));

        RT.api.fetchRatings(imdb, title, year).then(function(res){
          if (!res || res.error) {
            if (res && res.error === 'NO_KEY') {
              if (!window.__rt_key_warned__) {
                window.__rt_key_warned__ = true;
                Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках плагина.');
              }
            }
            return;
          }
          var root = e.body ? $(e.body) : $('.full');
          RT.ui.injectBadges(root, res.critics, res.audience);
        });
      });
    }
  };
})();