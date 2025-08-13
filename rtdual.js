(function() {
  'use strict';

  // Ждём загрузки API Lampa
  if (!window.Lampa || !Lampa.Plugin) {
    console.error('Lampa.Plugin не доступен!');
    return;
  }

  // Конфигурация плагина
  const PLUGIN_ID = 'rtdual';
  const OMDB_URL = 'https://www.omdbapi.com/';

  // Регистрация плагина
  Lampa.Plugin.register({
    id: PLUGIN_ID,
    name: 'Rotten Tomatoes Dual',
    version: '2.0.0',
    description: 'Добавляет рейтинги Rotten Tomatoes (Tomatometer + Audience)',
    type: 'modify',
    params: [
      {
        id: 'omdb_key',
        type: 'input',
        name: 'OMDb API Key',
        placeholder: 'Получите ключ на omdbapi.com'
      },
      {
        id: 'hide_tmdb',
        type: 'checkbox',
        name: 'Скрыть TMDb рейтинг',
        default: false
      }
    ]
  });

  // Кэш рейтингов
  const cache = {};

  // Получение сохранённого API-ключа
  function getApiKey() {
    return Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '').trim();
  }

  // Скрытие рейтинга TMDb
  function hideTMDb() {
    if (Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false)) {
      document.querySelectorAll('.rate--tmdb').forEach(el => el.remove());
    }
  }

  // Добавление рейтингов RT
  function addRatings(container, critics, audience) {
    const html = `
      <div class="rating rating--rt" style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/fresh.svg" width="18">
        <span>${critics || 'N/A'}</span>
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/aud_score-fresh.svg" width="18">
        <span>${audience || 'N/A'}</span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  }

  // Основной обработчик
  Lampa.Listener.follow('full', function(e) {
    if (e.type !== 'complite') return;

    hideTMDb(); // Скрываем TMDb если включено

    const movie = e.data?.movie || e.data?.tv;
    if (!movie?.imdb_id) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      Lampa.Noty.show('Введите OMDb API ключ в настройках плагина');
      return;
    }

    const cacheKey = movie.imdb_id;
    if (cache[cacheKey]) {
      addRatings(e.body, cache[cacheKey].critics, cache[cacheKey].audience);
      return;
    }

    fetch(`${OMDB_URL}?apikey=${apiKey}&i=${movie.imdb_id}&tomatoes=true`)
      .then(res => res.json())
      .then(data => {
        if (!data) return;

        const rtRating = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
        const critics = rtRating?.Value;
        const audience = data.tomatoUserMeter;

        cache[cacheKey] = { critics, audience };
        addRatings(e.body, critics, audience);
      })
      .catch(() => Lampa.Noty.show('Ошибка загрузки рейтингов'));
  });

})();
