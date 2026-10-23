// "Мой Литнет" в Директе: ссылки общие с "Мастерской", статистика привязок — вручную.
// Никогда не редактируем чужие кампании и не генерируем ссылки вместо самого Литнета.
import { esc, acts, toast, openSheet, ask, opt, uid } from '../../../js/ui.js';
import { visibleLinks, exactTag, linkStatus, expiresFromCreated } from '../litnetcalc.js';
import { isLitnetLink, promoReminderDate } from '../../../writer/js/promolinks.js';
import { fmtDate } from '../../../js/format.js';

const app=()=>window.__app;
const links=a=>visibleLinks(a.ctx().data.w_promolinks||[],a.ctx().data.w_books||[],{today:a.ctx().today});
const bookList=a=>(a.ctx().data.w_books||[]);
const campaigns=a=>(a.snap('main')?.campaigns||[]).filter(x=>x.state!=='ARCHIVED');
const bookName=(a,id)=>bookList(a).find(b=>String(b.id)===String(id))?.title||'';
const human=d=>d?fmtDate(d):'—';
const inactive=l=>l.state.type==='expired'||l.state.type==='today';
const readerChange=x=>{
  const history=x.readersHistory||[];
  if(history.length<2)return '';
  const last=history[history.length-1].readers, previous=history[history.length-2].readers;
  return last>previous?' +'+(last-previous)+' с прошлого замера':last<previous?' скорректировано':'';
};
export function litnetSummary(a){
  const list=links(a), soon=list.filter(x=>x.state.type==='soon'||x.state.type==='today'||x.state.type==='expired');
  const nearest=soon[0];
  return `<div class="card ln-summary">
    <div class="row between"><h2 style="margin:0">Мой Литнет</h2><button data-act="go" data-to="/litnet">Ссылки и метки</button></div>
    <div class="small muted">${list.length} ссылок${nearest?' · внимание: '+esc(nearest.bookTitle)+', '+human(nearest.expires):''}</div>
  </div>`;
}
export function litnetView(a) {
  const list=links(a), active=list.filter(x=>x.state.type==='active').length, watch=list.filter(x=>x.state.type==='soon'||x.state.type==='today').length, expired=list.filter(x=>x.state.type==='expired').length;
  return {html:`
  <div class="card ln-head">
    <div class="row between"><h2 style="margin:0">Мой Литнет</h2><button class="primary" data-act="ln.new">+ Ссылка</button></div>
    <div class="ln-stats"><div><b>${active}</b><span>действуют</span></div><div><b>${watch}</b><span>скоро заменить</span></div><div><b>${expired}</b><span>срок прошел</span></div></div>
    <p class="small muted">Ссылки создаются на Литнете. Здесь храним их, отслеживаем срок новых привязок и копируем точную метку для Директа.</p>
  </div>
  ${!list.length ? `<div class="card ln-empty"><h3>Пока нет ссылок</h3><p class="small muted">Добавь ссылку из «Мой Литнет» вместе с датой окончания — напоминание появится и в Планере «Мастерской».</p><button data-act="ln.new">Добавить ссылку</button></div>` : `
    <div class="ln-list">${list.map(x=>`<section class="card ln-item">
      <div class="row between ln-item-head">
        <div class="ln-title"><b>${esc(x.bookTitle)}</b><span class="small muted">${esc(x.campaign||'Источник не указан')}</span></div>
        <span class="ln-status ${esc(x.state.type)}">${esc(x.state.label)}</span>
      </div>
      <div class="ln-fields">
        <div><span class="ln-label">Новые читатели · вручную</span><strong>${x.readers===''||x.readers==null?'—':esc(x.readers)}</strong>${readerChange(x)?`<span class="small up">${esc(readerChange(x))}</span>`:''}</div>
        <div><span class="ln-label">Ссылка до</span><strong>${human(x.expires)}</strong></div>
        <div><span class="ln-label">Напоминание</span><strong>${human(x.state.renew)}</strong></div>
      </div>
      <div class="ln-tagline">
        <span class="ln-tag">${esc(x.tag||'Некорректная ссылка')}</span>
        <button data-act="ln.copy" data-id="${esc(x.id)}" ${!x.tag?'disabled':''}>Копировать метку</button>
      </div>
      <div class="row ln-actions">
        <button class="link" data-act="ln.edit" data-id="${esc(x.id)}">Изменить</button>
        <button class="link" data-act="ln.link" data-id="${esc(x.id)}">Открыть ссылку</button>
        ${x.directCampaignId ? `
          <button class="link" data-act="go" data-to="/c/${esc(x.directCampaignId)}">Кампания №${esc(x.directCampaignId)}</button>
        ` : ''}
        ${x.directCampaignId&&x.appliedTag!==x.tag&&x.tag ? `
          <span class="small warnc">Метка в Директе требует подтверждения</span>
          <button class="link" data-act="ln.applied" data-id="${esc(x.id)}">Отметить замену</button>
        ` : ''}
        ${x.directCampaignId&&x.appliedTag===x.tag&&x.tag ? '<span class="small up">✓ Замена отмечена</span>' : ''}
      </div>
      ${inactive(x) ? '<p class="small muted ln-note">Сама ссылка продолжает открываться. Для новых привязок нужна новая ссылка из Литнета.</p>' : ''}
    </section>`).join('')}</div>
  `}
  <div class="card ln-guide">
    <h2>Как обновлять</h2>
    <div class="ln-steps"><span>1. Создать ссылку в Литнете</span><span>2. Скопировать <code>utm_litref</code></span><span>3. Внести в «Параметры URL» кампании</span></div>
    <p class="small muted">Метки в группе или объявлении могут перекрыть параметры кампании. После замены Яндекс может отправить объявления на повторную модерацию. Автоматически ничего не меняем.</p>
    <div class="row"><a href="https://litnet.com/" target="_blank" rel="noopener">Литнет ↗</a><a href="https://direct.yandex.ru/" target="_blank" rel="noopener">Яндекс Директ ↗</a></div>
  </div>`};
}
function fields(a,x={}) {
  const bs=bookList(a), cs=campaigns(a);
  return `
    <label>Книга</label>
    <select name="bookId"><option value="">Другая книга / пока не в Мастерской</option>${bs.map(b=>opt(b.id,b.title,x.bookId||'')).join('')}</select>
    <label>Название книги, если ее нет в списке</label>
    <input name="book" value="${esc(x.book||'')}" placeholder="Развод для черной вдовы" maxlength="180">
    <label>Кампания или источник</label>
    <input name="campaign" value="${esc(x.campaign||'')}" placeholder="Альпийский развод · таргетолог" maxlength="180" required>
    <label>Моя кампания Яндекс Директа (необязательно)</label>
    <select name="directCampaignId"><option value="">Не привязана / кабинет таргетолога</option>${cs.map(z=>opt(z.id,z.name,x.directCampaignId||'')).join('')}</select>
    <label>Персональная ссылка из «Мой Литнет»</label>
    <input type="url" name="url" value="${esc(x.url||'')}" placeholder="https://litnet.com/ref/..." required>
    <div class="f2">
      <div><label>Действует до</label><input type="date" name="expires" value="${esc(x.expires||'')}" required></div>
      <div><label>Новых читателей (из Литнета)</label><input name="readers" inputmode="numeric" value="${esc(String(x.readers??''))}" placeholder="—"></div>
    </div>
  `;
}
function collect(a,fd,old={}) {
  const bookId=String(fd.get('bookId')||'');
  const book=bookName(a,bookId)||String(fd.get('book')||'').trim();
  const campaign=String(fd.get('campaign')||'').trim();
  const directCampaignId=String(fd.get('directCampaignId')||'');
  const url=String(fd.get('url')||'').trim(), expires=String(fd.get('expires')||'');
  const raw=String(fd.get('readers')||'').trim();
  if(!book)throw Error('Укажи книгу');
  if(!campaign)throw Error('Укажи кампанию или источник');
  if(!isLitnetLink(url)||!exactTag(url))throw Error('Нужна персональная ссылка вида https://litnet.com/ref/...');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expires)||!promoReminderDate(expires))throw Error('Укажи дату окончания из Литнета');
  if(raw&&!/^\d{1,9}$/.test(raw))throw Error('Количество читателей должно быть целым неотрицательным числом');
  if(directCampaignId&&!campaigns(a).some(x=>String(x.id)===directCampaignId))throw Error('Выбери свою кампанию из списка');
  const changed=old.url!==url||old.expires!==expires;
  const history=[...(old.history||[])];
  const readers=raw===''?'':Number(raw);
  const readersHistory=[...(old.readersHistory||[])];
  if(readers!==''&&readers!==old.readers) {
    if(readersHistory.length===0&&old.readers!==''&&old.readers!=null)
      readersHistory.push({at:old.modifiedAt||old.createdAt||new Date().toISOString(),readers:Number(old.readers)});
    readersHistory.push({at:new Date().toISOString(),readers});
  }
  if(old.url&&changed)history.push({url:old.url,expires:old.expires,savedAt:new Date().toISOString()});
  return {...old,bookId,book,campaign,directCampaignId,url,expires,
    readers,readersHistory:readersHistory.slice(-90),status:'active',
    history:history.slice(-20),modifiedAt:new Date().toISOString(),
    ...(changed?{reminderDoneFor:''}:{})};
}
acts['ln.new']=()=>{
  const a=app();
  openSheet('Добавить ссылку «Мой Литнет»',fields(a),async fd=>{
    try {
      const x=collect(a,fd);
      await a.store.put('w_promolinks',{id:'utm_'+uid(),createdAt:new Date().toISOString(),...x});
      toast('Ссылка сохранена. Планер учтет срок.');
    } catch(e){toast(e.message);return false;}
  });
  return false;
};
acts['ln.edit']=d=>{
  const a=app(),x=(a.ctx().data.w_promolinks||[]).find(t=>t.id===d.id);
  if(!x)return false;
  openSheet('Ссылка · '+(x.campaign||x.book),fields(a,x)+`
    <div class="row" style="margin-top:14px"><button type="button" class="link danger" data-act="ln.archive" data-id="${esc(x.id)}">В архив</button></div>
  `,async fd=>{
    try{await a.store.put('w_promolinks',collect(a,fd,x));toast('Ссылка обновлена');}
    catch(e){toast(e.message);return false;}
  });
  return false;
};
acts['ln.archive']=async d=>{
  const a=app(),x=(a.ctx().data.w_promolinks||[]).find(t=>t.id===d.id);
  if(!x||!(await ask('Убрать ссылку в архив? Напоминания по ней исчезнут, сама реклама не изменится.','В архив')))return false;
  await a.store.put('w_promolinks',{...x,status:'archived',archivedAt:new Date().toISOString()});
  document.getElementById('sheet')?.close();toast('Ссылка в архиве');return false;
};
acts['ln.applied']=async d=>{
  const a=app(),x=(a.ctx().data.w_promolinks||[]).find(t=>t.id===d.id),tag=x&&exactTag(x.url);
  if(!tag||!x.directCampaignId)return false;
  if(!(await ask('Ты уже вручную заменила метку «'+tag+'» в своей кампании Яндекс Директа? Приложение только отметит это, ничего не отправит в Яндекс.','Да, заменила')))return false;
  await a.store.put('w_promolinks',{...x,appliedTag:tag,appliedAt:new Date().toISOString()});toast('Замена отмечена');return false;
};
acts['ln.copy']=async d=>{
  const x=(app().ctx().data.w_promolinks||[]).find(t=>t.id===d.id),tag=x&&exactTag(x.url);
  if(!tag){toast('Метка не найдена');return false;}
  try{await navigator.clipboard.writeText(tag);toast('UTM-метка скопирована');}catch{toast('Не удалось скопировать: выдели метку вручную');}
  return false;
};
acts['ln.link']=d=>{
  const x=(app().ctx().data.w_promolinks||[]).find(t=>t.id===d.id);
  if(x&&isLitnetLink(x.url))window.open(x.url,'_blank','noopener');
  return false;
};
