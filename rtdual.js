(function () {
  'use strict';

  // ====== Константы и хранилище ======
  const ID = 'rt_omdb_dual';
  const NAME = 'Rotten Tomatoes (OMDb Dual)';
  const STORE = {
    get key() { return (Lampa.Storage.get(ID + '_key', '') || '').trim(); },
    set key(v) { Lampa.Storage.set(ID + '_key', String(v || '').trim()); },
    get hideTmdb() { return !!Lampa.Storage.get(ID + '_hide_tmdb', false); },
    set hideTmdb(v) { Lampa.Storage.set(ID + '_hide_tmdb', !!v); }
  };

  const ICONS = {
    tomato: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg',
    popcorn: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg',
    certified: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/certified_fresh-notext.56a8e219a92.svg',
    fresh: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer-fresh.149b5e95350.svg',
    rotten: 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer-rotten.149b5e95350.svg'
  };

  const cache = Object.create(null);

  // ====== Вспомогалки сети ======
  function netJSON(url) {
    return new Promise((resolve) => {
      Lampa.Network.get(url, {}, resolve, () => resolve(null));
    });
  }
  function netTEXT(url) {
    return new Promise((resolve) => {
      Lampa.Network.get(url, {}, (t) => resolve(t), () => resolve(''));
    });
  }

  // ====== Настройки (модальное окно) ======
  function openSettingsModal() {
    const root = document.createElement('div');
    root.className = 'about';
    root.style.padding = '10px 0';

    root.innerHTML = `
      <div class="selector" data-action="edit_key">
        <div class="name">OMDb API ключ</div>
        <div class="value">${STORE.key ? '••••••••' : 'не задан'}</div>
      </div>
      <div class="selector" data-action="toggle_tmdb">
        <div class="name">Скрывать рейтинг TMDb в карточке</div>
        <div class="value">${STORE.hideTmdb ? 'Вкл' : 'Выкл'}</div>
      </div>
      <div class="selector" data-action="help">
        <div class="name">Где взять ключ OMDb?</div>
        <div class="value">omdbapi.com — Free API Key</div>
      </div>
    `;

    root.querySelectorAll('.selector').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.getAttribute('data-action');

        if (act === 'edit_key') {
          Lampa.Input.edit({
            title: 'Введите OMDb API ключ',
            value: STORE.key,
            free: true,
          }, (val) => {
            STORE.key = val || '';
            el.querySelector('.value').textContent = STORE.key ? '••••••••' : 'не задан';
            Lampa.Noty.show('Сохранено');
          });
        }

        if (act === 'toggle_tmdb') {
          STORE.hideTmdb = !STORE.hideTmdb;
          el.querySelector('.value').textContent = STORE.hideTmdb ? 'Вкл' : 'Выкл';
          Lampa.Noty.show(STORE.hideTmdb ? 'TMDb будет скрыт' : 'TMDb будет показан');
        }

        if (act === 'help') {
          Lampa.Noty.show('Получите бесплатный ключ на omdbapi.com (Email → API Key).');
        }
      });
    });

    Lampa.Modal.open({
      title: NAME,
      html: root,
      onBack: function () {
        Lampa.Modal.close();
        Lampa.Controller.toggle('settings_component');
      }
    });
  }

  // Добавляем пункт в «Настройки»
  function mountSettingsEntry() {
    // Если SettingsApi есть — используем его как «пускатель» модалки
    if (Lampa.SettingsApi && Lampa.SettingsApi.addComponent) {
      try {
        Lampa.SettingsApi.addComponent({
          component: ID,
          name: NAME,
          icon: '🍅',
          onSelect: openSettingsModal
        });
        return;
      } catch (e) { /* пойдём «вручную» ниже */ }
    }

    // «Вручную»: когда открывается экран настроек — дописываем пункт в меню
    const attachOnce = () => {
      const menu = document.querySelector('.settings .menu .list, .settings .menu__list, .settings .scroll .list');
      if (!menu) return;

      if (menu.querySelector(`[data-rt="${ID}"]`)) return;

      const item = document.createElement('div');
      item.className = 'selector';
      item.setAttribute('data-rt', ID);
      item.innerHTML = `<div class="name">🍅 ${NAME}</div>`;

      item.addEventListener('click', openSettingsModal);
      menu.appendChild(item);
    };

    // пробуем сейчас
    attachOnce();

    // и при каждом открытии экрана настроек
    Lampa.Listener.follow('settings', (e) => {
      if (e.type === 'open') setTimeout(attachOnce, 50);
    });
  }

  // ====== Логика получения рейтингов ======
  async function getRtByOmdbOrRt({ imdb, title, year }) {
    const key = STORE.key;
    const cacheKey = imdb || (title + '|' + (year || ''));
    if (cache[cacheKey]) return cache[cacheKey];

    let result = { tomatometer: null, audience: null, badge: null };

    if (key && imdb) {
      const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdb)}&plot=short&r=json`;
      const data = await netJSON(url);
      if (data && !data.Error && Array.isArray(data.Ratings)) {
        const rt = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
        if (rt && rt.Value) result.tomatometer = rt.Value; // "92%"
      }
      // audience через прямой парс RT ниже
    }

    // Дотягиваемся напрямую к RT (для audience и/или если нет ключа)
    if (!result.tomatometer || !result.audience) {
      const search = await netJSON('https://www.rottentomatoes.com/napi/search/?query=' + encodeURIComponent(title));
      try {
        let movie = null;

        if (search && search.movies && search.movies.length) {
          // пытаемся сопоставить по году
          if (year) {
            movie = search.movies.find(m => String(m.year || '').includes(String(year))) || search.movies[0];
          } else movie = search.movies[0];
        }

        const url = movie && movie.url ? ('https://www.rottentomatoes.com' + movie.url) : null;

        if (url) {
          const html = await netTEXT(url);

          if (!result.tomatometer) {
            const m1 = html.match(/"tomatometerScore":\s*{"score":\s*([0-9]{1,3})/i) ||
                       html.match(/tomatometer.*?([0-9]{1,3})%/i);
            if (m1) result.tomatometer = m1[1] + '%';
          }

          const m2 = html.match(/"audienceScore":\s*{"score":\s*([0-9]{1,3})/i) ||
                     html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
          if (m2) result.audience = m2[1] + '%';

          if (/certified_fresh/.test(html)) result.badge = 'certified';
          else if (/tomatometer-fresh|fresh/.test(html)) result.badge = 'fresh';
          else if (/rotten/.test(html)) result.badge = 'rotten';
        }
      } catch (e) { /* молчим */ }
    }

    cache[cacheKey] = result;
    return result;
  }

  function hideTmdbIfNeeded($root) {
    if (!STORE.hideTmdb) return;
    try {
      $root.find('.full--rating .rating').each(function () {
        const $r = $(this);
        const label = ($r.find('.source,.title').text() || '').trim().toLowerCase();
        if (label.includes('tmdb')) $r.remove();
      });
    } catch (e) { /* jQuery не обязателен везде */ }
  }

  function injectRatings(tomatometer, audience, badge) {
    const host = document.querySelector('.full-info, .full__items, .full--rating');
    if (!host) return;
    if (host.querySelector('.rt-omdb-dual')) return;

    const wrap = document.createElement('div');
    wrap.className = 'rt-omdb-dual';
    wrap.style.marginTop = '10px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '18px';

    const leftIcon = badge && ICONS[badge] ? ICONS[badge] : ICONS.tomato;

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${leftIcon}" style="width:22px;height:22px;">
        <span style="font-weight:700;color:#b02a2a;">${tomatometer || '<span style="color:#888">—</span>'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${ICONS.popcorn}" style="width:22px;height:22px;">
        <span style="font-weight:700;color:#ad6a00;">${audience || '<span style="color:#888">—</span>'}</span>
      </div>
    `;

    host.appendChild(wrap);
  }

  // ====== Главный хук ======
  function run() {
    // Пункт в настройках
    mountSettingsEntry();

    // Подписываемся на открытие карточки
    Lampa.Listener.follow('full', function (e) {
      if (e.type !== 'complite') return;

      const card = e.data?.movie || e.data?.tv || e.data || {};
      const imdb = card.imdb_id || card.imdb || '';
      const title = card.title || card.name || '';
      const year = card.release_year || card.year || '';

      if (!title && !imdb) return;

      if (e.body) hideTmdbIfNeeded(e.body);

      getRtByOmdbOrRt({ imdb, title, year }).then((r) => {
        if (!STORE.key && !r.tomatometer && !r.audience) {
          Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках плагина.');
        }
        injectRatings(r.tomatometer, r.audience, r.badge);
      });
    });
  }

  // ====== Регистрация плагина ======
  if (Lampa.Plugin && Lampa.Plugin.create) {
    Lampa.Plugin.create({
      title: NAME,
      id: ID,
      icon: '🍅',
      version: '1.3.0',
      description: 'Tomatometer и Audience с Rotten Tomatoes. Ввод OMDb ключа и скрытие TMDb.',
      author: 'custom'
    }, run);
  } else {
    // На очень старых сборках Lampa — просто запускаем
    run();
  }
})();

