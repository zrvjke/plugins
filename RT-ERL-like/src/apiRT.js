(function(){
  'use strict';
  window.RT = window.RT || {};

  var ICON_CRITICS  = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg';
  var ICON_AUDIENCE = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg';

  var OMDB_URL = 'https://www.omdbapi.com/';
  var cache = Object.create(null);

  function getJSON(url){
    return fetch(url).then(r => r.json()).catch(()=>null);
  }
  function getText(url){
    return fetch(url).then(r => r.text()).catch(()=>'');
  }

  RT.api = {
    icons: { critics: ICON_CRITICS, audience: ICON_AUDIENCE },

    getApiKey: function(){
      var k = Lampa && Lampa.Storage ? (Lampa.Storage.get(RT.config.storage_key_api, '') || RT.config.omdb_api_key_default) : RT.config.omdb_api_key_default;
      return (k || '').trim();
    },

    fetchRatings: async function(imdb, title, year){
      var key = RT.api.getApiKey();
      if (!key) return { error: 'NO_KEY' };

      var ckey = imdb || (title + '|' + (year||''));
      if (cache[ckey]) return cache[ckey];

      var qs = imdb ? 'i='+encodeURIComponent(imdb) : 't='+encodeURIComponent(title)+(year?('&y='+encodeURIComponent(year)) : '');
      var url = OMDB_URL + '?apikey=' + key + '&' + qs + '&plot=short&r=json';

      var data = await getJSON(url);
      if (!data || data.Error) return { error: 'OMDB_ERROR' };

      var critics = null;
      if (Array.isArray(data.Ratings)){
        var rt = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
        if (rt && rt.Value) critics = rt.Value;
      }

      var audience = null;
      if (data.Website && /rottentomatoes\.com/.test(data.Website)){
        var html = await getText(data.Website);
        var m = html.match(/Audience\s*Score[^0-9]*([0-9]{1,3})%/i) || html.match(/audienceScore[^\d]{0,20}(\d{1,3})/i);
        if (m) audience = m[1] + '%';
      }

      var res = { critics: critics, audience: audience };
      cache[ckey] = res;
      return res;
    }
  };
})();