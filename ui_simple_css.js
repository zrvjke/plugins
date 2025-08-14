/*
 * UI Simple CSS Plugin for Lampa
 *
 * Этот мини‑плагин изменяет интерфейс карточек фильмов/сериалов
 * без вмешательства в DOM или событий. Он:
 *   • скрывает блоки качества (4K, 1080p и т.п.);
 *   • скрывает раздел комментариев, если он присутствует;
 *   • добавляет полупрозрачный фон жанрам, отрисованным
 *     в деталях карточки (список жанров, страна, год).  
 *
 * Плагин добавляет только CSS‑стили, поэтому он не вызывает
 * зависаний и совместим практически с любой версией Lampa.
 */
(function(){
    'use strict';
    // Проверяем наличие Lampa
    if (!window.Lampa) return;
    // Предотвращаем повторную инициализацию
    if (window.uiSimpleCssPluginLoaded) return;
    window.uiSimpleCssPluginLoaded = true;

    // Создаем элемент стилей
    var style = document.createElement('style');
    style.setAttribute('id', 'ui-simple-css-style');
    style.textContent = `
    /* Скрываем блоки «качество» и комментарии */
    .full-start__quality, .full-start-new__quality, .badge-quality,
    .full-start__comments, .full-start-new__comments,
    .comments, .comments--container, #comments {
        display: none !important;
    }

    /* Делаем жанры полупрозрачными «пилюлями». В разных версиях
       Lampa жанры могут быть <a> или <span> внутри блоков
       подробной информации (info/details). Мы задаем общий
       стиль, который добавляет фон, отступы и скругления. */
    .full-start__info a, .full-start__info span,
    .full-start__details a, .full-start__details span,
    .full-start-new__info a, .full-start-new__info span,
    .full-start-new__details a, .full-start-new__details span,
    .new-interface-info__details a, .new-interface-info__details span {
        background: rgba(0, 0, 0, 0.4);
        padding: 0.22em 0.55em;
        border-radius: 0.4em;
        margin-right: 0.45em;
        margin-top: 0.25em;
        display: inline-block;
        line-height: 1;
    }

    /* Убираем пустые элементы, чтобы не было лишних отступов */
    .full-start__info a:empty, .full-start__info span:empty,
    .full-start__details a:empty, .full-start__details span:empty,
    .full-start-new__info a:empty, .full-start-new__info span:empty,
    .full-start-new__details a:empty, .full-start-new__details span:empty,
    .new-interface-info__details a:empty, .new-interface-info__details span:empty {
        display: none !important;
    }

    @media (max-width: 600px) {
        /* На небольших экранах уменьшите размер шрифта и отступы */
        .full-start__info a, .full-start__info span,
        .full-start__details a, .full-start__details span,
        .full-start-new__info a, .full-start-new__info span,
        .full-start-new__details a, .full-start-new__details span,
        .new-interface-info__details a, .new-interface-info__details span {
            font-size: 0.92em;
            padding: 0.18em 0.45em;
            margin-top: 0.2em;
        }
    }

    @media (min-width: 1200px) {
        /* На больших экранах немного увеличиваем шрифт */
        .full-start__info a, .full-start__info span,
        .full-start__details a, .full-start__details span,
        .full-start-new__info a, .full-start-new__info span,
        .full-start-new__details a, .full-start-new__details span,
        .new-interface-info__details a, .new-interface-info__details span {
            font-size: 1.08em;
        }
    }
    `;

    // Добавляем стили на страницу
    document.head.appendChild(style);

    console.log('[ui-simple-css] loaded');
})();