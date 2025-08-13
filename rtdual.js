(function () {
  'use strict';

  // === Константы и ключи хранилища ===
  const COMP_ID   = 'rtdual';                          // id секции в Настройках
  const STORE_KEY = 'rtdual';                          // префикс ключей Storage
  const OMDB_URL  = 'https://www.omdbapi.com/';

  const SKEY_OMDB     = STORE_KEY + '_omdb_key';
  const SKEY_HIDE_TMDB= STORE_KEY + '_hide_tmdb';

  // --- простецкий кэш на сессию ---
  const cache = Object.create(null);

  // === Раздел в НАСТРОЙКАХ ===
  try {
    // Добавляем сам пункт «Rotten Tomatoes (OMDb Dual)» в корневое меню настроек
    Lampa.SettingsApi.addComponent({
      component: COMP_ID,
      name: 'Rotten Tomatoes (OMDb Dual)',
      icon: '🍅'
    });

    // Поле ввода OMDb API key
    Lampa.SettingsApi.addParam({
      component: COMP_ID,
      param: 'omdb_key',
      type: 'input',
      name: 'OMDb API-ключ',
      default: '',
      value: Lampa.Storage.get(SKEY_OMDB, '') || '',
      onChange(val){
        Lampa.Storage.set(SKEY_OMDB, (val||'').trim());
        Lampa.Noty.show('Ключ OMDb сохранён');
      }
    });

    // Переключатель скрытия TMDb
    Lampa.SettingsApi.addParam({
      component: COMP_ID,
      param: 'hide_tmdb',
      type: 'checkbox',
      name: 'Скрывать рейтинг TMDb в карточке',
      default: false,
      value: !!Lampa.Storage.get(SKEY_HIDE_TMDB, false),
      onChange(val){
        Lampa.Storage.set(SKEY_HIDE_TMDB, !!val);
        Lampa.Noty.show('Настройка сохранена');
      }
    });

    // Немного инфы
    Lampa.SettingsApi.addParam({
      component: COMP_ID,
      param: 'about',
      type: 'text',
      name: 'Плагин добавляет Tomatometer (критики) и Audience (зрители) в строку рейтингов карточки. Для работы требуется OMDb API-ключ.',
    });
  } catch (e) {
    // В старых сборках API может отличаться — просто молча пропустим
    console.warn('RTDual: settings inject failed', e);
  }

  // === ВСПОМОГАТЕЛЬНОЕ ===
  function omdbKey(){
    return (Lampa.Storage.get(SKEY_OMDB, '') || '').trim();
  }

  async function fetchJSON(url){
    try{
      const r = await fetch(url);
      return await r.json();
    }catch(e){ return null; }
  }

  async function fetchText(url){
    try{
      const r = await fetch(url);
      return await r.text();
    }catch(e){ return ''; }
  }

  function hideTMDbIfEnabled(root){
    if(!Lampa.Storage.get(SKEY_HIDE_TMDB, false)) return;

    try{
      // Удаляем «плашку» TMDb из строки рейтингов карточки
      // Строка: .info__rate .rate … ищем внутренний текст TMDB
      root.find('.info__rate .rate').each(function(){
        const $r = $(this);
        const t  = ($r.text()||'').toLowerCase();
        if (t.includes('tmdb')) $r.remove();
      });
    }catch(e){}
  }

  function ensureRtBadgesContainer(root){
    // Строка рейтингов в карточке
    const row = root.find('.info__rate');
    return row.length ? row : null;
  }

  function addRtBadges(row, critics, audience){
    // не дублировать
    if (row.find('.rate--rt-critics').length || row.find('.rate--rt-aud').length) return;

    const tomatoIcon   = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg';
    const popcornIcon  = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg';

    const makeBadge = (cls, icon, value, label) => {
      const val = value ? value : '—';
      const tip = label + (value ? (': ' + value) : ': нет данных');
      return $(
        `<div class="rate ${cls}" title="${tip}" style="display:flex;align-items:center;gap:.35em">
            <img src="${icon}" alt="${label}" style="width:1.1em;height:1.1em;display:block">
            <div class="rate__icon"></div>
            <div class="rate__text" style="font-weight:700">${val}</div>
            <div class="rate__name" style="opacity:.7">${label}</div>
         </div>`
      );
    };

    row.append( makeBadge('rate--rt-critics', tomatoIcon, critics,  'RT') );
    row.append( makeBadge('rate--rt-aud',     popcornIcon, audience,'AUD') );
  }

  async function getRtByOmdb({imdb, title, year}){
    const key = omdbKey();
    if(!key) return { error:'NO_KEY' };

    const ckey = imdb || (title + '|' + (year || ''));
    if (cache[ckey]) return cache[ckey];

    const qs = imdb
      ? `i=${encodeURIComponent(imdb)}`
      : `t=${encodeURIComponent(title)}${year?`&y=${encodeURIComponent(year)}`:''}`;

    const url = `${OMDB_URL}?apikey=${key}&${qs}&plot=short&r=json`;

    const data = await fetchJSON(url);
    if (!data || data.Error) return { error:'OMDB_ERROR' };

    // Tomatometer (критики)
    let critics = null;
    if (Array.isArray(data.Ratings)){
      const rt = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
      if (rt && rt.Value) critics = rt.Value; // "92%"
    }

    // Audience Score — если у OMDb есть ссылка на страницу RT, вытащим процент со страницы
    let audience = null;
    if (data.Website && /rottentomatoes\.com/.test(data.Website)){
      const html = await fetchText(data.Website);
      const m = html && html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
      if (m) audience = m[1] + '%';
    }

    const res = { critics, audience };
    cache[ckey] = res;
    return res;
  }

  function warnNoKeyOnce(){
    if (window.__rtdual_key_warned) return;
    window.__rtdual_key_warned = true;
    Lampa.Noty.show('Rotten Tomatoes: введите OMDb API-ключ в настройках плагина.');
  }

  // === ОСНОВНОЙ ХУК В КАРТОЧКУ ===
  Lampa.Listener.follow('full', function (e) {
    if (e.type !== 'complite') return;

    // Корневая нода карточки
    const $root = e.body ? $(e.body) : $('.full'); // подстрахуемся
    if (!$root.length) return;

    hideTMDbIfEnabled($root);

    const row = ensureRtBadgesContainer($root);
    if (!row) return;

    // данные карточки
    const card = e.data && (e.data.movie || e.data.tv || e.data) || {};
    const imdb = card.imdb_id || card.imdb || '';
    const title= card.title   || card.name  || '';
    const year = card.release_year || card.year || '';

    if (!imdb && !title){
      // нечего искать — спокойно выходим
      return;
    }

    // пока грузим — можно поставить «пустышки», но не обязательно
    // если хочешь индикатор — раскомментируй строку ниже
    // row.append('<div class="wait_rating" style="width:2em;margin-left:.5em"></div>');

    getRtByOmdb({ imdb, title, year }).then(res=>{
      if (res && res.error === 'NO_KEY'){
        warnNoKeyOnce();
        return;
      }
      if (!res || res.error) return;

      addRtBadges(row, res.critics, res.audience);
    });
  });

})();

