(function () {
  'use strict';

  // ==== META ====
  const PLUGIN_ID = 'kp_watched';
  const PLUGIN_NAME = 'Кинопоиск: просмотрено';
  const STORAGE_KEY = 'kp_watched_store_v1';
  const SETTINGS_NS = 'kp_watched_settings';

  // ==== SAFE GUARDS ====
  if (typeof window.Lampa === 'undefined') {
    console.log('[kp_watched] Lampa not found');
    return;
  }
  const L = window.Lampa;

  // ==== STORAGE ====
  // Структура:
  // {
  //   byKpId: { "<kp_id>": true|false, ... },
  //   byFallback: { "<fingerprint>": true|false, ... }
  // }
  function getStore() {
    return L.Storage.get(STORAGE_KEY, { byKpId: {}, byFallback: {} });
  }
  function setStore(store) {
    L.Storage.set(STORAGE_KEY, store);
  }

  function makeFallbackKey(card) {
    // На случай, если нет kp_id, используем стабильный "отпечаток"
    const t = (card.title || card.name || card.original_title || '').trim().toLowerCase();
    const y = card.release_year || card.first_air_date || card.year || '';
    const tm = card.id || card.tmdb_id || '';
    return [t, y, tm].filter(Boolean).join('::');
  }

  function readWatched(card) {
    const s = getStore();
    const kp = card.kp_id || card.kinopoisk_id || (card.external_ids && card.external_ids.kp_id);
    if (kp && s.byKpId.hasOwnProperty(String(kp))) return !!s.byKpId[String(kp)];
    const fb = makeFallbackKey(card);
    if (fb && s.byFallback.hasOwnProperty(fb)) return !!s.byFallback[fb];
    return false;
  }

  function writeWatched(card, val) {
    const s = getStore();
    const kp = card.kp_id || card.kinopoisk_id || (card.external_ids && card.external_ids.kp_id);
    if (kp) s.byKpId[String(kp)] = !!val;
    else s.byFallback[makeFallbackKey(card)] = !!val;
    setStore(s);
  }

  // ==== SETTINGS (SYNC WITH KP VIA PROXY) ====
  // Почему нужен прокси: Кинопоиск требует авторизацию, а их домен не даёт CORS.
  // Поэтому запросы идут на твой сервер (proxy), а он уже стучится в Кинопоиск с твоими куками.
  // Пример ожидаемых эндпоинтов:
  //   GET  {proxy}/kp/watched?kp_id=123 -> { watched: true|false }
  //   POST {proxy}/kp/watched { kp_id, watched } -> { ok: true }
  // Прокси добавляет нужные cookies/headers для Кинопоиска.
  const defaultSettings = {
    sync_enabled: false,
    proxy_url: '', // например: https://your-domain.com/api
    auth_token: '' // если прокси требует свой токен
  };

  function getSettings() {
    return L.Storage.get(SETTINGS_NS, Object.assign({}, defaultSettings));
  }
  function setSettings(s) {
    L.Storage.set(SETTINGS_NS, s);
  }

  function addSettingsUI() {
    L.Settings.add({
      group: {
        title: PLUGIN_NAME,
        subtitle: 'Статусы просмотрено/не просмотрено',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5z"/></svg>',
        advanced: true
      },
      options: [
        {
          title: 'Синхронизация с Кинопоиском',
          name: 'sync_enabled',
          type: 'toggle',
          default: defaultSettings.sync_enabled
        },
        {
          title: 'Proxy URL',
          name: 'proxy_url',
          type: 'input',
          default: defaultSettings.proxy_url,
          placeholder: 'https://your-domain/api'
        },
        {
          title: 'Auth token (для прокси, если требуется)',
          name: 'auth_token',
          type: 'input',
          default: defaultSettings.auth_token,
          placeholder: 'например, Bearer xxx'
        }
      ],
      onChange: function (name, value) {
        const s = getSettings();
        s[name] = value;
        setSettings(s);
      }
    });
  }

  // ==== NETWORK (SYNC LAYER) ====
  function getKpId(card) {
    return card.kp_id || card.kinopoisk_id || (card.external_ids && card.external_ids.kp_id);
  }

  function proxyHeaders() {
    const s = getSettings();
    const h = {};
    if (s.auth_token) h['Authorization'] = s.auth_token;
    return h;
  }

  function fetchWatchedFromKP(card) {
    const s = getSettings();
    const kp_id = getKpId(card);
    if (!s.sync_enabled || !s.proxy_url || !kp_id) return Promise.resolve(null);

    const url = s.proxy_url.replace(/\/+$/, '') + '/kp/watched?kp_id=' + encodeURIComponent(kp_id);

    return L.Network.native(url, {
      method: 'GET',
      headers: proxyHeaders(),
      timeout: 10e3
    }).then((res) => {
      if (res && typeof res.watched === 'boolean') return res.watched;
      return null;
    }).catch(() => null);
  }

  function pushWatchedToKP(card, watched) {
    const s = getSettings();
    const kp_id = getKpId(card);
    if (!s.sync_enabled || !s.proxy_url || !kp_id) return Promise.resolve(false);

    const url = s.proxy_url.replace(/\/+$/, '') + '/kp/watched';

    return L.Network.native(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, proxyHeaders()),
      body: JSON.stringify({ kp_id, watched }),
      timeout: 10e3
    }).then((res) => !!(res && res.ok)).catch(() => false);
  }

  // ==== BADGE RENDER ====
  const CSS = `
    .kp-watched-badge {
      display:inline-flex; align-items:center; gap:.4em;
      padding:4px 8px; border-radius:12px;
      font-size:12px; line-height:1; user-select:none; cursor:pointer;
      border:1px solid var(--accent, #00a1d6); transition:opacity .2s ease;
      margin-right:.6em;
    }
    .kp-watched-badge[data-on="true"]{
      background: var(--accent, #00a1d6);
      color: #fff;
    }
    .kp-watched-badge svg{ width:14px; height:14px }
    .kp-watched-badge.kp-dim{ opacity:.6 }
    .kp-watched-wrap{ display:flex; align-items:center; flex-wrap:wrap; margin-bottom:.4em }
  `;
  function injectCSS() {
    if (document.getElementById('kp-watched-style')) return;
    const style = document.createElement('style');
    style.id = 'kp-watched-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function makeBadge(on) {
    const el = document.createElement('div');
    el.className = 'kp-watched-badge';
    el.setAttribute('data-on', on ? 'true' : 'false');
    el.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        ${on
          ? '<path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5z"/>'
          : '<path d="M19 13H5v-2h14v2zM12 19l-7-7 7-7v14z"/>'}
      </svg>
      <span>${on ? 'Просмотрено' : 'Не просмотрено'}</span>
    `;
    return el;
  }

  function findGenresContainer(root) {
    // В карточке Lampa контейнер жанров обычно внутри .full__tags или .full__info .tags
    return root.querySelector('.full__tags, .full__info .tags') || root.querySelector('.tags');
  }

  function renderBadge(root, card, current) {
    const tags = findGenresContainer(root);
    if (!tags) return;

    // Оборачиваем, чтобы бейдж встал "слева от жанров"
    let wrap = tags.previousElementSibling;
    if (!wrap || !wrap.classList || !wrap.classList.contains('kp-watched-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'kp-watched-wrap';
      tags.parentNode.insertBefore(wrap, tags); // слева/выше жанров
    } else {
      wrap.innerHTML = '';
    }

    const badge = makeBadge(current);
    wrap.appendChild(badge);

    let busy = false;

    badge.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      badge.classList.add('kp-dim');

      const next = !current;
      // Локально сразу переключаем
      writeWatched(card, next);
      badge.replaceWith(renderBadge(root, card, next)); // перерисуем
      // Пробуем синхронизировать (если включено)
      const pushed = await pushWatchedToKP(card, next).catch(() => false);
      if (!pushed) {
        // Если не получилось синкнуть — оставляем локально как есть, можно всплывашку:
        L.Noty.show('Статус сохранён локально' + (getSettings().sync_enabled ? ', синхронизация не удалась' : ''));
      }
      busy = false;
    });

    return badge;
  }

  // ==== HOOK FULL PAGE ====
  function enhanceFullCard(event) {
    // event: {type, name, body, data...}
    if (event.type !== 'build') return;
    const root = event.body;        // DOM корень карточки
    const card = event.data || {};  // данные фильма/сериала (tmdb/kp и т.д.)

    // 1) Локальный статус из хранения
    let current = readWatched(card);

    // 2) Если включена синхронизация и есть kp_id — подтянем статус
    fetchWatchedFromKP(card).then((remote) => {
      if (typeof remote === 'boolean') {
        current = remote;
        writeWatched(card, current); // синхронизируем локальный кэш
        renderBadge(root, card, current); // перерисуем по факту
      }
    });

    // Первичная отрисовка (мгновенно)
    injectCSS();
    renderBadge(root, card, current);
  }

  // ==== INIT LISTENERS ====
  function init() {
    addSettingsUI();
    // События "full" — стандартный способ модифицировать страницу карточки
    L.Listener.follow('full', enhanceFullCard);

    L.Noty.show(PLUGIN_NAME + ' — загружен');
    console.log('[kp_watched] ready');
  }

  // ==== REGISTER (старые/новые версии Lampa по-разному зовут) ====
  try {
    if (L && L.Plugin && typeof L.Plugin.create === 'function') {
      L.Plugin.create({
        title: PLUGIN_NAME,
        id: PLUGIN_ID,
        description: 'Показывает и переключает статус «просмотрено» в карточке. Есть опциональная синхронизация с Кинопоиском.',
        version: '0.1.0',
        onLoad: init,
        onStop: function(){ /* noop */ }
      });
    } else {
      // Фолбэк для случаев без реестра плагинов
      init();
    }
  } catch (e) {
    console.error('[kp_watched] init error', e);
  }
})();
