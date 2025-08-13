(function () {
    'use strict';

    Lampa.Plugin.register({
        id: 'safe_runtime_display',
        name: 'Длительность (без кэша)',
        version: '1.0.3',
        description: 'Безопасный показ длительности без использования памяти',
        type: 'modify',
        params: [{
            id: 'color',
            type: 'select',
            name: 'Цвет текста',
            values: [
                { name: 'Красный', value: '#FF3333' },
                { name: 'Оранжевый', value: '#FF9933' },
                { name: 'Фиолетовый', value: '#AA66FF' }
            ],
            default: '#FF3333'
        }]
    });

    function calculateSafeAverage(runtimes) {
        if (!Array.isArray(runtimes)) return null;
        
        // Фильтруем некорректные значения
        const validTimes = runtimes.filter(t => 
            Number.isInteger(t) && t > 10 && t < 300
        );
        
        if (validTimes.length === 0) return null;
        
        // Округляем до 5 минут (115 → 115, 117 → 115)
        return Math.floor(validTimes.reduce((a, b) => a + b) / validTimes.length / 5) * 5;
    }

    Lampa.Listener.follow('full', function (e) {
        const color = Lampa.Params.get('safe_runtime_display_color', '#FF3333');
        
        // Удаляем старые теги, если есть
        document.querySelectorAll('.safe-runtime-tag').forEach(el => el.remove());

        if (e.type === 'tv') {
            const avg = calculateSafeAverage(e.data.movie.episode_run_time);
            if (!avg) return;

            const infoBlock = document.querySelector('.full--info, .full__info');
            if (infoBlock) {
                const tag = document.createElement('div');
                tag.className = 'safe-runtime-tag';
                tag.style.cssText = `
                    color: ${color};
                    margin: 4px 0;
                    font-size: 14px;
                `;
                tag.textContent = `Средняя серия: ~${avg} мин`;
                infoBlock.appendChild(tag);
            }
        }
        else if (e.type === 'movie') {
            document.querySelectorAll('.full--info .tag, .full__info .tag').forEach(tag => {
                if (/\d+\s*мин/.test(tag.textContent)) {
                    tag.style.color = color;
                }
            });
        }
    });
})();
