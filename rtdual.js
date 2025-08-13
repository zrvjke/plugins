(function () {
    'use strict';

    const PLUGIN_ID = 'rt_omdb_dual';
    const PLUGIN_NAME = 'Rotten Tomatoes (OMDb Dual)';
    const OMDB_URL = 'https://www.omdbapi.com/';

    let cache = {};

    // Регистрируем компонент настроек, как у bywolf
    Lampa.SettingsApi.addComponent({
        component: PLUGIN_ID,
        name: PLUGIN_NAME,
        icon: '🍅',
        category: 'plugins',
        params: [
            {
                name: 'omdb_key',
                type: 'input',
                placeholder: 'Введите OMDb API ключ',
                value: '',
            },
            {
                name: 'hide_tmdb',
                type: 'switch',
                label: 'Скрывать рейтинг TMDb',
                value: false,
            }
        ],
        onChange: function (name, value) {
            Lampa.Storage.set(PLUGIN_ID + '_' + name, value);
        },
        onRender: function () {
            this.params.forEach(param => {
                if (param.name === 'omdb_key') {
                    param.value = Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '');
                }
                if (param.name === 'hide_tmdb') {
                    param.value = Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false);
                }
            });
        }
    });

    function getApiKey() {
        return (Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '') || '').trim();
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
        root.find('.full--rating .rating').each(function () {
            const label = $(this).find('.source,.title').text().trim().toLowerCase();
            if (label.includes('tmdb')) $(this).remove();
        });
    }

    function addRtRatings(tomatometer, audience) {
        const ratingsBlock = document.querySelector('.full--rating');
        if (!ratingsBlock || ratingsBlock.querySelector('.rt-rating')) return;

        const div = document.createElement('div');
        div.className = 'rating rt-rating';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.innerHTML = `
            <div style="display:flex;align-items:center;gap:4px;">
                <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg" style="width:20px;height:20px;">
                <span style="font-weight:bold;color:#b02a2a;">${tomatometer || '—'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
                <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg" style="width:20px;height:20px;">
                <span style="font-weight:bold;color:#ad6a00;">${audience || '—'}</span>
            </div>
        `;
        ratingsBlock.appendChild(div);
    }

    async function getRtRatings({ imdb, title, year }) {
        const key = getApiKey();
        if (!key) return { error: 'NO_KEY' };

        const cacheKey = imdb || (title + '|' + (year || ''));
        if (cache[cacheKey]) return cache[cacheKey];

        const qs = imdb
            ? `i=${encodeURIComponent(imdb)}`
            : `t=${encodeURIComponent(title)}${year ? `&y=${encodeURIComponent(year)}` : ''}`;
        const url = `${OMDB_URL}?apikey=${key}&${qs}&plot=short&r=json`;

        const data = await fetchJson(url);
        if (!data || data.Error) return { error: 'OMDB_ERROR' };

        let tomatometer = null;
        if (data.Ratings) {
            const rt = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
            if (rt && rt.Value) tomatometer = rt.Value;
        }

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

    function run() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            const card = e.data?.movie || e.data?.tv || e.data || {};
            const imdb = card.imdb_id || card.imdb || '';
            const title = card.title || card.name || '';
            const year = card.release_year || card.year || '';

            if (e.body) hideTMDbIfNeeded(e.body);

            if (!title && !imdb) return;

            getRtRatings({ imdb, title, year }).then(res => {
                if (res.error === 'NO_KEY') {
                    if (!window.__rt_key_warned) {
                        window.__rt_key_warned = true;
                        Lampa.Noty.show('Rotten Tomatoes: введите OMDb API ключ в настройках плагина.');
                    }
                    return;
                }
                if (res.error) return;
                addRtRatings(res.tomatometer, res.audience);
            });
        });
    }

    Lampa.Plugin.create({
        title: PLUGIN_NAME,
        icon: '🍅',
        id: PLUGIN_ID,
        description: 'Показывает Tomatometer и Audience от Rotten Tomatoes. Есть опция скрыть TMDb.',
        version: '1.0.0',
        author: 'custom'
    }, run);

})();

