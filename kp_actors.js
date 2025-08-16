/**
 * Lampa plugin: KP Cast via TMDB External IDs (v2.0.0)
 * Автор: Рома + твоя девочка :)
 *
 * Что делает:
 *  - На экране карточки берёт точный TMDB id и тип (movie/tv).
 *  - Через Lampa.TMDB.api запрашивает /external_ids → imdb_id.
 *  - По imdb_id:
 *      1) api.kinopoisk.dev → kpId + persons
 *      2) если kpId есть → kinopoiskapiunofficial.tech /v1/staff (предпочтительно)
 *      3) если kpId нет → берём persons из DEV
 *  - Подменяет секцию «Актёры» аккуратно, не ломая скролл.
 */

(function () {
  'use strict';

  /*** КЛЮЧИ И НАСТРОЙКИ ***/
  var KPU_API_KEY = 'dc9196ea-4cc8-48e8-8259-0cbdfa58eaf1'; // kinopoiskapiunofficial.tech
  var DEV_API_KEY = 'KS9Z0SJ-5WCMSN8-MA3VHZK-V1ZFH4G';       // api.kinopoisk.dev
  var MAX_ACTORS  = 24;
  var CACHE_TTL   = 7 * 24 * 3600e3;                         // 7 дней
  var DEBUG       = true;                                    // всплывашки

  var KPU_BASE = 'https://kinopoiskapiunofficial.tech';
  var DEV_BASE = 'https://api.kinopoisk.dev';

  /*** Утилиты ***/
  function txt(n){ return (n && (n.textContent||n.innerText)||'').replace(/\u00A0/g,' ').trim(); }
  function norm(s){ return (s||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function rm(n){ if(n&&n.parentNode) n.parentNode.removeChild(n); }
  function noty(m){ try{ if(DEBUG && window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(m);}catch(e){} }
  function uniq(a){ var u=[],i; for(i=0;i<a.length;i++) if(a[i] && u.indexOf(a[i])<0) u.push(a[i]); return u; }

  function fetchJSON(url, headers){
    return new Promise(function(resolve,reject){
      function done(ok,data,status){ ok?resolve({ok:true,data:data,status:status}):reject({ok:false,error:data,status:status}); }
      if (typeof fetch==='function'){
        fetch(url,{headers:headers||{'accept':'application/json'}})
          .then(function(r){ var s=r.status; if(!r.ok) return r.text().then(function(t){done(false,t||('HTTP '+s),s)}); return r.json().then(function(j){done(true,j,s)}); })
          .catch(function(e){ done(false, e && (e.message||String(e)) || 'network', 0); });
      } else {
        var x=new XMLHttpRequest(); x.open('GET',url,true);
        if(headers) for(var k in headers){ try{x.setRequestHeader(k,headers[k]);}catch(e){} }
        x.onreadystatechange=function(){ if(x.readyState===4){ var s=x.status;
          if(s>=200&&s<300){ try{done(true,JSON.parse(x.responseText),s);}catch(e){done(false,'bad json',s);} }
          else done(false,'HTTP '+s,s);
        }};
        x.onerror=function(){ done(false,'network',0); };
        x.send();
      }
    });
  }

  // кэш
  function cget(key){
    try{ var raw=localStorage.getItem(key); if(!raw) return null;
      var obj=JSON.parse(raw); if(!obj||!obj.t) return null;
      if(Date.now()-obj.t>CACHE_TTL){ localStorage.removeItem(key); return null; }
      return obj.v;
    }catch(e){ return null; }
  }
  function cset(key,val){ try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), v:val})); }catch(e){} }

  /*** Достаём текущий TMDB id и тип карточки ***/
  function getCurrentCard(){
    var method=null, id=null;
    try{
      if (window.Lampa && Lampa.Activity && typeof Lampa.Activity.active === 'function'){
        var act = Lampa.Activity.active();
        if (act && act.activity && act.activity.params){
          method = act.activity.params.method || act.activity.params.content_type || null; // 'movie' | 'tv'
          id     = act.activity.params.id || null;
        }
      }
    }catch(e){}
    // из URL-хэша (подстраховка)
    var h = String(location.hash||'');
    if (!id){
      var m1 = h.match(/[?&]id=(\d+)/); if (m1) id = m1[1];
    }
    if (!method){
      var m2 = h.match(/[?&]method=(movie|tv)/); if (m2) method = m2[1];
    }
    if (!method) method = 'movie'; // дефолт
    return { id: id, method: method };
  }

  /*** Поиск секции «Актёры» ***/
  var RE_ACTORS = /^(?:актёры|актеры|в ролях|actors?|cast)$/i;
  function findActorsSection(){
    var nodes=$$('h1,h2,h3,h4,h5,h6,div,span,p'), head=null, i,n,val;
    for(i=0;i<nodes.length;i++){ n=nodes[i]; val=norm(txt(n)); if(val && RE_ACTORS.test(val)){ head=n; break; } }
    var sec=null;
    if(head){
      var up=head,steps=0;
      while(up&&steps++<10){ if(up.parentElement&&(up.previousElementSibling||up.nextElementSibling)) break; up=up.parentElement; }
      sec=up||head;
    }
    if(!sec){
      var candidates=$$('.full-persons, .persons, .full-section, .full-start__persons, .full-start-new__persons');
      if(candidates.length) sec=candidates[0];
    }
    if(!sec){
      var full = $('.full, .full-start, .full-start-new') || document.body;
      var lists = $$('[class*="person"],[class*="persons"],[class*="people"],[class*="cast"],[class*="actors"]', full);
      var best=null, bestCount=0;
      for(i=0;i<lists.length;i++){
        var count = $$('img, a, div', lists[i]).length;
        if(count>bestCount){ best=lists[i]; bestCount=count; }
      }
      if(best) sec=best.closest('.full-section, .full-start__block, .full-start-new__block') || best.parentElement || best;
    }
    return sec;
  }

  /*** Маппинг актёров ***/
  function mapActorsFromKPU(staff){
    var OK = ['ACTOR','HIMSELF','HERSELF','SELF','VOICE','VOICE_MALE','VOICE_FEMALE'];
    return (staff||[]).filter(function(p){ return OK.indexOf((p.professionKey||'').toUpperCase())!==-1; })
      .map(function(p){ return { name: p.nameRu||p.nameEn||'Без имени', role: p.description||'', img: p.posterUrl||'' }; });
  }
  function mapActorsFromDEV(persons){
    return (persons||[]).filter(function(p){
      var prof=((p.profession||'')+' '+(p.enProfession||'')).toLowerCase();
      return /actor|акт|voice/.test(prof);
    }).map(function(p){
      return { name:p.name||p.enName||p.alternativeName||'Без имени', role:p.description||p.character||'', img:p.photo||'' };
    });
  }

  /*** Рендер ***/
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function gridHTML(list){
    list=(list||[]).slice(0,MAX_ACTORS); if(!list.length) return '';
    var h='<div class="kp-actors-grid">'; for(var i=0;i<list.length;i++){ var p=list[i];
      h+='<div class="kp-actor">'+
           (p.img?'<img class="kp-actor__img" loading="lazy" src="'+escapeHtml(p.img)+'" alt="'+escapeHtml(p.name)+'">':'<div class="kp-actor__img" style="background:#2d2d2d;"></div>')+
           '<div class="kp-actor__name">'+escapeHtml(p.name)+'</div>'+
           (p.role?'<div class="kp-actor__role">'+escapeHtml(p.role)+'</div>':'')+
         '</div>';
    } return h+'</div>';
  }
  function injectCssOnce(){
    if($('#kp-cast-css')) return;
    var s=document.createElement('style'); s.id='kp-cast-css'; s.type='text/css';
    s.textContent='.kp-actors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:12px;margin-top:8px}'
                 +'.kp-actor{display:flex;flex-direction:column;align-items:center;text-align:center}'
                 +'.kp-actor__img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px}'
                 +'.kp-actor__name{margin-top:6px;font-size:13px;line-height:1.25;font-weight:600}'
                 +'.kp-actor__role{margin-top:2px;font-size:12px;opacity:.7}'
                 +'.kp-cast-badge{font-size:11px;opacity:.65;margin-left:6px}';
    document.head.appendChild(s);
  }
  function replaceActorsSection(mapped, badge){
    var sec=findActorsSection(); if(!sec){ noty('KP: не нашла секцию «Актёры»'); return false; }
    if(!mapped || !mapped.length){ noty('KP: пустой список актёров'); return false; }

    var toHide=$$('[class*="person"],[class*="actors"],[class*="cast"],[class*="cards"],[class*="list"],[class*="scroll"]', sec);
    uniq(toHide).forEach(function(el){ el.style.display='none'; });

    var head = $$('h1,h2,h3,h4,h5,h6,div,span,p', sec).find(function(el){ return RE_ACTORS.test(norm(txt(el)))||/actors|cast/i.test(el.className||''); });
    if(head && !$('.kp-cast-badge', head)){
      var b=document.createElement('span'); b.className='kp-cast-badge'; b.textContent='('+ (badge||'Кинопоиск') +')'; head.appendChild(b);
    }
    var old = $('.kp-actors-grid', sec); if(old) rm(old);

    var wrap=document.createElement('div'); wrap.innerHTML=gridHTML(mapped);
    var grid=wrap.firstChild; if(grid) sec.appendChild(grid);

    try{
      if(window.Lampa){ if(Lampa.Controller && Lampa.Controller.update) Lampa.Controller.update(); if(Lampa.Scroll && Lampa.Scroll.update) Lampa.Scroll.update(); }
      void document.body.offsetHeight; window.dispatchEvent(new Event('resize'));
    }catch(e){}

    noty('Вставила '+mapped.length+' актёров ('+badge+')');
    return true;
  }

  /*** API ***/
  // KPU
  function kpu_staff(kpId){
    var url = KPU_BASE + '/api/v1/staff?filmId='+encodeURIComponent(kpId);
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':KPU_API_KEY});
  }
  // DEV
  function dev_byImdb(imdb){
    var url = DEV_BASE + '/v1.4/movie?externalId.imdb='+encodeURIComponent(imdb)
            + '&limit=1&selectFields=id&selectFields=kpId&selectFields=persons';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }
  function dev_full(id){
    var url = DEV_BASE + '/v1.4/movie/'+encodeURIComponent(id)+'?selectFields=persons&selectFields=id&selectFields=kpId';
    return fetchJSON(url, {'accept':'application/json','X-API-KEY':DEV_API_KEY});
  }

  /*** Главная логика: получаю imdb_id из TMDB, дальше KP ***/
  function runOnce(){
    injectCssOnce();

    // 1) id+method карточки
    var card = getCurrentCard();
    if (!card.id){
      noty('KP: не смогла определить TMDB id');
      return;
    }
    noty('TMDB: '+card.method+' #'+card.id);

    // 2) imdb через встроенный прокси Лампы
    if (!window.Lampa || !Lampa.TMDB || typeof Lampa.TMDB.api !== 'function'){
      noty('KP: нет Lampa.TMDB.api — не смогу взять imdb_id');
      return;
    }

    Lampa.TMDB.api(card.method + '/' + card.id + '/external_ids', {}, function(json){
      var imdb = json && (json.imdb_id || json.imdbId);
      if (!imdb){
        noty('TMDB: imdb_id не найден');
        return;
      }
      noty('IMDb: ' + imdb);

      // 3) DEV → kpId + persons
      dev_byImdb(imdb).then(function(r){
        if (!r.ok) throw r;
        var doc = r.data && r.data.docs && r.data.docs[0];
        var kpId = doc && (doc.kpId || doc.id);
        var devPersons = mapActorsFromDEV(doc && doc.persons || []);

        if (kpId){
          // 3a) staff по kpId (предпочтительно)
          return kpu_staff(kpId).then(function(rr){
            if (rr.ok){
              var mapped = mapActorsFromKPU(rr.data || []);
              if (mapped.length){
                replaceActorsSection(mapped, 'KP Unofficial');
                return;
              }
            }
            // 3b) fallback: DEV persons
            if (devPersons.length){
              replaceActorsSection(devPersons, 'Кинопоиск DEV');
              return;
            }
            noty('KP: не нашла актёров — TMDb остаётся');
          });
        } else {
          // kpId нет — используем DEV persons, если есть
          if (devPersons.length){
            replaceActorsSection(devPersons, 'Кинопоиск DEV');
            return;
          }
          // иногда DEV по imdb не присылает persons в списочном методе — добиваем full
          if (doc && (doc.id || doc.kpId)){
            return dev_full(doc.id || doc.kpId).then(function(fr){
              if (!fr.ok) throw fr;
              var mapped2 = mapActorsFromDEV(fr.data && fr.data.persons || []);
              if (mapped2.length){
                replaceActorsSection(mapped2, 'Кинопоиск DEV');
              } else {
                noty('KP: не нашла актёров — TMDb остаётся');
              }
            });
          } else {
            noty('KP: не нашла актёров — TMDb остаётся');
          }
        }
      }).catch(function(err){
        noty('DEV ошибка: ' + (err && (err.status||err.error||'')));
      });

    }, function(){
      noty('TMDB: external_ids ошибка');
    });
  }

  /*** Инициализация ***/
  function onFull(e){
    if(!e||!e.type) return;
    if(e.type==='build'||e.type==='open'||e.type==='complite'){ setTimeout(runOnce, 200); }
  }
  function subscribe(){
    if(typeof window==='undefined'||typeof window.Lampa==='undefined'||!window.Lampa.Listener) return false;
    window.Lampa.Listener.follow('full', onFull);
    setTimeout(runOnce, 500); // если карточка уже открыта
    return true;
  }
  (function wait(i){ i=i||0; if(subscribe()) return; if(i<200) setTimeout(function(){wait(i+1)},200); else setTimeout(runOnce,700); })();

})();
