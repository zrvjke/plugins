(function() {
    'use strict';

    // Проверяем загрузку API Lampa
    if (!window.Lampa || !Lampa.Plugin) {
        console.error('Lampa.Plugin не доступен!');
        return;
    }

    // Конфигурация плагина
    const PLUGIN_ID = 'rt_ratings';
    const OMDB_URL = 'https://www.omdbapi.com/';

    // Регистрируем плагин
    Lampa.Plugin.register({
        id: PLUGIN_ID,
        name: 'Rotten Tomatoes',
        version: '2.0.1',
        description: 'Добавляет рейтинги Rotten Tomatoes с возможностью скрыть TMDb',
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
                name: 'Скрыть рейтинг TMDb',
                default: false
            }
        ]
    });

    // Создаем раздел в настройках
    Lampa.SettingsApi.addComponent({
        component: PLUGIN_ID,
        name: 'Rotten Tomatoes',
        icon: '🍅'
    });

    // Добавляем параметры в настройки
    Lampa.SettingsApi.addParam({
        component: PLUGIN_ID,
        param: 'omdb_key',
        type: 'input',
        name: 'OMDb API Key',
        default: '',
        value: Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '') || '',
        onChange: function(val) {
            Lampa.Storage.set(PLUGIN_ID + '_omdb_key', (val || '').trim());
            Lampa.Noty.show('Ключ OMDb сохранён');
        }
    });

    Lampa.SettingsApi.addParam({
        component: PLUGIN_ID,
        param: 'hide_tmdb',
        type: 'checkbox',
        name: 'Скрыть рейтинг TMDb',
        default: false,
        value: !!Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false),
        onChange: function(val) {
            Lampa.Storage.set(PLUGIN_ID + '_hide_tmdb', !!val);
            Lampa.Noty.show('Настройка сохранена');
            updateTmdbVisibility();
        }
    });

    // Кэш рейтингов
    const cache = {};

    // Функция скрытия/показа TMDb рейтинга
    function updateTmdbVisibility() {
        const hide = Lampa.Storage.get(PLUGIN_ID + '_hide_tmdb', false);
        document.querySelectorAll('.rate--tmdb').forEach(el => {
            el.style.display = hide ? 'none' : '';
        });
    }

    // Функция добавления RT рейтингов
    function addRTRatings(container, critics, audience) {
        // Удаляем старые RT рейтинги если есть
        container.querySelectorAll('.rate--rt').forEach(el => el.remove());

        const criticsValue = critics ? critics + '%' : 'N/A';
        const audienceValue = audience ? audience + '%' : 'N/A';

        const html = `
            <div class="rating rate--rt" style="display: flex; align-items: center; gap: 8px; margin-left: 15px;">
                <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/fresh.svg" 
                     style="width:18px; height:18px; vertical-align: middle;">
                <span style="font-weight: bold;">${criticsValue}</span>
                <img src="https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/aud_score-fresh.svg" 
                     style="width:18px; height:18px; vertical-align: middle; margin-left: 5px;">
                <span style="font-weight: bold;">${audienceValue}</span>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
    }

    // Основной обработчик
    Lampa.Listener.follow('full', function(e) {
        if (e.type !== 'complite') return;
        
        // Обновляем видимость TMDb
        updateTmdbVisibility();

        const movie = e.data?.movie || e.data?.tv;
        if (!movie?.imdb_id) return;

        const apiKey = Lampa.Storage.get(PLUGIN_ID + '_omdb_key', '').trim();
        if (!apiKey) {
            Lampa.Noty.show('Введите OMDb API ключ в настройках плагина');
            return;
        }

        const cacheKey = movie.imdb_id;
        if (cache[cacheKey]) {
            const ratingsBlock = e.body.querySelector('.info__rate, .full--rating');
            if (ratingsBlock) {
                addRTRatings(ratingsBlock, cache[cacheKey].critics, cache[cacheKey].audience);
            }
            return;
        }

        fetch(`${OMDB_URL}?apikey=${apiKey}&i=${movie.imdb_id}&tomatoes=true`)
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                const rtRating = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
                const critics = rtRating?.Value?.replace('%', '');
                const audience = data.tomatoUserMeter;

                cache[cacheKey] = { critics, audience };
                
                const ratingsBlock = e.body.querySelector('.info__rate, .full--rating');
                if (ratingsBlock) {
                    addRTRatings(ratingsBlock, critics, audience);
                }
            })
            .catch(() => Lampa.Noty.show('Ошибка загрузки рейтингов RT'));
    });

    // Инициализация при загрузке
    if (window.appready) {
        updateTmdbVisibility();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') updateTmdbVisibility();
        });
    }

})();
