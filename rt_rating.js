(function () {
    'use strict';

    // Полифилл для старых браузеров
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function(searchString, position) {
            position = position || 0;
            return this.indexOf(searchString, position) === position;
        };
    }

    // Локализация (ru, en, uk)
    Lampa.Lang.add({
        ui_tweaks_plugin_name: {
            ru: 'UI Твики',
            en: 'UI Tweaks',
            uk: 'UI Твіки'
        },
        ui_tweaks_hide_quality: {
            ru: 'Скрывать качество',
            en: 'Hide quality',
            uk: 'Приховувати якість'
        },
        ui_tweaks_hide_quality_desc: {
            ru: 'Скрывать индикаторы качества в карточках',
            en: 'Hide quality indicators in cards',
            uk: 'Приховувати індикатори якості в картках'
        },
        ui_tweaks_genres_backdrop: {
            ru: 'Фон под жанрами',
            en: 'Backdrop for genres',
            uk: 'Фон під жанрами'
        },
        ui_tweaks_genres_backdrop_desc: {
            ru: 'Добавлять полупрозрачный фон под жанрами',
            en: 'Add semi-transparent backdrop under genres',
            uk: 'Додавати напівпрозорий фон під жанрами'
        },
        ui_tweaks_hide_comments: {
            ru: 'Скрывать комментарии',
            en: 'Hide comments',
            uk: 'Приховувати коментарі'
        },
        ui_tweaks_hide_comments_desc: {
            ru: 'Удалять блок комментариев и вкладки',
            en: 'Remove comments block and tabs',
            uk: 'Видаляти блок коментарів та вкладки'
        }
    });

    // Константы
    var S_QUALITY = '.card [class*="quality"],.card [data-quality],.full [class*="quality"],.full [data-quality],.video [class*="quality"],.video [data-quality]';
    var S_GENRES = '.full-genres,.details__genres,.film__genres,.full__genres,.card__genres,.tags--genres,.tag-list.genres,.genres,[data-block="genres"]';
    var S_COMMENTS = '.comments,.full-comments,.panel-comments,.tabs__content.comments,.comments-block,#comments,[data-block="comments"]';
    var S_TABTITLES = '.tabs__head .tabs__title,.tabs__head .tabs__button,.tabs__title,.tab__title,.tab-button';
    var BG = 'rgba(0,0,0,0.35)';
    var RAD = '12px';

    // Настройки по умолчанию
    var settings = {
        hide_quality: Lampa.Storage.get('ui_tweaks_hide_quality', true),
        genres_backdrop: Lampa.Storage.get('ui_tweaks_genres_backdrop', true),
        hide_comments: Lampa.Storage.get('ui_tweaks_hide_comments', true)
    };

    // Функция для инъекции CSS
    function injectCSS(css) {
        var style = document.createElement('style');
        style.textContent = css;
        style.id = 'ui_tweaks_css';
        if (document.querySelector('#ui_tweaks_css')) return;
        (document.head || document.documentElement).appendChild(style);
    }

    // Скрытие качества
    function hideQuality() {
        if (!settings.hide_quality) return;
        try {
            document.querySelectorAll(S_QUALITY).forEach(function(el) {
                var cls = `${el.className || ''} ${el.parentNode ? el.parentNode.className || '' : ''}`;
                if (/progress|timeline|evolution|meter/i.test(cls)) return;
                el.style.display = 'none';
                el.setAttribute('aria-hidden', 'true');
            });
        } catch (e) {
            console.log('UI Tweaks: hideQuality error', e);
        }
    }

    // Скрытие комментариев
    function removeComments() {
        if (!settings.hide_comments) return;
        try {
            // Скрываем вкладки комментариев
            document.querySelectorAll(S_TABTITLES).forEach(function(el) {
                var txt = (el.textContent || '').toLowerCase();
                if (txt.includes('коммент') || txt.includes('comments')) {
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                }
            });
            // Скрываем блоки комментариев
            document.querySelectorAll(S_COMMENTS).forEach(function(el) {
                el.style.display = 'none';
                el.setAttribute('aria-hidden', 'true');
            });
        } catch (e) {
            console.log('UI Tweaks: removeComments error', e);
        }
    }

    // Добавление фона под жанры
    function backdropGenres() {
        if (!settings.genres_backdrop) return;
        try {
            document.querySelectorAll(S_GENRES).forEach(function(box) {
                if (!box || !box.parentNode || box.getAttribute('data-ui-bg') === '1') return;
                box.setAttribute('data-ui-bg', '1');
                var cs = window.getComputedStyle(box);
                var pos = `${box.style.position || ''} ${cs.position}`;
                if (!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';
                if (!box.classList.contains('ui-genre-wrap')) box.classList.add('ui-genre-wrap');
                var bg = document.createElement('div');
                bg.className = 'ui-genre-bg';
                Object.assign(bg.style, {
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    right: '0',
                    bottom: '0',
                    pointerEvents: 'none',
                    background: BG,
                    borderRadius: RAD,
                    zIndex: '0'
                });
                box.appendChild(bg);
                Array.from(box.children).forEach(function(child) {
                    if (child !== bg && child.style) {
                        if (!child.style.position) child.style.position = 'relative';
                        child.style.zIndex = '1';
                    }
                });
            });
        } catch (e) {
            console.log('UI Tweaks: backdropGenres error', e);
        }
    }

    // Обновление всех твиков
    function refreshTweaks() {
        hideQuality();
        removeComments();
        backdropGenres();
    }

    // Настройка наблюдателя DOM
    function setupObserver() {
        var observer = new MutationObserver(function() {
            setTimeout(refreshTweaks, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Добавление настроек в интерфейс
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'ui_tweaks',
            name: Lampa.Lang.translate('ui_tweaks_plugin_name'),
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5C4 4.44772 4.44772 4 5 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H5C4.44772 8 4 7.55228 4 7V5Z" fill="currentColor"/><path d="M4 11C4 10.4477 4.44772 10 5 10H19C19.5523 10 20 10.4477 20 11V13C20 13.5523 19.5523 14 19 14H5C4.44772 14 4 13.5523 4 13V11Z" fill="currentColor"/><path d="M4 17C4 16.4477 4.44772 16 5 16H19C19.5523 16 20 16.4477 20 17V19C20 19.5523 19.5523 20 19 20H5C4.44772 20 4 19.5523 4 19V17Z" fill="currentColor"/></svg>'
        });

        // Перемещаем пункт "UI Твики" после "Интерфейс"
        function moveTweaksSettingsFolder() {
            var $folders = $('.settings-folder');
            var $interface = $folders.filter(function() {
                return $(this).data('component') === 'interface';
            });
            var $tweaks = $folders.filter(function() {
                return $(this).data('component') === 'ui_tweaks';
            });
            if ($interface.length && $tweaks.length && $tweaks.prev()[0] !== $interface[0]) {
                $tweaks.insertAfter($interface);
            }
        }
        setTimeout(moveTweaksSettingsFolder, 100);

        // Добавляем параметры
        Lampa.SettingsApi.addParam({
            component: 'ui_tweaks',
            param: {
                name: 'ui_tweaks_hide_quality',
                type: 'trigger',
                default: true
            },
            field: {
                name: Lampa.Lang.translate('ui_tweaks_hide_quality'),
                description: Lampa.Lang.translate('ui_tweaks_hide_quality_desc')
            },
            onChange: function (value) {
                settings.hide_quality = value;
                Lampa.Storage.set('ui_tweaks_hide_quality', value);
                Lampa.Settings.update();
                refreshTweaks();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ui_tweaks',
            param: {
                name: 'ui_tweaks_genres_backdrop',
                type: 'trigger',
                default: true
            },
            field: {
                name: Lampa.Lang.translate('ui_tweaks_genres_backdrop'),
                description: Lampa.Lang.translate('ui_tweaks_genres_backdrop_desc')
            },
            onChange: function (value) {
                settings.genres_backdrop = value;
                Lampa.Storage.set('ui_tweaks_genres_backdrop', value);
                Lampa.Settings.update();
                refreshTweaks();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'ui_tweaks',
            param: {
                name: 'ui_tweaks_hide_comments',
                type: 'trigger',
                default: true
            },
            field: {
                name: Lampa.Lang.translate('ui_tweaks_hide_comments'),
                description: Lampa.Lang.translate('ui_tweaks_hide_comments_desc')
            },
            onChange: function (value) {
                settings.hide_comments = value;
                Lampa.Storage.set('ui_tweaks_hide_comments', value);
                Lampa.Settings.update();
                refreshTweaks();
            }
        });
    }

    // Инициализация CSS
    function initCSS() {
        injectCSS(`
            ${S_QUALITY} { display: none !important; }
            ${S_COMMENTS} { display: none !important; }
            .ui-genre-wrap { position: relative !important; }
            .ui-genre-bg { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; border-radius: ${RAD}; background: ${BG}; z-index: 0; }
            .ui-genre-wrap > *:not(.ui-genre-bg) { position: relative; z-index: 1; }
            .ui-genre-wrap, .ui-genre-wrap ul, .ui-genre-wrap li { list-style: none !important; padding-left: 0 !important; margin-left: 0 !important; }
            .ui-genre-wrap a::before, .ui-genre-wrap span::before, .ui-genre-wrap li::before { content: none !important; }
        `);
    }

    // Слушатель для полной карточки
    Lampa.Listener.follow('full', function (data) {
        if (data.type === 'complite') {
            setTimeout(refreshTweaks, 100);
        }
    });

    // Инициализация плагина
    function startPlugin() {
        addSettings();
        initCSS();
        setupObserver();
        refreshTweaks();

        // Регистрация плагина в манифесте
        Lampa.Manifest.plugins = {
            name: 'UI Твики',
            version: '1.0.0',
            description: 'Скрытие качества, комментариев и добавление фона под жанрами'
        };

        window.ui_tweaks = { settings: settings, refresh: refreshTweaks };
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
