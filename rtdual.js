(function () {
  'use strict';

  const PLUGIN_ID = 'rt_ratings_pro';
  const PLUGIN_NAME = 'Rotten Tomatoes Pro';
  const OMDB_URL = 'https://www.omdbapi.com/';

  // ---------- Настройки в Лампе ----------
  Lampa.SettingsApi.addComponent({
    component: PLUGIN_ID,
    name: 'Rotten Tomatoes (OMDb)',
    icon: '🍅',
    onRender: (item) => {
      // Поле для OMDb API key
      item.append(
        Lampa.Template.get('settings_input', {
          title: 'OMDb API ключ',
          name: 'omdb_key',
          type: 'text',
          value: Lampa.Storage.get(PLUGIN_ID + '_omdb_key', ''),
        })
      );

      // Переключатель скрытия TMDb
      item.append(
        Lampa.Template.get('settings_switch', {
          title: 'Скрывать рейтинг TMDb',
          name: 'hide_tmdb',
          value: Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false),
        })
      );
    },
    onChange: (name, value) => {
      if (name === 'omdb_key') {
        Lampa.Storage.set(PLUGIN_ID + '_omdb_key', value.trim());
      }
      if (name === 'hide_tmdb') {
        Lampa.Storage.set(PLUGIN_ID + '_hide_tmdb', !!value);
      }
    },
  });

  // ---------- Вспомогалки ----------
  const cache = Object.create(null);

  function getApiKey() {
    return Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '').trim();
  }

  async function fetchJson(url) {
    try {
      const r = await fetch(url);
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  async function fetchText(url) {
    try {
      const r = await fetch(url);
      return await r.text();
    } catch (e) {
      return '';
    }
  }

  function hideTMDbIfNeeded(root) {
    if (!Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false)) return;
    // В блоке "Рейтинги" удаляем TMDb
    root.find('.full--rating .rating').each(function () {
      const $r = $(this);
      const label = $r.find('.source,.title').text().trim().toLowerCase();
      if (label.includes('tmdb')) $r.remove();
    });
  }

  function injectCompact(tomatometer, audience) {
    const infoPanel = document.querySelector('.full-info');
    if (!infoPanel) return;

    // не дублируем
    if (infoPanel.querySelector('.rt-compact-ratings')) return;

    const block = document.createElement('div');
    block.className = 'rt-compact-ratings';
    block.style.display = 'flex';
    block.style.alignItems = 'center';
    block.style.gap = '16px';
    block.style.marginTop = '8px';

    block.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg" style="width:20px;height:20px;">
        <span style="font-weight:700;color:#b02a2a;">${tomatometer ?? '<span style="color:#888">—</span>'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg" style="width:20px;height:20px;">
        <span style="font-weight:700;color:#ad6a00;">${audience ?? '<span style="color:#888">—</span>'}</span>
      </div>
    `;

    infoPanel.appendChild(block);
  }

  async function getRtRatingsByOmdb({ imdb, title, year }) {
    const key = getApiKey();
    if (!key) return { error: 'NO_KEY' };

    const cacheKey = imdb || (title + '|' + (year || ''));
    if (cache[cacheKey]) return cache[cacheKey];

    // Если есть imdb — спрашиваем по нему. Иначе — по title+year.
    const qs = imdb
      ? `i=${encodeURIComponent(imdb)}`
      : `t=${encodeURIComponent(title)}${year ? `&y=${encodeURIComponent(year)}` : ''}`;

    const url = `${OMDB_URL}?apikey=${key}&${qs}&plot=short&r=json`;

    const data = await fetchJson(url);
    if (!data || data.Error) return { error: 'OMDB_ERROR' };

    // Tomatometer (критики)
    let tomatometer = null;
    if (data.Ratings && Array.isArray(data.Ratings)) {
      const rt = data.Ratings.find((r) => r.Source === 'Rotten Tomatoes');
      if (rt && rt.Value) tomatometer = rt.Value; // например "92%"
    }

    // Audience Score (попробуем вытащить со страницы, если ссылка есть)
    let audience = null;
    if (data.Website && /rottentomatoes\.com/.test(data.Website)) {
      const html = await fetchText(data.Website);
      const m = html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
      if (m) audience = m[1] + '%';
    }

    const result = { tomatometer, audience };
    cache[cacheKey] = result;
    return result;
  }

  // ---------- Основная логика ----------
  function run() {
    // срабатывает при открытии карточки
    Lampa.Listener.follow('full', function (e) {
      if (e.type !== 'complite') return;

      // карточка может лежать в разных полях
      const card = e.data?.movie || e.data?.tv || e.data || {};
      const imdb = card.imdb_id || card.imdb || '';
      const title = card.title || card.name || '';
      const year = card.release_year || card.year || '';

      // скрываем TMDb при необходимости
      if (e.body) hideTMDbIfNeeded(e.body);

      if (!title && !imdb) return;

      getRtRatingsByOmdb({ imdb, title, year }).then((res) => {
        if (res?.error === 'NO_KEY') {
          // покажем уведомление один раз за сессию
          if (!window.__rt_key_warned) {
            window.__rt_key_warned = true;
            Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках плагина.');
          }
          return;
        }
        if (res?.error) return;

        injectCompact(res.tomatometer, res.audience);
      });
    });
  }

  // Регистрируем плагин «по-ламповски»
  Lampa.Plugin.create(
    {
      title: PLUGIN_NAME,
      icon: '🍅',
      id: PLUGIN_ID,
      description: 'Показывает Tomatometer и Audience от Rotten Tomatoes. Есть опция скрыть TMDb.',
      version: '1.0.0',
      author: 'you',
    },
    run
  );
})();
