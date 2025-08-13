(function () {
    'use strict';

    // Локализация
    Lampa.Lang.add({
        time_display_plugin_name: {
            ru: 'Отображение времени',
            en: 'Time display',
            uk: 'Відображення часу'
        },
        time_display_about_plugin: {
            ru: 'О плагине',
            en: 'About plugin',
            uk: 'Про плагін'
        },
        time_display_show_time: {
            ru: 'Показывать продолжительность',
            en: 'Show duration',
            uk: 'Показувати тривалість'
        },
        time_display_show_time_desc: {
            ru: 'Отображать приблизительное время серий и продолжительность фильмов',
            en: 'Display approximate episode time and movie duration',
            uk: 'Відображати приблизний час серій та тривалість фільмів'
        }
    });

    // Настройки по умолчанию
    var settings = {
        show_time: Lampa.Storage.get('time_display_show_time', true)
    };

    // Функция для добавления отображения времени
    function changeTimeDisplay() {
        // Стили для времени
        var styleTag = $('<style id="time_display_styles"></style>').html(`
            .time-display-label {
                position: absolute!important;
                right: 0.3em!important;
                bottom: 0.3em!important;
                background: rgba(0,0,0,0.5)!important;
                color: #ff5555!important;
                font-size: 1.3em!important;
                padding: 0.2em 0.5em!important;
                -webkit-border-radius: 1em!important;
                -moz-border-radius: 1em!important;
                border-radius: 1em!important;
                font-weight: 700;
                z-index: 10!important;
            }
            /* Скрываем встроенный лейбл времени, если включена наша функция */
            body[data-time-display="on"] .card__time {
                display: none!important;
            }
        `);
        $('head').append(styleTag);

        // Устанавливаем атрибут для body
        if (settings.show_time) {
            $('body').attr('data-time-display', 'on');
        } else {
            $('body').attr('data-time-display', 'off');
        }

        // Функция для добавления времени к карточке
        function addTimeToCard(card) {
            if (!settings.show_time) return;
            
            var $card = $(card);
            var $view = $card.find('.card__view');
            if (!$view.length || $card.find('.time-display-label').length) return;
            
            var $timeElement = $card.find('.card__time');
            if (!$timeElement.length) return;
            
            var timeText = $timeElement.text().trim();
            if (!timeText) return;
            
            // Проверяем, является ли это сериалом
            var isTvShow = $card.hasClass('card--tv') || 
                          $card.find('.card__type').text().trim() === 'TV' || 
                          $card.find('.card__number').length > 0;
            
            // Форматируем текст в зависимости от типа контента
            var displayText = isTvShow ? '~' + timeText : timeText;
            
            var label = $('<div class="time-display-label"></div>').text(displayText);
            $view.append(label);
        }

        // Обновление времени при изменении данных карточки
        function updateCardTime(card) {
            if (!settings.show_time) return;
            $(card).find('.time-display-label').remove();
            addTimeToCard(card);
        }

        // Обработка всех карточек
        function processAllCards() {
            if (!settings.show_time) return;
            $('.card').each(function() {
                addTimeToCard(this);
            });
        }

        // Слушатель для карточек в детальном представлении
        Lampa.Listener.follow('full', function(data) {
            if (data.type === 'complite' && data.data.movie) {
                var movie = data.data.movie;
                var posterContainer = $(data.object.activity.render()).find('.full-start__poster');
                
                if (posterContainer.length && movie && settings.show_time) {
                    var existingLabel = posterContainer.find('.time-display-label');
                    if (existingLabel.length) {
                        existingLabel.remove();
                    }
                    
                    var runtime = movie.runtime || 0;
                    if (runtime > 0) {
                        var hours = Math.floor(runtime / 60);
                        var minutes = runtime % 60;
                        var timeText = hours > 0 ? hours + 'ч ' + minutes + 'м' : minutes + 'м';
                        
                        var isTvShow = movie.number_of_seasons > 0 || movie.seasons || movie.season_count > 0;
                        var displayText = isTvShow ? '~' + timeText : timeText;
                        
                        var label = $('<div class="time-display-label"></div>').text(displayText);
                        posterContainer.css('position', 'relative');
                        posterContainer.append(label);
                    }
                }
            }
        });

        // MutationObserver для новых карточек и изменений
        var observer = new MutationObserver(function(mutations) {
            var needCheck = false;
            var cardsToUpdate = new Set();
            
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        var node = mutation.addedNodes[i];
                        if ($(node).hasClass('card')) {
                            cardsToUpdate.add(node);
                            needCheck = true;
                        } else if ($(node).find('.card').length) {
                            $(node).find('.card').each(function() {
                                cardsToUpdate.add(this);
                            });
                            needCheck = true;
                        }
                    }
                }
                
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'class' || 
                     mutation.attributeName === 'data-card' || 
                     mutation.attributeName === 'data-type')) {
                    var targetNode = mutation.target;
                    if ($(targetNode).hasClass('card')) {
                        cardsToUpdate.add(targetNode);
                        needCheck = true;
                    }
                }
            });
            
            if (needCheck) {
                setTimeout(function() {
                    cardsToUpdate.forEach(function(card) {
                        updateCardTime(card);
                    });
                }, 100);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-card', 'data-type']
        });
        
        processAllCards();
    }

    // Добавление настройки в меню Lampa
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'time_display',
            name: Lampa.Lang.translate('time_display_plugin_name'),
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="currentColor"/><path d="M13 7h-2v6h6v-2h-4V7z" fill="currentColor"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'time_display',
            param: {
                name: 'time_display_show_time',
                type: 'switch',
                title: Lampa.Lang.translate('time_display_show_time'),
                description: Lampa.Lang.translate('time_display_show_time_desc'),
                value: settings.show_time
            },
            onChange: function(value) {
                settings.show_time = value;
                Lampa.Storage.set('time_display_show_time', value);
                $('body').attr('data-time-display', value ? 'on' : 'off');
                $('.time-display-label').remove();
                if (value) {
                    $('.card').each(function() {
                        addTimeToCard(this);
                    });
                }
            },
            onRender: function(item) {
                Lampa.Template.add('time_display_about', `
                    <div class="selector__button" data-action="about">
                        <div class="selector__icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg></div>
                        <div class="selector__title">${Lampa.Lang.translate('time_display_about_plugin')}</div>
                    </div>
                `, {
                    about: function() {
                        Lampa.Noty.show({
                            title: Lampa.Lang.translate('time_display_plugin_name'),
                            text: Lampa.Lang.translate('time_display_show_time_desc'),
                            time: 10000
                        });
                    }
                });
                
                item.find('[data-component="time_display"] .settings-param__body').after($('<div class="settings-param__body"></div>').html(Lampa.Template.get('time_display_about')));
            }
        });
        
        // Перемещаем пункт настроек после раздела "Интерфейс"
        function moveSettingsFolder() {
            var $folders = $('.settings-folder');
            var $interface = $folders.filter(function() {
                return $(this).data('component') === 'interface';
            });
            var $timeDisplay = $folders.filter(function() {
                return $(this).data('component') === 'time_display';
            });
            
            if ($interface.length && $timeDisplay.length) {
                if ($timeDisplay.prev()[0] !== $interface[0]) {
                    $timeDisplay.insertAfter($interface);
                }
            }
        }
        
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                moveSettingsFolder();
            }
        });
    }

    // Инициализация плагина
    function init() {
        addSettings();
        changeTimeDisplay();
    }

    // Запуск плагина после загрузки Lampa
    if (window.Lampa && Lampa.SettingsApi) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }
})();
