(function(){
    'use strict';

    var plugin_name = 'Rotten Tomatoes (OMDb Dual)';
    var storage_key_api = 'rt_omdb_api_key';
    var storage_key_disable_tmdb = 'rt_disable_tmdb';

    function add_settings(){
        Lampa.SettingsApi.addComponent({
            component: plugin_name,
            name: plugin_name,
            icon: '🍅',
            onRender: function(body){
                body.append(Lampa.Template.get('settings_input', {
                    title: 'OMDb API Key',
                    value: Lampa.Storage.get(storage_key_api, ''),
                    placeholder: 'Введите API ключ OMDb'
                }, function(value){
                    Lampa.Storage.set(storage_key_api, value);
                }));

                body.append(Lampa.Template.get('settings_chbox', {
                    title: 'Отключить рейтинг TMDB',
                    checked: Lampa.Storage.get(storage_key_disable_tmdb, false)
                }, function(value){
                    Lampa.Storage.set(storage_key_disable_tmdb, value);
                }));
            },
            onBack: function(){
                Lampa.SettingsApi.closeComponent();
            }
        });
    }

    function fetch_ratings(imdb_id, callback){
        var api_key = Lampa.Storage.get(storage_key_api, '');
        if(!api_key){
            callback();
            return;
        }
        var url = 'https://www.omdbapi.com/?i=' + imdb_id + '&apikey=' + api_key;
        Lampa.Utils.request(url, function(json){
            if(json && json.Ratings){
                var critics = null, audience = null;
                json.Ratings.forEach(function(r){
                    if(r.Source === 'Rotten Tomatoes'){
                        critics = r.Value;
                    }
                    if(r.Source === 'Rotten Tomatoes - Audience'){
                        audience = r.Value;
                    }
                });
                callback({critics: critics, audience: audience});
            }
            else callback();
        }, callback);
    }

    function add_ratings_to_card(ratings){
        var rate_line = $('.card__rate');
        if(ratings.critics){
            rate_line.append('<div class="rate-item"><img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg" style="width:14px;vertical-align:middle;"> '+ratings.critics+'</div>');
        }
        if(ratings.audience){
            rate_line.append('<div class="rate-item"><img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Popcorn.svg" style="width:14px;vertical-align:middle;"> '+ratings.audience+'</div>');
        }
    }

    function hook_movie_detail(){
        Lampa.Listener.follow('full', function(e){
            if(e.type === 'complite'){
                var imdb_id = e.data.imdb_id;
                if(!imdb_id) return;

                if(Lampa.Storage.get(storage_key_disable_tmdb, false)){
                    $('.rate__item').filter(function(){
                        return $(this).find('.rate__source').text().trim() === 'TMDb';
                    }).remove();
                }

                fetch_ratings(imdb_id, function(ratings){
                    if(ratings) add_ratings_to_card(ratings);
                });
            }
        });
    }

    function start(){
        add_settings();
        hook_movie_detail();
    }

    Lampa.PluginApi.add(plugin_name, start, '🍅');

})();
