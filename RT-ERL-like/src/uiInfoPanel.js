(function(){
  'use strict';
  window.RT = window.RT || {};

  RT.ui = {
    injectBadges: function(root, critics, audience){
      var row = root.find('.info__rate, .full--rating, .card__rate').first();
      if (!row.length) return;
      if (row.find('.rt--critics, .rt--audience').length) return;

      function mk(cls, icon, value, label){
        var v = value || '—';
        var t = label + (value ? (': ' + value) : ': нет данных');
        var $el = $([
          '<div class="rate '+cls+'" title="'+t+'">',
          '  <img src="'+icon+'" alt="'+label+'" style="width:1.1em;height:1.1em;display:block">',
          '  <div class="rate__text">'+v+'</div>',
          '  <div class="rate__name" style="opacity:.7">'+label+'</div>',
          '</div>'
        ].join(''));
        return $el;
      }

      if (critics) row.append(mk('rt--critics', RT.api.icons.critics, critics, 'RT'));
      if (audience) row.append(mk('rt--audience', RT.api.icons.audience, audience, 'AUD'));
    },

    hideTMDbIfNeeded: function(root){
      var hide = !!Lampa.Storage.get(RT.config.storage_key_hide_tmdb, false);
      if (!hide) return;
      root.find('.full--rating .rating').each(function(){
        var $r = $(this);
        var label = ($r.find('.source,.title').text() || '').trim().toLowerCase();
        if (label.indexOf('tmdb') !== -1) $r.remove();
      });
    }
  };
})();