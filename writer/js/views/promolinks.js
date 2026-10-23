// UTM/реферальные ссылки Литнета: единый реестр в Маркетинге + карточках книг.
import { esc, acts, toast, openSheet, ask, opt, uid } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import { activePromoLinks, isLitnetLink, promoReminderDate, promoToken } from '../promolinks.js';

const app = () => window.__app;
const linkList = (c, bookId = '') => activePromoLinks(c.data.w_promolinks || []).filter(x => !bookId || x.bookId === bookId);
const human = value => value ? fmtDate(value) : 'Не указана';
const bookTitle = (c, x) => c.wbooksById[x.bookId]?.title || 'Книга не найдена';
const safeLink = url => isLitnetLink(url) ? url : '';
const displayLink = url => {
  const u = safeLink(url);
  return u ? `<a href="${esc(u)}" rel="noopener noreferrer" target="_blank" class="utm-url">${esc(u)}</a>` : '<span class="muted">нет ссылки</span>';
};
const status = (x, today) => x.expires < today ? 'Новые привязки завершены' : x.expires === today ? 'Последний день новых привязок' : 'Привязки до ' + human(x.expires);
// На списке книг — только компактная кнопка и статус, а не целый пустой UTM-блок.
// Полная карточка ссылок показывается после открытия книги → «Для таргета».
export function promoLinksInline(c, bookId) {
  const items = linkList(c, bookId);
  if (!items.length) return ''; // Никакой пустой секции и даже кнопки: ссылка добавляется внутри книги.
  const nearest = items[0];
  const expired = nearest.expires < c.today;
  return `<button type="button" class="mk-utm-action mk-utm-ready${expired ? ' is-expired' : ''}" data-act="mk.go" data-id="${esc(bookId)}" data-tab="target" title="${esc(nearest.campaign || 'Открыть UTM-ссылки')}">
    UTM · ${items.length} <span>${expired ? 'истекла ' : 'до '}${human(nearest.expires)}</span>
  </button>`;
}
export function promoLinksPanel(c, { bookId = '', compact = false } = {}) {
  const items = linkList(c, bookId);
  return `<div class="${compact ? 'utm-panel utm-panel-compact' : 'card utm-panel'}">
    <div class="row between"><h2 style="margin:0">UTM-ссылки</h2><button class="small-btn" data-act="utm.new"${bookId ? ` data-book="${esc(bookId)}"` : ''}>+ Ссылка</button></div>
    ${!items.length ? '<p class="small muted">Ссылок пока нет.</p>' : `
      <div class="utm-list">${items.map(x=>`<div class="utm-item">
        <div class="row between">
          <div class="utm-main"><b>${esc(x.campaign || 'Рекламная кампания')}</b>
            ${!bookId ? `<span class="small muted">${esc(bookTitle(c,x))}</span>` : ''}
          </div>
          <button class="link" data-act="utm.edit" data-id="${esc(x.id)}">Изменить</button>
        </div>
        <div class="utm-urlrow">${displayLink(x.url)}</div>
        <div class="small muted utm-token">utm_litref=${esc(promoToken(x.url))}</div>
        ${x.destination ? `<div class="small muted">${displayLink(x.destination)}</div>` : ''}
        <div class="utm-meta">
          <span class="${x.expires < c.today ? 'down' : 'muted'}">${esc(status(x,c.today))}</span>
          <span>Напомнить: <b>${human(promoReminderDate(x.expires))}</b></span>
          ${Number.isFinite(Number(x.readers)) && x.readers !== '' ? `<span>Новых читателей: ${esc(String(x.readers))}</span>` : ''}
        </div>
      </div>`).join('')}</div>
    `}
  </div>`;
}
const fields = (c, x={}, locked='') => `
  <label>Книга</label>
  <select name="bookId" required>
    <option value="">Выбрать книгу</option>
    ${c.wbooks.map(b=>opt(b.id,b.title,locked||x.bookId||'')).join('')}
  </select>
  <label>Название кампании (для себя)</label>
  <input name="campaign" value="${esc(x.campaign||'')}" maxlength="180" placeholder="Альпийский развод · реклама таргетолога" required>
  <label>Ссылка для продвижения из Литнета</label>
  <input name="url" type="url" value="${esc(x.url||'')}" placeholder="https://litnet.com/ref/..." required>
  <label>Ссылка на книгу (необязательно)</label>
  <input name="destination" type="url" value="${esc(x.destination||'')}" placeholder="https://litnet.com/ru/book/...">
  <div class="f2">
    <div><label>Новые привязки до</label><input name="expires" type="date" value="${esc(x.expires||'')}" required></div>
    <div><label>Новых читателей (необязательно)</label><input name="readers" inputmode="numeric" value="${esc(String(x.readers??''))}" placeholder="Например, 96"></div>
  </div>
`;
function entry(fd, previous = {}) {
  const bookId=String(fd.get('bookId')||''), campaign=String(fd.get('campaign')||'').trim(),
    url=String(fd.get('url')||'').trim(), destination=String(fd.get('destination')||'').trim(),
    expires=String(fd.get('expires')||''), rawReaders=String(fd.get('readers')||'').trim();
  if(!app().ctx().wbooksById[bookId]) throw new Error('Выбери существующую книгу');
  if(!campaign) throw new Error('Впиши название кампании');
  if(!isLitnetLink(url)) throw new Error('Нужна действительная ссылка вида https://litnet.com/ref/...');
  if(destination && !isLitnetLink(destination,'destination')) throw new Error('Ссылка на книгу должна вести на https://litnet.com/');
  if(!promoReminderDate(expires)) throw new Error('Укажи настоящую дату окончания ссылки');
  if(rawReaders && (!/^\d+$/.test(rawReaders) || Number(rawReaders)>100000000)) throw new Error('Число новых читателей должно быть неотрицательным');
  const changed = previous.url !== url || previous.expires !== expires;
  const history = [...(previous.history||[])];
  if (previous.url && changed) history.push({ url: previous.url, expires: previous.expires, savedAt: new Date().toISOString() });
  return { ...previous, bookId,campaign,url,destination,expires,readers:rawReaders===''?'':Number(rawReaders),
    history:history.slice(-20), ...(changed ? {reminderDoneFor:''} : {}),
    status:'active', modifiedAt:new Date().toISOString() };
}
acts['utm.new'] = d => {
  const c=app().ctx();
  openSheet('Новая рекламная UTM-ссылка',fields(c,{},d.book||''),async fd=>{
    try { const v=entry(fd); await app().store.put('w_promolinks',{id:'utm_'+uid(),createdAt:new Date().toISOString(),...v});
      toast('Ссылка сохранена. Задача появится в Планере.'); }
    catch(e){toast(e.message);return false;}
  },{submitText:'Сохранить ссылку'});
};
acts['utm.edit'] = d => {
  const c=app().ctx(), x=(c.data.w_promolinks||[]).find(v=>v.id===d.id);
  if(!x)return false;
  openSheet('UTM-ссылка · '+(x.campaign||''),fields(c,x)+`
    <div class="row" style="margin-top:18px"><button type="button" data-act="utm.archive" data-id="${esc(x.id)}" class="link danger">Перенести в архив</button></div>
    ${x.history?.length ? `<details><summary>История обновлений (${x.history.length})</summary>
      ${x.history.slice().reverse().map(h=>`<div class="small muted">До ${human(h.expires)} · ${displayLink(h.url)}</div>`).join('')}
    </details>` : ''}`,
    async fd=>{
      try {const v=entry(fd,x);await app().store.put('w_promolinks',v);toast('Ссылка и напоминание обновлены');}
      catch(e){toast(e.message);return false;}
    },{submitText:'Сохранить изменения'});
};
acts['utm.archive'] = async d =>{
  const c=app().ctx(),x=(c.data.w_promolinks||[]).find(v=>v.id===d.id);
  if(!x||!(await ask('Перенести ссылку в архив? Напоминания по ней исчезнут, но историю сохраним.','В архив')))return false;
  await app().store.put('w_promolinks',{...x,status:'archived',archivedAt:new Date().toISOString()});
  document.getElementById('sheet')?.close();toast('Ссылка в архиве');return false;
};
