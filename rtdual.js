(function(){
    'use strict';

    // ====== НАСТРОЙКИ ======
    var OMDB_API_KEY = '63684232'; // <-- API ключ
    var OMDB_URL = 'https://www.omdbapi.com/';

    // ====== ИКОНКИ ======
    var ICON_CRITICS = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/tomatometer/tomatometer.svg';
    var ICON_AUDIENCE = 'https://www.rottentomatoes.com/assets/pizza-pie/images/icons/audience/audience.svg';

    // ====== ПОЛУЧЕНИЕ РЕЙТИНГОВ ======
    async function fetchRatings(imdb_id){
        if(!imdb_id) return null;
        try{
            let url = `${OMDB_URL}?apikey=${OMDB_API_KEY}&i=${imdb_id}`;
            let res = await fetch(url);
            let data = await res.json();

            if(!data || data.Response === 'False') return null;

            let critics = null;
            let audience = null;

            if(data.Ratings && Array.isArray(data.Ratings)){
                let rt = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
                if(rt) critics = rt.Value;
            }

            // Audience Score вытаскиваем со страницы Rotten Tomatoes
            if(data.Website && /rottentomatoes\.com/.test(data.Website)){
                try{
                    let page = await fetch(data.Website);
                    let html = await page.text();
                    let match = html.match(/Audience Score[^0-9]*([0-9]{1,3})%/i);
                    if(match) audience = match[1] + '%';
                }catch(e){}
            }

            return {critics, audience};
        }catch(e){
            return null;
        }
    }

    // ====== ДОБАВЛЕНИЕ В ИНТЕРФЕЙС ======
    function addRatingsToUI(ratings){
        if(!ratings) return;

        let container = document.querySelector('.full--rating');
        if(!container) return;

        let html = '';

        if(ratings.critics){
            html += `<div class="rating"><div class="source"><img src="${ICON_CRITICS}" style="width:16px;vertical-align:middle;margin-right:4px;">Критики</div><div class="value">${ratings.critics}</div></div>`;
        }

        if(ratings.audience){
            html += `<div class="rating"><div class="source"><img src="${ICON_AUDIENCE}" style="width:16px;vertical-align:middle;margin-right:4px;">Зрители</div><div class="value">${ratings.audience}</div></div>`;
        }

        container.insertAdjacentHTML('beforeend', html);
    }

    // ====== ОСНОВНОЙ СЛУШАТЕЛЬ ======
    Lampa.Listener.follow('full', function(e){
        if(e.type !== 'complite') return;

        let card = e.data.movie || e.data.tv || e.data || {};
        if(!card.imdb_id) return;

        fetchRatings(card.imdb_id).then(ratings => {
            addRatingsToUI(ratings);
        });
    });

})();
