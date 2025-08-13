(function () {
  'use strict';

  /*** ====== КОНСТАНТЫ ====== ***/
  var PLUGIN_ID   = 'rtdual';
  var PLUGIN_NAME = 'Rotten Tomatoes (OMDb Dual)';
  var OMDB_URL    = 'https://www.omdbapi.com/';
  var ICON_TOMATO = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg';
  var ICON_POP    = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg';

  /*** ====== ХРАНИЛКА ====== ***/
  function get(key, def){ try{return Lampa.Storage.get(PLUGIN_ID+'_'+key, def);}catch(e){ return def; } }
  function set(key, val){ try{ Lampa.Storage.set(PLUGIN_ID+'_'+key, val); }catch(e){} }

  /*** ====== СЕТЬ ====== ***/
  function fetchJSON(url){
    return fetch(url).then(function(r){ return r.json(); }).catch(function(){ return null; });
  }
  function fetchTEXT(url){
    return fetch(url).then(function(r){ return r.text(); }).catch(function(){ return ''; });
  }

  /*** ====== КЭШ ====== ***/
  var cache = Object.create(null);

  /*** ====== ПОЛУЧЕНИЕ РЕЙТИНГОВ ====== ***/
  function getRtByOmdb(args){
    var imdb  = args.imdb || '';
    var title = args.title || '';
    var year  = args.year  || '';

    var key = (get('omdb_key','') || '').trim();
    if(!key) return Promise.resolve({ error:'NO_KEY' });

    var cacheKey = imdb || (title+'|'+year);
    if(cache[cacheKey]) return Promise.resolve(cache[cacheKey]);

    var qs = imdb ? ('i='+encodeURIComponent(imdb)) :
                    ('t='+encodeURIComponent(title)+(year?('&y='+encodeURIComponent(year)):''));

    var url = OMDB_URL+'?apikey='+key+'&'+qs+'&plot=short&r=json';

    return fetchJSON(url).then(function(data){
      if(!data || data.Error) return { error:'OMDB_ERROR' };

      // Tomatometer (критики) — в массиве Ratings
      var critics = null;
      if(Array.isArray(data.Ratings)){
        var rt = data.Ratings.find(function(r){ return r.Source === 'Rotten Tomatoes'; });
        if(rt && rt.Value) critics = rt.Value; // напр. "92%"
      }

      // Audience Score — пробуем вытащить со страницы RT, если OMDb вернул ссылку
      var audiencePromise = Promise.resolve(null);
      if(data.Website && /rottentomatoes\.com/.test(data.Website)){
        audiencePromise = fetchTEXT(data.Website).then(function(html){
          var m = html && html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
          return m ? (m[1]+'%') : null;
        });
      }

      return audiencePromise.then(function(aud){
        var result = { critics: critics, audience: aud };
        cache[cacheKey] = result;
        return result;
      });
    });
  }

  /*** ====== UI: ВСТАВКА РЕЙТИНГОВ В КАРТОЧКУ ====== ***/
  function removeTmdbIfNeeded(root){
    if(!get('hide_tmdb', false)) return;

    try {
      // В блоке «Рейтинги» удаляем ячейки, где источник TMDb
      root.find('.full--rating .rating').each(function(){
        var $r = $(this);
        var label = ($r.find('.source,.title').text() || '').trim().toLowerCase();
        if(label.includes('tmdb')) $r.remove();
      });
    } catch(e){}
  }

  function insertRtLine(root, critics, audience){
    try{
      var container = root.find('.full--rating');
      if(!container.length) return;

      // не дублировать
      if(container.find('.rtdual-rating').length) return;

      var html = '<div class="rating rtdual-rating" style="margin-top:8px;">' +
                   '<div class="source">Rotten Tomatoes</div>' +
                   '<div class="value" style="display:flex;align-items:center;gap:14px;color:#fff;">' +
                     '<span style="display:inline-flex;align-items:center;gap:6px;">' +
                       '<img src="'+ICON_TOMATO+'" style="width:18px;height:18px;display:block;">' +
                       '<b>'+(critics || '—')+'</b>' +
                     '</span>' +
                     '<span style="display:inline-flex;align-items:center;gap:6px;">' +
                       '<img src="'+ICON_POP+'" style="width:18px;height:18px;display:block;">' +
                       '<b>'+(audience || '—')+'</b>' +
                     '</span>' +
                   '</div>' +
                 '</div>';

      container.append(html);
    }catch(e){}
  }

  /*** ====== СЛУШАТЕЛЬ КАРТОЧКИ ====== ***/
  function hookCard(){
    Lampa.Listener.follow('full', function(e){
      if(e.type !== 'complite') return;

      var data  = e.data || {};
      var movie = data.movie || data.tv || data;
      var imdb  = movie.imdb_id || movie.imdb || '';
      var title = movie.title   || movie.name || '';
      var year  = movie.release_year || movie.year || movie.release_date || '';

      if(e.body) removeTmdbIfNeeded(e.body);
      if(!title && !imdb) return;

      getRtByOmdb({ imdb:imdb, title:title, year:year }).then(function(res){
        if(res && res.error === 'NO_KEY'){
          if(!window.__rtdual_keywarn){
            window.__rtdual_keywarn = true;
            Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках плагина.');
          }
          return;
        }
        if(res && !res.error){
          insertRtLine(e.body, res.critics, res.audience);
        }
      });
    });
  }

  /*** ====== НАСТРОЙКИ: КОМПОНЕНТ ====== ***/
  function buildSettingsElement(){
    var el = document.createElement('div');
    el.className = 'rtdual-settings';
    el.style.padding = '10px 20px';

    el.innerHTML =
      '<div class="settings-param selector" data-param="omdb_key" style="margin-bottom:16px;">' +
        '<div class="settings-param__name">OMDb API ключ</div>' +
        '<div class="settings-param__descr">Введите ключ, полученный на omdbapi.com</div>' +
        '<div class="settings-param__input">' +
          '<input type="text" class="rtdual-api-input" placeholder="xxxxxxxx" value="'+(get('omdb_key',''))+'">' +
        '</div>' +
      '</div>' +
      '<div class="settings-param selector" data-param="hide_tmdb">' +
        '<div class="settings-param__name">Скрывать рейтинг TMDb</div>' +
        '<div class="settings-param__descr">Удалять TMDb из блока «Рейтинги»</div>' +
        '<div class="settings-param__switch">' +
          '<div class="toggle toggle--checkbox '+(get('hide_tmdb',false)?'active':'')+'"></div>' +
        '</div>' +
      '</div>';

    // события
    var input = el.querySelector('.rtdual-api-input');
    input.addEventListener('change', function(){
      set('omdb_key', input.value.trim());
      Lampa.Noty.show('OMDb ключ сохранён');
    });

    var toggle = el.querySelector('.toggle');
    el.querySelector('[data-param="hide_tmdb"]').addEventListener('click', function(){
      var val = !get('hide_tmdb', false);
      set('hide_tmdb', val);
      toggle.classList.toggle('active', val);
      Lampa.Noty.show('Настройка сохранена');
    });

    return $(el);
  }

  function registerSettings(){
    // основной путь (Lampa 2.x)
    if(Lampa.SettingsApi && typeof Lampa.SettingsApi.addComponent === 'function'){
      try{
        Lampa.SettingsApi.addComponent({
          component: PLUGIN_ID,
          name: PLUGIN_NAME,
          icon: '🍅',
          render: function(){ 
            if(!this.$render) this.$render = buildSettingsElement();
            return this.$render;
          },
          onBack: function(){ Lampa.Controller.toggle('settings'); }
        });
        return;
      }catch(e){}
    }

    // запасной путь — кнопка в «Остальное»
    try{
      var more = $('.settings__content'); // когда меню настроек открыто
      if(more && more.length && !more.find('.rtdual-entry').length){
        var btn = $('<div class="settings-folder selector rtdual-entry"><div class="settings-folder__icon">🍅</div><div class="settings-folder__name">'+PLUGIN_NAME+'</div></div>');
        btn.on('click', function(){
          var scr = buildSettingsElement();
          $('.settings__content').html('').append(scr);
        });
        more.append(btn);
      }
    }catch(e){}
  }

  /*** ====== ИНИЦИАЛИЗАЦИЯ ====== ***/
  function init(){
    registerSettings();
    hookCard();
    Lampa.Noty.show('Плагин «'+PLUGIN_NAME+'» загружен');
  }

  // запустить сразу после загрузки файла
  try{ init(); }catch(e){}

})();

