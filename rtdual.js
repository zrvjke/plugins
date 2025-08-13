(function () {
  'use strict';

  const PLUGIN_ID = 'rtdual';
  const OMDB_URL  = 'https://www.omdbapi.com/';

  // 1. Регистрируем плагин
  Lampa.Plugin.register({
    id: PLUGIN_ID,
    name: 'Rotten Tomatoes (OMDb Dual)',
    version: '1.0.0',
    description: 'Добавляет рейтинги Rotten Tomatoes через OMDb API',
    type: 'modify',
    params: [
      {
        id: 'omdb_key',
        type: 'input',
        name: 'OMDb API Key',
        placeholder: 'Введите ключ с omdbapi.com'
      },
      {
        id: 'hide_tmdb',
        type: 'checkbox',
        name: 'Скрыть рейтинг TMDb',
        default: false
      }
    ]
  });

  // 2. Кэш и вспомогательные функции
  const cache = {};
  
  function getOmdbKey() {
    return Lampa.Params.get(PLUGIN_ID + '_omdb_key', '').trim();
  }

  async function fetchData(url) {
    try {
      const response = await fetch(url);
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  // 3. Основная логика
  Lampa.Listener.follow('full', async function (e) {
    if (e.type !== 'complite') return;
    
    const $root = $(e.body || '.full');
    const movie = e.data?.movie || e.data?.tv || {};
    
    // Скрываем TMDb рейтинг
    if (Lampa.Params.get(PLUGIN_ID + '_hide_tmdb', false)) {
      $root.find('.info__rate .rate:contains("TMDb")').remove();
    }

    // Получаем рейтинги
    const omdbKey = getOmdbKey();
    if (!omdbKey) {
      Lampa.Noty.show('Введите OMDb API ключ в настройках!');
      return;
    }

    const imdbId = movie.imdb_id || '';
    if (!imdbId) return;

    const url = `${OMDB_URL}?apikey=${omdbKey}&i=${imdbId}&tomatoes=true`;
    const data = await fetchData(url);

    if (!data || data.Error) return;

    // Добавляем рейтинги RT
    const rtRating = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
    const tomatoMeter = rtRating?.Value || 'N/A';
    const audienceScore = data.tomatoUserMeter || 'N/A';

    $root.find('.info__rate').append(`
      <div class="rate rate--rt" style="display:flex;align-items:center;gap:8px">
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/fresh.svg" width="16">
        <span>${tomatoMeter}</span>
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/aud_score-fresh.svg" width="16">
        <span>${audienceScore}</span>
      </div>
    `);
  });
})();
