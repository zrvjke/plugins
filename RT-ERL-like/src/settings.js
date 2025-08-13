(function(){
  'use strict';
  window.RT = window.RT || {};

  function renderSettings(item){
    var wrap = $('<div class="rt-settings"></div>');

    // API input
    var api_val = (Lampa.Storage.get(RT.config.storage_key_api, '') || RT.config.omdb_api_key_default);
    var row_api = $('<div class="rt-row"></div>');
    row_api.append('<div style="min-width:160px">OMDb API ключ</div>');
    var input = $('<input type="text" placeholder="Введите ключ omdbapi.com...">').val(api_val);
    input.on('change input', function(){
      Lampa.Storage.set(RT.config.storage_key_api, (this.value||'').trim());
    });
    row_api.append($('<div style="flex:1"></div>').append(input));
    wrap.append(row_api);
    wrap.append('<div class="hint">Получить ключ: omdbapi.com (бесплатно)</div>');

    // Hide TMDb switch
    var hide_val = !!Lampa.Storage.get(RT.config.storage_key_hide_tmdb, false);
    var row_hide = $('<div class="rt-row switch"></div>');
    var chk = $('<input type="checkbox">').prop('checked', hide_val);
    chk.on('change', function(){
      Lampa.Storage.set(RT.config.storage_key_hide_tmdb, !!this.checked);
    });
    row_hide.append(chk).append('<label>Скрывать рейтинг TMDb в карточке</label>');
    wrap.append(row_hide);

    item.append(wrap);
  }

  RT.settings = {
    register: function(){
      if (!window.Lampa || !Lampa.SettingsApi) {
        console.error('RT Plugin: SettingsApi not found');
        return;
      }
      Lampa.SettingsApi.addComponent({
        component: 'rt_dual',
        name: 'Rotten Tomatoes (OMDb Dual)',
        icon: '🍅',
        onRender: function(item){ renderSettings(item); },
        onBack: function(){}
      });
    }
  };
})();