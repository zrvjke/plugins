(function(){
  // Rotten Tomatoes via OMDb (dual: critics + audience)
  var API = 'https://www.omdbapi.com/';
  var API_KEY = '63684232'; // твой ключ OMDb

  // простейший кэш в Storage (7 дней)
  var CACHE_KEY = 'rt_ratings_cache_v1';
  var cache = Lampa.Storage.get(CACHE_KEY, {});
  function now(){ return Math.floor(Date.now()/1000); }
  var TTL = 60*60*24*7;
  function getFromCache(imdb){ var r = cache[imdb]; return (r && (now()-r.ts)<TTL) ? r : null; }
  function setCache(imdb, data){ cache[imdb] = {critics:data.critics, audience:data.audience, ts:now()}; Lampa.Storage.set(CACHE_KEY, cache); }

  function ensureBadges(render){
    if($('.rt-badges', render).length) return;

    var css = `
      <style id="rt-erl-like-style">
        .rt-badges{ display:flex; gap:.4em; align-items:center; margin-left:.4em; }
        .rt-badge{ display:inline-flex; align-items:center; gap:.35em; padding:.15em .45em; border-radius:.6em; font-weight:600; font-size:0.98em; line-height:1; background:rgba(255,255,255,.06); }
        .rt-badge .rt-icon{ width:1.05em; height:1.05em; display:inline-block; background-size:contain;background-repeat:no-repeat;background-position:center; }
        .rt-badge small{opacity:.7; font-weight:500}
        .rt-badge.good{ color:#46d369; background:rgba(70,211,105,.12); }
        .rt-badge.mixed{ color:#f5c518; background:rgba(245,197,24,.14); }
        .rt-badge.bad{ color:#ff2e2e; background:rgba(255,46,46,.12); }
      </style>`;
    if(!$('#rt-erl-like-style').length) $('body').append(css);

    var tomato = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="%23e50914" d="M255.7 96c-28-26-63-36-100-26-10 3-10-8 6-17 30-17 69-11 94 13 17-27 54-42 87-29 20 8 20 18 5 16-35-5-64 4-88 24 127-12 224 77 224 175 0 112-91 192-210 192C148 444 64 364 64 256 64 161 146 86 255.7 96z"/></svg>';
    var popcorn = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="%23ffd54a" d="M128 96c0-35 29-64 64-64 14 0 27 4 38 11C244 28 260 24 276 24c35 0 64 29 64 64 29 0 52 23 52 52 0 16-6 30-16 40l-36 312H180L144 180c-10-10-16-24-16-40 0-29 23-52 52-52z"/></svg>';

    var html = $('<div class="rt-badges">\
      <div class="rt-badge rt-critics" title="Rotten Tomatoes — Critics">\
        <span class="rt-icon"></span><span class="rt-value">—</span><small>%</small>\
      </div>\
      <div class="rt-badge rt-audience" title="Rotten Tomatoes — Audience">\
        <span class="rt-icon"></span><span class="rt-value">—</span><small>%</small>\
      </div>\
    </div>');
    html.find('.rt-critics .rt-icon').css('background-image','url('+tomato+')');
    html.find('.rt-audience .rt-icon').css('background-image','url('+popcorn+')');

    var bar = $('.info__rate', render);
    if(bar.length) bar.append(html);
  }

  function colorize($badge, v){
    $badge.removeClass('good mixed bad');
    if(isNaN(v)) return;
    if(v >= 75) $badge.addClass('good');
    else if(v >= 60) $badge.addClass('mixed');
    else $badge.addClass('bad');
  }

  function pickRT(res){
    var critics = null, audience = null;
    try{
      if(res && res.Ratings){
        var r = res.Ratings.find(function(x){ return (x.Source||'').toLowerCase()=='rotten tomatoes'; });
        if(r && typeof r.Value==='string' && r.Value.indexOf('%')>0){
          critics = parseInt(r.Value.replace('%','').trim());
        }
      }
      // audience бывает только когда OMDb отдаёт томатные поля
      if(res.tomatometer && !isNaN(parseInt(res.tomatometer))) critics = parseInt(res.tomatometer);
      var cand = res.tomatoUserMeter || res.tomatoaudiencemeter || res.tomato_audience_meter || res.tomatoUserRating;
      if(cand && !isNaN(parseInt(cand))) audience = parseInt(cand);
    }catch(e){}
    return {critics: critics, audience: audience};
  }

  function fetchByIMDB(imdb, done){
    var url = API+'?apikey='+API_KEY+'&i='+encodeURIComponent(imdb)+'&plot=short&tomatoes=true';
    Lampa.Reguest(url, function(json){ done(pickRT(json||{})); }, function(){ done({}); }, { dataType:'json' });
  }
  function fetchByTitle(title, year, done){
    var url = API+'?apikey='+API_KEY+'&t='+encodeURIComponent(title)+(year?('&y='+year):'')+'&plot=short&tomatoes=true';
    Lampa.Reguest(url, function(json){ done(pickRT(json||{})); }, function(){ done({}); }, { dataType:'json' });
  }

  function applyTo(render, res){
    var c = (typeof res.critics==='number')? res.critics : null;
    var a = (typeof res.audience==='number')? res.audience : null;
    var $crit = $('.rt-badge.rt-critics', render);
    var $aud = $('.rt-badge.rt-audience', render);
    if(c!==null){ $crit.find('.rt-value').text(c); colorize($crit, c); }
    if(a!==null){ $aud.find('.rt-value').text(a); colorize($aud, a); }
  }

  function run(movie){
    var render = Lampa.Activity.active().activity.render();
    ensureBadges(render);

    var imdb = movie.imdb_id || (movie.source && movie.source.imdb_id) || (movie.card && movie.card.imdb_id) || null;
    var title = movie.name || movie.title || (movie.source && (movie.source.title || movie.source.name)) || '';
    var orig  = movie.original_title || movie.original_name || (movie.source && (movie.source.original_title || movie.source.original_name)) || '';
    var year  = movie.release_date ? (movie.release_date+'').slice(0,4) : (movie.first_air_date ? (movie.first_air_date+'').slice(0,4) : '');
    var touse = orig || title;

    if(imdb){
      var cached = getFromCache(imdb);
      if(cached) applyTo(render, cached);
      fetchByIMDB(imdb, function(res){ setCache(imdb, res); applyTo(render, res); });
    } else if(touse){
      fetchByTitle(touse, year, function(res){ applyTo(render, res); });
    }
  }

  function start(){
    if(window.rt_dual_plugin_started) return;
    window.rt_dual_plugin_started = true;

    Lampa.Listener.follow('full', function(e){
      if(e.type=='complite'){
        try{ run(e.data.movie || e.data.card || {}); }catch(err){}
      }
    });
  }
  start();
})();

