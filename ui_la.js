(function () {
    'use strict';

    // Prevent re-initialization
    if (window.__lampa_ui_tweaks_initialized__) return;
    window.__lampa_ui_tweaks_initialized__ = true;

    // Configuration
    const config = {
        DEBUG: false,
        BG: 'rgba(0,0,0,0.35)',
        RAD: '12px',
        SELECTORS: {
            GENRES: '.full-genres,.details__genres,.film__genres,.full__genres,.card__genres,.tags--genres,.tag-list.genres,.genres,[data-block="genres"]',
            COMMENTS: '.comments,.full-comments,.panel-comments,.tabs__content.comments,.comments-block,#comments,[data-block="comments"]',
            TABTITLES: '.tabs__head .tabs__title,.tabs__head .tabs__button,.tabs__title,.tab__title,.tab-button',
            QUALITY: '.card [class*="quality"],.card [data-quality],.full [class*="quality"],.full [data-quality],.video [class*="quality"],.video [data-quality]'
        }
    };

    // Logging utility
    function log(...args) {
        if (config.DEBUG) console.log('[UI-Tweaks]', ...args);
    }

    // Inject CSS styles
    function injectCSS(css) {
        try {
            if (document.querySelector('style[data-ui-tweaks]')) return;
            const style = document.createElement('style');
            style.setAttribute('data-ui-tweaks', 'true');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        } catch (e) {
            log('injectCSS error', e);
        }
    }

    // Hide quality indicators
    function hideQuality() {
        try {
            document.querySelectorAll(config.SELECTORS.QUALITY).forEach(el => {
                const cls = `${el.className || ''} ${el.parentNode?.className || ''}`;
                if (/progress|timeline|evolution|meter/i.test(cls)) return;
                el.style.setProperty('display', 'none', 'important');
                el.setAttribute('aria-hidden', 'true');
            });
        } catch (e) {
            log('hideQuality error', e);
        }
    }

    // Remove comments and related tab titles
    function removeComments() {
        try {
            document.querySelectorAll(config.SELECTORS.TABTITLES).forEach(el => {
                const txt = (el.textContent || '').toLowerCase();
                if (txt.includes('коммент') || txt.includes('comments')) {
                    el.style.setProperty('display', 'none', 'important');
                    el.setAttribute('aria-hidden', 'true');
                }
            });
            document.querySelectorAll(config.SELECTORS.COMMENTS).forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.setAttribute('aria-hidden', 'true');
            });
        } catch (e) {
            log('removeComments error', e);
        }
    }

    // Style genres with background
    function backdropGenres() {
        try {
            document.querySelectorAll(config.SELECTORS.GENRES).forEach(box => {
                if (!box || !box.parentNode || box.getAttribute('data-ui-bg') === '1') return;
                box.setAttribute('data-ui-bg', '1');

                const cs = window.getComputedStyle(box);
                const pos = `${box.style.position || ''} ${cs.position}`;
                if (!/relative|absolute|fixed/i.test(pos)) box.style.position = 'relative';

                if (!box.classList.contains('ui-genre-wrap')) {
                    box.classList.add('ui-genre-wrap');
                }

                const bg = document.createElement('div');
                bg.className = 'ui-genre-bg';
                Object.assign(bg.style, {
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    right: '0',
                    bottom: '0',
                    pointerEvents: 'none',
                    background: config.BG,
                    borderRadius: config.RAD,
                    zIndex: '0'
                });
                box.appendChild(bg);

                Array.from(box.children).forEach(child => {
                    if (child !== bg && child.style) {
                        if (!child.style.position) child.style.position = 'relative';
                        child.style.zIndex = '1';
                    }
                });
            });
        } catch (e) {
            log('backdropGenres error', e);
        }
    }

    // Debounce utility
    function debounce(fn, ms) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    }

    // Refresh all tweaks
    function refresh() {
        hideQuality();
        removeComments();
        backdropGenres();
    }

    // Schedule refresh with debounce
    const schedule = debounce(refresh, 60);

    // Observe DOM changes
    function observe() {
        try {
            if (typeof MutationObserver === 'undefined') {
                setInterval(schedule, 200);
                return;
            }
            const mo = new MutationObserver(schedule);
            mo.observe(document.body, { childList: true, subtree: true });
        } catch (e) {
            log('observe error', e);
            setInterval(schedule, 200);
        }
    }

    // Execute when DOM is ready
    function ready(fn) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(fn, 0);
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    // Initialize
    ready(() => {
        try {
            const CSS = `
                ${config.SELECTORS.QUALITY} { display: none !important; }
                ${config.SELECTORS.COMMENTS} { display: none !important; }
                .ui-genre-wrap { position: relative !important; }
                .ui-genre-bg { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; border-radius: ${config.RAD}; background: ${config.BG}; z-index: 0; }
                .ui-genre-wrap > *:not(.ui-genre-bg) { position: relative; z-index: 1; }
                .ui-genre-wrap, .ui-genre-wrap ul, .ui-genre-wrap li { list-style: none !important; padding-left: 0 !important; margin-left: 0 !important; }
                .ui-genre-wrap a::before, .ui-genre-wrap span::before, .ui-genre-wrap li::before { content: none !important; }
            `;
            injectCSS(CSS);
            refresh();
            observe();
            window.__lampa_ui_tweaks__ = {
                version: '1.4.5-min',
                refresh,
                debug: (v) => {
                    config.DEBUG = !!v;
                    log('debug', config.DEBUG);
                }
            };
        } catch (e) {
            log('init error', e);
        }
    });
})();
