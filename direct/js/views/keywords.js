// Личная семантика книг: чтение и исследование; изменения рекламы — только через другие подтвержденные действия.
import { acts, forms, changes, esc, opt, toast, download, ask } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { call } from '../api.js';
import { normKey, keywordId, csvRows, plainPhrases, preparedKeywords, interestHint, intentLabel, exportList } from '../keywordcalc.js';
import {bookGenres, bookTags, marketingTopics} from '../../../writer/js/bookmeta.js';

const app=()=>window.__app;
const books=a=>a.ctx().data.w_books||[];
const chosen=a=>a.ui.kwBook||books(a).find(x=>x.title==='Развод для черной вдовы')?.id||books(a)[0]?.id||'';
const allFor=a=>(a.ctx().data.d_keywords||[]).filter(x=>String(x.bookId||'')===String(chosen(a)));
const campaigns=a=>(a.snap?.('main')?.campaigns||[]).filter(x=>x.state!=='ARCHIVED');
const activeBinding=a=>(a.ctx().data.d_kw_bindings||[]).find(x=>String(x.bookId)===String(chosen(a)));
const campaignId=a=>Number(activeBinding(a)?.campaignId)||null;
const campaignWords=a=>(a.snap?.('main')?.keywords||[]).filter(x=>Number(x.cid)===campaignId(a));
const campaignQueries=a=>(a.snap?.('stats')?.queries||[]).filter(x=>Number(x.cid)===campaignId(a)).sort((a,b)=>b.clicks-a.clicks||b.impr-a.impr);
const modeLabel = {all:'Все',review:'На проверку',keep:'В подборе',negative:'Минус-кандидаты',reject:'Исключены'};
const safeName = s=>String(s||'книга').slice(0,60).replace(/[^а-яa-z0-9_-]+/gi,'_');
const wordstatUrl='https://wordstat.yandex.ru/';
const statusButtons=x=>`<span class="kw-buttons">
  <button class="link ${x.status==='keep'?'kw-selected':''}" data-act="kw.status" data-id="${esc(x.id)}" data-state="keep">В подбор</button>
  <button class="link ${x.status==='negative'?'kw-selected':''}" data-act="kw.status" data-id="${esc(x.id)}" data-state="negative">В минус</button>
  <button class="link ${x.status==='reject'?'kw-selected':''}" data-act="kw.status" data-id="${esc(x.id)}" data-state="reject">Исключить</button>
  ${x.status!=='review'?`<button class="link" data-act="kw.status" data-id="${esc(x.id)}" data-state="review">Вернуть</button>`:''}
</span>`;
export function keywordsView(a){
  const b=books(a),selected=chosen(a),all=allFor(a);
  const filter=a.ui.kwFilter||'all',filtered=all.filter(x=>filter==='all'||x.status===filter)
    .sort((x,y)=> (x.status===y.status?0:(x.status==='keep'?-1:1)) || ((y.count??-1)-(x.count??-1)) || x.phrase.localeCompare(y.phrase,'ru'));
  const picked=all.filter(x=>x.status==='keep'),candidates=all.filter(x=>x.status==='negative');
  const book=b.find(x=>String(x.id)===String(selected));
  const seeds=[...bookGenres(book),...bookTags(book)];
  const seed=String(a.ui.kwPhrase||seeds[0]||'').trim();
  return {html:`
    <div class="card kw-head">
      <div class="row between"><h2 style="margin:0">Подбор ключевых слов</h2><a href="${wordstatUrl}" target="_blank" rel="noopener noreferrer">Открыть Вордстат</a></div>
      <label for="kwBook">Книга</label>
      <select id="kwBook" data-chg="kw.book">
        ${!b.length?'<option value="">Без книги</option>':b.map(x=>opt(x.id,x.title,selected)).join('')}
      </select>
      <div class="kw-stat-row"><span><b>${all.length}</b> фраз</span><span><b>${picked.length}</b> в подборе</span><span><b>${candidates.length}</b> на проверку в минус</span></div>
    </div>
    <div class="card kw-input">
      <div class="row between"><h2 style="margin:0">Связь с моей кампанией</h2><button class="link" data-act="go" data-to="/competitors">Изучать конкурентов →</button></div>
      <label for="kwCamp">Кампания из моего Яндекс Директа</label>
      <select id="kwCamp" data-chg="kw.campaign">
        <option value="">Пока не привязана</option>
        ${campaigns(a).map(x=>opt(String(x.id),x.name,String(campaignId(a)||''))).join('')}
      </select>
      ${!campaigns(a).length?'<p class="small muted">В твоем кабинете пока нет кампаний. Кампании таргетологов из другого кабинета недоступны — их данные здесь не появятся.</p>':
         !campaignId(a)?'<p class="small muted">Выбери собственную кампанию. Ее фразы и запросы будут подтягиваться из данных Директа при обновлении статистики.</p>':`
        <div class="kw-stat-row">
          <span><b>${campaignWords(a).length}</b> ключей в кампании</span>
          <span><b>${campaignQueries(a).length}</b> поисковых запросов</span>
        </div>
        <div class="row"><button data-act="kw.reload">Обновить данные Директа</button><button data-act="kw.importCampaign" ${!campaignWords(a).length?'disabled':''}>Копировать ключи в подборку</button><button data-act="kw.importQueries" ${!campaignQueries(a).length?'disabled':''}>Разобрать реальные запросы</button></div>
        <p class="small muted">Синхронизация только на чтение. Данные обновляются вместе со статистикой Директа. Добавление слов в рабочую кампанию, минус-фразы и изменение ставок требуют отдельного подтверждения.</p>
        ${campaignQueries(a).length?`<details><summary>Реальные поисковые запросы — последние 30 дней</summary>
          <div class="kw-list">${campaignQueries(a).slice(0,30).map(q=>`<div class="kw-item"><div class="kw-main"><b>${esc(q.query)}</b><div class="small muted">${Number(q.impr)||0} показов · ${Number(q.clicks)||0} кликов · ${Number(q.cost)||0} ₽ расход</div></div></div>`).join('')}</div>
        </details>`:''}
      `}
    </div>
    <div class="card kw-input">
      <h2>Темы книги из «Мастерской»</h2>
      ${seeds.length ? `<div class="kw-terms">${seeds.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}
      ${!seeds.length ? '<p class="small muted">Заполни жанры и теги в карточке книги «Мастерской» — они появятся здесь без повторного ввода.</p>' : ''}
      ${book?.legend?.idea?.genre ? `<p class="small muted">Легенда: ${esc(book.legend.idea.genre)}</p>`:''}
      <div class="row"><button data-act="kw.seed" ${!seeds.length?'disabled':''}>Добавить жанры и теги в подборку</button></div>
    </div>
    <div class="card kw-input">
      <div class="row between"><h2 style="margin:0">Wordstat API</h2><span class="small muted">0,02 ₽ за подбор · после подключения</span></div>
      <p class="small muted">Сначала один запрос по твоей фразе. Сходные запросы и частотность сохраняются в библиотеке; рекламы это не меняет. Без ключа на Cloudflare платные запросы заблокированы.</p>
      <label for="kwWord">Фраза для проверки</label>
      <input id="kwWord" data-chg="kw.wphrase" value="${esc(seed)}" placeholder="Например: криминальный любовный роман">
      <div class="row"><button data-act="kw.wordstat">Подобрать через Wordstat</button>
        <button class="link" data-act="go" data-to="/settings">Настроить API →</button></div>
    </div>
    <div class="card kw-input">
      <h2>Найти и собрать</h2>
      <form data-form="kw.add" class="settings-form">
        <label for="kwPhrases">Стартовые ключи — по одному на строку</label>
        <textarea id="kwPhrases" name="phrases" rows="3" maxlength="12000" placeholder="остросюжетный любовный роман&#10;психологический любовный роман&#10;криминальный любовный роман" required></textarea>
        <div class="row"><button type="submit" class="primary">Добавить фразы</button>
          <button type="button" data-act="kw.demand" ${!all.length?'disabled':''}>Проверить наличие спроса</button></div>
      </form>
      <div class="kw-import">
        <label>Частотность из Вордстата</label>
        <div class="row"><label class="kw-upload">Импорт CSV / TSV <input type="file" data-chg="kw.file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Выбрать файл выгрузки Вордстата"></label></div>
      </div>
      <p class="small muted">Частотность — только из загруженного файла, без придуманных цифр. «Наличие спроса» проверяется через API Директа и не показывает число запросов. Фразы не добавляются в рекламу автоматически.</p>
    </div>
    <div class="card kw-results">
      <div class="row between kw-results-top"><h2 style="margin:0">Список фраз</h2>
        <div class="row"><button data-act="kw.export" ${!picked.length?'disabled':''}>Скачать подборку CSV</button>
        <button data-act="kw.copy" ${!picked.length?'disabled':''}>Копировать</button></div>
      </div>
      <div class="kw-filters">${Object.entries(modeLabel).map(([k,v])=>`<button class="${filter===k?'on':''}" data-act="kw.filter" data-filter="${k}">${v} · ${k==='all'?all.length:all.filter(x=>x.status===k).length}</button>`).join('')}</div>
      ${!filtered.length?'<p class="small muted">Здесь пока нет фраз. Добавь стартовые запросы или импортируй выгрузку Вордстата.</p>':`
      <div class="kw-list">${filtered.slice(0,300).map(x=>{
        const hint=interestHint(x.phrase);
        return `<div class="kw-item">
          <div class="kw-main">
            <b>${esc(x.phrase)}</b>
            <div class="small muted">${x.count==null?'Частотность неизвестна':num(x.count)+' · '+(x.source==='wordstat-api'?'Wordstat API':'из файла')} · ${x.volume==='YES'?'есть прогноз показов':x.volume==='NO'?'прогноз показов не найден':esc(hint.why)}</div>
          </div>
          ${statusButtons(x)}
        </div>`;
      }).join('')}</div>
      ${filtered.length>300?`<p class="small muted">Показаны первые 300 из ${filtered.length} фраз. Используй фильтры.</p>`:''}
      `}
    </div>
    <div class="card kw-foot"><h2>Как читать данные</h2>
      <p class="small muted">Высокая частотность не гарантирует продажи книги. Для Поиска проверяй смысл запроса и соответствие аннотации, затем оценивай уже реальные показы, клики и покупки. Для РСЯ ключевые фразы работают иначе — как сигналы интересов и тематики.</p>
    </div>
  `};
}
changes['kw.book'] = value => {app().ui.kwBook=value;app().ui.kwPhrase='';app().ui.kwFilter='all';app().rerender();};
changes['kw.wphrase']=value=>{app().ui.kwPhrase=String(value||'').trim().slice(0,200);};
acts['kw.seed']=async ()=>{
  const a=app(),b=books(a).find(x=>String(x.id)===String(chosen(a)));
  if(!b)return false;
  await addRows(a,[...bookGenres(b),...bookTags(b)].map(phrase=>({phrase,count:null})),'book-tags');
  return false;
};
acts['kw.wordstat']=async ()=>{
  const a=app(),b=books(a).find(x=>String(x.id)===String(chosen(a)));
  const phrase=String(a.ui.kwPhrase||[...bookGenres(b),...bookTags(b)][0]||'').trim();
  if(!phrase){toast('Укажи фразу для Вордстата');return false;}
  if(!a.store?.auth?.currentUser){toast('Нужен вход в аккаунт — Wordstat доступен только владелице');return false;}
  const endpoint=String(a.ctx().settings.direct?.proxy||'').replace(/\/+$/,'');
  if(!/^https:\/\/[^/]+$/.test(endpoint)){toast('Сначала подключи Cloudflare');return false;}
  if(!(await ask('Проверить фразу «'+phrase+'» через платный Wordstat API? Один запрос по тарифу 0,02 ₽. Без настроенного ключа ничего не спишется.','Проверить')))return false;
  try{
    const jwt=await a.store.auth.currentUser.getIdToken();
    const response=await fetch(endpoint+'/wordstat/top',{method:'POST',headers:{'Authorization':'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify({phrase})});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok)throw Error(result.error||'Wordstat вернул ошибку '+response.status);
    const rows=[...(result.results||[]),...(result.associations||[])].map(x=>({phrase:String(x.phrase||''),count:Number(x.count)}))
      .filter(x=>x.phrase&&Number.isFinite(x.count)&&x.count>=0);
    if(!rows.length){toast('По этому запросу статистики нет');return false;}
    await addRows(a,rows,'wordstat-api');
    toast('Wordstat: найдено '+rows.length+' фраз. Оценочный расход за месяц: '+(result.usage?.estimatedRub??'—')+' ₽');
  }catch(e){toast('Wordstat: '+(e.message||e));}
  return false;
};
changes['kw.campaign']=async value=>{
  const a=app(),b=chosen(a),chosenId=String(value||'');
  if(!b)return;
  if(chosenId&&!campaigns(a).some(x=>String(x.id)===chosenId)){toast('Нет такой кампании в твоем кабинете');return;}
  await a.store.put('d_kw_bindings',{id:'kwbook_'+b,bookId:b,campaignId:chosenId,modifiedAt:new Date().toISOString()});
};
acts['kw.reload']=()=>{app().reload();return false;};
acts['kw.importCampaign']=async ()=>{
  const a=app(),items=campaignWords(a).filter(x=>x.phrase&&!/AUTO_TARGET/i.test(x.phrase));
  if(!items.length){toast('В выбранной кампании пока нет фраз');return false;}
  await addRows(a,items.map(x=>({phrase:x.phrase,count:null})),'direct-sync');
  return false;
};
acts['kw.importQueries']=async ()=>{
  const a=app(),items=campaignQueries(a).filter(x=>x.query).slice(0,80);
  if(!items.length){toast('За последние 30 дней поисковых запросов нет');return false;}
  await addRows(a,items.map(x=>({phrase:x.query,count:null})),'direct-queries');
  return false;
};
acts['kw.filter']=d=>{app().ui.kwFilter=d.filter||'all';return true;};
async function addRows(a,entries,source='manual'){
  if(!entries.length){toast('Не нашла ни одной подходящей фразы');return;}
  const bk=chosen(a),old=allFor(a),map=new Map(old.map(x=>[x.id,x]));
  const proposed=preparedKeywords(entries,bk,source,old);
  const changed=proposed.filter(x=>{const o=map.get(x.id);return !o||x.count!==o.count||x.source!==o.source;});
  if(!changed.length){toast('Все эти фразы уже сохранены');return;}
  await a.store.putMany('d_keywords',changed);
  toast('Добавлено или обновлено: '+changed.length+' фраз');
}
forms['kw.add']=async (fd,f)=>{
  const a=app();
  const phrases=plainPhrases(fd.get('phrases')||'');
  await addRows(a,phrases);
  f.reset();
};
changes['kw.file']=async (_value,el)=>{
  const f=el.files?.[0];if(!f)return;
  try{
    if(f.size>1_000_000)throw new Error('Файл слишком большой (максимум 1 МБ)');
    const text=await f.text(),rows=csvRows(text);
    if(!rows.length)throw new Error('Не удалось прочитать фразы; нужен CSV или TSV из Вордстата');
    await addRows(app(),rows,'wordstat-import');
  }catch(e){toast(e.message||String(e));}finally{el.value='';}
};
acts['kw.status']=async d=>{
  const a=app(),x=allFor(a).find(x=>x.id===d.id);
  if(!x||!intentLabel[d.state])return false;
  await a.store.put('d_keywords',{...x,status:d.state,updatedAt:new Date().toISOString()});
  return false;
};
acts['kw.export']=async()=>{
  const a=app(),set=allFor(a).filter(x=>x.status==='keep'),b=books(a).find(x=>String(x.id)===String(chosen(a)));
  if(!set.length)return false;
  await download('Ключевые_слова_'+safeName(b?.title)+'.csv',exportList(set),'text/csv');
  return false;
};
acts['kw.copy']=async()=>{
  const arr=allFor(app()).filter(x=>x.status==='keep').map(x=>x.phrase);
  if(!arr.length)return false;
  try{await navigator.clipboard.writeText(arr.join('\n'));toast('Подборка скопирована');}catch{toast('Не удалось скопировать: скачай CSV');}
  return false;
};
acts['kw.demand']=async()=>{
  const a=app(),s=a.ctx().settings,rows=allFor(a).filter(x=>x.status!=='reject').slice(0,50);
  if(!rows.length){toast('Сначала добавь фразы');return false;}
  if(!s.directToken){toast('Для проверки спроса подключи Директ в настройках');return false;}
  if(s.direct?.sandbox){toast('Проверка спроса в песочнице недоступна');return false;}
  try{
    const result=await call(s,'keywordsresearch','hasSearchVolume',{
      SelectionCriteria:{Keywords:rows.map(x=>x.phrase),RegionIds:[225]},
      FieldNames:['Keyword','AllDevices'],
    },0,undefined,'v501');
    const matched=new Map((result.HasSearchVolumeResults||[]).map(x=>[normKey(x.Keyword),x.AllDevices]));
    const updated=rows.filter(x=>matched.has(normKey(x.phrase))).map(x=>({
      ...x,volume:matched.get(normKey(x.phrase)),volumeAt:new Date().toISOString()
    }));
    if(updated.length)await a.store.putMany('d_keywords',updated);
    toast('Проверено: '+updated.length+' фраз · Россия');
  }catch(e){toast('Проверка спроса: '+(e.message||e));}
  return false;
};
