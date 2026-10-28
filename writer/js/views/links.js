// Связи: издательства, соцсети, площадки, люди — контакты, ссылки, история общения и запросы без ответа
import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { waitingStatus } from '../wcalc.js';
import { addDays } from '../../../js/calc.js';
import { promoChannel } from '../promolinks.js';
import { blogList } from './blog.js';
import { siteHubRow, mySiteView } from './mysite.js';

const app = () => window.__app;
export const LKINDS = { publisher: 'Издательства', target: 'Таргетологи', social: 'Соцсети', platform: 'Площадки', people: 'Люди', other: 'Другое' };
const KIND1 = { publisher: 'Издательство', target: 'Таргетолог', social: 'Соцсеть', platform: 'Площадка', people: 'Человек', other: 'Другое' };
const NETS = ['Telegram', 'ВКонтакте', 'Pinterest', 'Instagram', 'Дзен', 'TikTok', 'YouTube', 'Threads', 'Одноклассники'];
const PLATS = ['Литнет', 'Литмаркет', 'Литгород', 'Литрес', 'Author.Today', 'Bookmate'];

const lastLog = (x) => (x.log || []).map((l) => l.date).sort().pop() || '';
const openReq = (c, x) => c.data.w_waiting.filter((r) => !r.done && r.contactId === x.id);
const matches = (x, q) => !q || [x.name, x.net, x.handle, x.contact, x.note, x.campaignNote, ...(x.bookIds || []), ...(x.log || []).map((l) => l.text)].join(' ').toLowerCase().includes(q.toLowerCase());
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : u ? 'https://' + u : '');

// ---------- список ----------
export function linksView(a) {
  const c = a.ctx(), q = a.ui.linkQ || '';
  const all = [...c.data.w_links].sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ru'));
  const list = all.filter((x) => matches(x, q));
  const reqs = c.data.w_waiting.filter((r) => !r.done).sort((x, y) => (x.since || '').localeCompare(y.since || ''));
  const done = c.data.w_waiting.filter((r) => r.done).sort((x, y) => (y.answeredAt || '').localeCompare(x.answeredAt || ''));
  // Ссылки Threads находятся среди соцсетей, а не отдельной кнопкой между заголовками.
  // Используем те же .card.list / .item / .sub и существующие шрифты, что и для площадок.
  const showSocialHub = !q || 'мой литнет соцсети threads тредс'.includes(q.toLowerCase());
  const socialCount = (c.data.w_promolinks || []).filter(x => x.status !== 'archived' && promoChannel(x) === 'social').length;
  const socialHub = showSocialHub ? `<a class="item row between" href="#" data-act="go" data-to="/social"><span><b>Мой Литнет</b><span class="sub">Персональные ссылки · ${socialCount} ${plural(socialCount, ['ссылка', 'ссылки', 'ссылок'])}</span></span></a>` : '';
  // «Мой сайт» — первым в «Площадках»: сайт автора, его дела и сверка с Мастерской
  const showSite = !q || 'мой сайт lanafreitag'.includes(q.toLowerCase());
  const groups = Object.keys(LKINDS).map((k) => [k, list.filter((x) => (x.kind || 'other') === k)])
    .filter(([k, l]) => l.length || k === 'target' || (k === 'social' && showSocialHub) || (k === 'platform' && showSite));
  const html = `<section class="links-page"><div class="row between links-title" style="margin-bottom:10px"><h2 style="margin:0">Связи</h2><button class="primary" data-act="link.new">+ Добавить</button></div>
  ${blogList(c)}
  ${all.length > 5 ? `<input type="search" value="${esc(q)}" placeholder="Поиск: имя, ник, заметка…" data-chg="link.q" aria-label="Поиск по связям" style="margin-bottom:12px">` : ''}
  <div class="psec-h" style="margin-top:4px"><h2>Запросы без ответа <span class="muted">${reqs.length || ''}</span></h2><button class="small-btn" data-act="wait.new">+ Запрос</button></div>
  ${reqs.length ? `<div class="card plist-card"><div class="plist">${reqs.map((r) => reqRow(c, r)).join('')}</div></div>` : '<div class="card"><p class="small muted" style="margin:0">Открытых запросов нет. Отправили рукопись, заявку или письмо — добавьте запрос, и приложение напомнит, если ответа долго нет.</p></div>'}
  ${groups.length ? groups.map(([k, l]) => `<div class="psec-h"><h2>${LKINDS[k]}${l.length ? ` <span class="muted">${l.length}</span>` : ''}</h2><button class="small-btn" data-act="link.new" data-kind="${k}">+ ${KIND1[k]}</button></div>
    <div class="card list">${k === 'social' ? socialHub : ''}${k === 'platform' && showSite ? siteHubRow(c) : ''}${l.map((x) => linkRow(c, x)).join('') || ((k === 'social' && socialHub) || (k === 'platform' && showSite) ? '' : '<p class="small muted" style="margin:0">Пока никого нет.</p>')}</div>`).join('')
    : `<div class="card" style="margin-top:16px"><p class="small muted" style="margin-top:0">${q ? 'Ничего не нашлось.' : 'Соберите здесь всё, что вне книг: издательства, соцсети, площадки, нужных людей. У каждой связи — ссылки, ники, история общения и запросы.'}</p>
      ${q ? '' : `<div class="row">${Object.keys(LKINDS).filter((k) => k !== 'other').map((k) => `<button data-act="link.new" data-kind="${k}">+ ${KIND1[k]}</button>`).join('')}</div>`}</div>`}
  ${done.length ? `<details class="card" style="margin-top:16px"><summary>Ответы получены (${done.length})</summary>${done.map((r) => `<div class="item small"><b>${esc(r.who)}</b>${r.what ? ': ' + esc(r.what) : ''}${r.answer ? `<br>→ ${esc(r.answer)}` : ''}<span class="sub">${r.answeredAt ? fmtDate(r.answeredAt) : ''}</span></div>`).join('')}</details>` : ''}</section>`;
  return { html };
}
function linkRow(c, x) {
  const n = openReq(c, x).length, last = lastLog(x);
  const sub = [x.kind === 'social' || x.kind === 'platform' ? x.net : '', x.kind === 'target' ? (x.partnerStatus === 'paused' ? 'на паузе' : x.partnerStatus === 'done' ? 'сотрудничество завершено' : 'сотрудничаем') : '', x.handle, x.contact, last ? `последний раз ${fmtDate(last)}` : ''].filter(Boolean).map(esc).join(' · ');
  return `<a class="item row between" href="#" data-act="go" data-to="/link/${x.id}"><span><b>${esc(x.name)}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${n ? `<span class="badge warn">${n} ${plural(n, ['запрос', 'запроса', 'запросов'])}</span>` : ''}</a>`;
}
function reqRow(c, r) {
  const s = waitingStatus(r, c.today);
  return `<div class="pitem"><span class="dot k-waitans"${s.overdue ? '' : ' style="opacity:.45"'}></span><span class="pi-body"><span class="pi-t">${esc(r.who)}${r.what ? ' — ' + esc(r.what) : ''}</span>
    <span class="pi-s">${s.days ? `${s.days} ${plural(s.days, ['день', 'дня', 'дней'])} без ответа` : 'отправлено сегодня'}${s.overdue ? ' · пора напомнить о себе' : ` · напомню через ${Math.max(0, (Number(r.remindDays) || 14) - s.days)} дн.`}</span>
    <span class="row" style="gap:2px;margin-top:2px"><button class="link" data-act="wait.answer" data-id="${r.id}">Ответили</button><button class="link" data-act="wait.nudge" data-id="${r.id}">Напомнила</button><button class="link" data-act="wait.edit" data-id="${r.id}">Изменить</button></span></span></div>`;
}
changes['link.q'] = (v) => { app().ui.linkQ = v.trim(); app().rerender(); };

// Одна рабочая область для таргетолога: дела с датой и записи переписки в единой ленте.
function targetWorkPanel(c, x) {
  const entries = [
    ...(x.todos || []).map(t => ({ ...t, entryType:'task', stamp:t.date || '' })),
    ...(x.log || []).map(l => ({ ...l, entryType:'log', stamp:l.date || '' })),
  ].sort((a,b) => {
    const af = a.entryType === 'task' && !a.done ? 0 : 1;
    const bf = b.entryType === 'task' && !b.done ? 0 : 1;
    return af - bf || (af ? (b.stamp || '').localeCompare(a.stamp || '') : (a.stamp || '').localeCompare(b.stamp || ''));
  });
  const requests = (c.data.w_waiting || []).filter(r => r.contactId === x.id && !r.done);
  const linkedBooks = (x.bookIds || []).map(id => c.wbooksById[id]).filter(Boolean);
  const option = (v, name) => `<option value="${esc(v)}">${esc(name)}</option>`;
  return `<section class="target-work">
    <div class="psec-h target-work-heading"><h2>Общение и дела</h2><span class="small muted">Задачи — в Планере и Todoist</span></div>
    <div class="card target-work-card">
      <form data-form="target.entry" data-id="${esc(x.id)}" class="target-quickform">
        <div class="target-quick-grid">
          <select name="entryType" aria-label="Что добавить" data-chg="target.entryType">
            ${option('task','Дело')}${option('log','Запись')}
          </select>
          <input type="date" name="date" value="${c.today}" required aria-label="Дата дела или записи">
          <select name="section" aria-label="Папка Todoist">
            ${option('Деньги и реклама','Мастерская · Деньги и реклама')}
            ${option('Связи','Мастерская · Связи')}
            ${option('Дела','Мастерская · Дела')}
            ${linkedBooks.map(b => option('book:' + b.id,'Книги · ' + b.title)).join('')}
          </select>
        </div>
        <div class="target-quick-input">
          <input type="text" name="text" required maxlength="500" placeholder="Написать таргетологу, запросить отчет…" aria-label="Дело или запись">
          <button class="primary" type="submit">Добавить</button>
        </div>
        <details class="target-details-toggle"><summary>Текст сообщения или подробности</summary><textarea name="detail" rows="3" placeholder="Что именно отправить или о чем договорились"></textarea></details>
      </form>
      ${requests.length ? `<div class="target-requests"><span class="small muted">Жду ответа</span>${requests.map(r=>`<div class="target-request"><span>${esc(r.what || 'Запрос')}, с ${fmtDate(r.since)}</span><button class="link" data-act="wait.answer" data-id="${esc(r.id)}">Ответили</button></div>`).join('')}</div>` : ''}
      ${entries.length ? `<div class="target-timeline">${entries.map(e => {
        if(e.entryType === 'task') return `<div class="target-entry ${e.done ? 'target-entry-done' : ''}">
          <div class="target-entry-main"><span class="target-entry-date">${fmtDate(e.date)}</span><span class="target-entry-type">Дело${e.done ? ' · сделано' : ''}</span>
            <div class="target-entry-text tap" data-act="target.edit" data-id="${esc(x.id)}" data-k="${esc(e.k)}" data-t="task" title="Изменить">${esc(e.text)}${e.detail ? `<p class="target-entry-detail">${esc(e.detail)}</p>` : ''}</div></div>
          <div class="target-entry-actions">${!e.done ? `<button class="link" data-act="link.todoDone" data-id="${esc(x.id)}" data-k="${esc(e.k)}">Готово</button>` : ''}
          <button class="icon-btn" data-act="target.edit" data-id="${esc(x.id)}" data-k="${esc(e.k)}" data-t="task" title="Изменить" aria-label="Изменить дело">${ic('pen')}</button>
          <button class="icon-btn" data-act="link.todoDel" data-id="${esc(x.id)}" data-k="${esc(e.k)}" title="Удалить дело" aria-label="Удалить дело">${ic('trash')}</button></div></div>`;
        const promoted = (x.todos || []).some(t=>t.sourceLogK===e.k);
        return `<div class="target-entry"><div class="target-entry-main"><span class="target-entry-date">${fmtDate(e.date)}</span><span class="target-entry-type">${esc({sent:'Написала',received:'Ответили',agreement:'Договорились',call:'Созвон',note:'Запись'}[e.kind]||'Запись')}</span>
          <div class="target-entry-text tap" data-act="target.edit" data-id="${esc(x.id)}" data-k="${esc(e.k)}" data-t="log" title="Изменить">${esc(e.text)}</div></div><div class="target-entry-actions">
          ${!promoted ? `<button class="link" data-act="target.logToTask" data-id="${esc(x.id)}" data-k="${esc(e.k)}" title="Создать дело на дату записи">В Планер</button>` : ''}
          <button class="icon-btn" data-act="target.edit" data-id="${esc(x.id)}" data-k="${esc(e.k)}" data-t="log" title="Изменить" aria-label="Изменить запись">${ic('pen')}</button>
          <button class="icon-btn" data-act="link.logDel" data-id="${esc(x.id)}" data-k="${esc(e.k)}" title="Удалить запись" aria-label="Удалить запись">${ic('trash')}</button></div></div>`;
      }).join('')}</div>` : '<p class="small muted target-empty">Пока нет записей. Добавьте дело с датой или заметку о разговоре.</p>'}
    </div>
  </section>`;
}

// ---------- страница связи ----------
export function linkPage(a, id) {
  if (id === 'mysite') return mySiteView(a); // дела по сайту из Планера ведут на страницу «Мой сайт»
  const c = a.ctx(), x = c.data.w_links.find((l) => l.id === id);
  if (!x) return { html: '<div class="card"><p>Связь не найдена.</p><a href="#" data-act="go" data-to="/links">← Связи</a></div>' };
  const reqs = c.data.w_waiting.filter((r) => r.contactId === x.id);
  const open = reqs.filter((r) => !r.done), log = [...(x.log || [])].sort((p, q) => q.date.localeCompare(p.date));
  const url = safeUrl(x.url);
  const todos = (x.todos || []).filter((td) => !td.done).sort((p2, q2) => p2.date.localeCompare(q2.date));
  const associated = (x.bookIds || []).map(bid => c.wbooksById[bid]?.title).filter(Boolean);
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/links">← Связи</a></p>
  <div class="card"><div class="row between"><h2 style="margin:0">${esc(x.name)}</h2><button class="small-btn" data-act="link.edit" data-id="${x.id}">Изменить</button></div>
    <div class="tags" style="margin-top:6px"><span class="tag on">${KIND1[x.kind || 'other']}</span>${x.net ? `<span class="tag">${esc(x.net)}</span>` : ''}</div>
    <div class="kv">${x.handle ? `<div><span>Ник / аккаунт</span><b>${esc(x.handle)}</b></div>` : ''}${x.contact ? `<div><span>Контакт</span><b>${esc(x.contact)}</b></div>` : ''}${lastLog(x) ? `<div><span>Последний раз</span><b>${fmtDate(lastLog(x))}</b></div>` : ''}</div>
    <div class="row">${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Открыть ${x.kind === 'social' ? 'страницу' : 'сайт'}</a>` : ''}${x.handle ? `<button data-act="copy" data-text="${esc(x.handle)}">Скопировать ник</button>` : ''}${x.contact ? `<button data-act="copy" data-text="${esc(x.contact)}">Скопировать контакт</button>` : ''}</div>
    ${x.kind === 'target' ? `<div class="target-details">${associated.length || x.campaignNote ? `<div class="small muted">${associated.length ? 'Книги: ' + associated.map(esc).join(' · ') : ''}${x.campaignNote ? (associated.length ? ' · ' : '') + esc(x.campaignNote) : ''}</div>` : ''}</div>` : ''}
    ${x.note ? `<p class="idea-text" style="margin-bottom:0">${esc(x.note)}</p>` : ''}</div>
  ${x.kind === 'target' ? targetWorkPanel(c,x) : `
  <div class="psec-h"><h2>Запросы <span class="muted">${open.length || ''}</span></h2><button class="small-btn" data-act="wait.new" data-contact="${x.id}">+ Запрос</button></div>
  ${open.length ? `<div class="card plist-card"><div class="plist">${open.map((r) => reqRow(c, r)).join('')}</div></div>` : '<div class="card"><p class="small muted" style="margin:0">Открытых запросов нет.</p></div>'}
  <div class="psec-h"><h2>Напоминания <span class="muted">${todos.length || ''}</span></h2><button class="small-btn" data-act="link.todo" data-id="${x.id}">+ Напомнить</button></div>
  ${todos.length ? `<div class="card plist-card"><div class="plist">${todos.map((td) => `<div class="pitem"><span class="dot k-waitans"${td.date > c.today ? ' style="opacity:.45"' : ''}></span><span class="pi-body"><span class="pi-t">${esc(td.text)}</span><span class="pi-s">${fmtDate(td.date)}${td.date < c.today ? ' · просрочено' : td.date === c.today ? ' · сегодня' : ''}</span></span><span class="pi-btns"><button data-act="link.todoDone" data-id="${x.id}" data-k="${esc(td.k)}">Сделано</button><button class="icon-btn" data-act="link.todoDel" data-id="${x.id}" data-k="${esc(td.k)}" aria-label="Удалить напоминание">${ic('trash')}</button></span></div>`).join('')}</div></div>` : '<div class="card"><p class="small muted" style="margin:0">Написать, позвонить, отправить — поставьте дату, и это появится в Планере в нужный день.</p></div>'}
  <div class="psec-h"><h2>${x.kind === 'target' ? 'Переписка и договоренности' : 'История общения'}</h2></div>
  <div class="card">
    <form data-form="link.log" data-id="${x.id}" class="link-log-form"><input type="date" name="date" value="${c.today}" aria-label="Дата">${x.kind === 'target' ? `<select name="logKind" aria-label="Тип записи"><option value="sent">Написала</option><option value="received">Ответили</option><option value="agreement">Договорились</option><option value="call">Созвон</option><option value="note">Заметка</option></select>` : ''}<input name="text" placeholder="${x.kind === 'target' ? 'Что обсудили, решили или ждешь в ответ…' : 'Что было: письмо, звонок, договоренность…'}" aria-label="Запись" required><button class="primary" type="submit">Записать</button></form>
    ${log.length ? `<div class="list" style="margin-top:8px">${log.map((l) => `<div class="item row between"><span><span class="sub">${fmtDate(l.date)}</span>${x.kind === 'target' && l.kind ? `<span class="target-log-kind">${esc({ sent: 'Написала', received: 'Ответили', agreement: 'Договорились', call: 'Созвон', note: 'Заметка' }[l.kind] || 'Запись')}</span>` : ''}${esc(l.text)}</span><button class="icon-btn" data-act="link.logDel" data-id="${x.id}" data-k="${esc(l.k)}" aria-label="Удалить запись">${ic('trash')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">Записей пока нет. Запросы и ответы попадают сюда сами.</p>'}
  </div>`}`;
  return { html };
}

// ---------- добавить / изменить ----------
function linkForm(x = {}) {
  const c = app().ctx();
  const k = x.kind || 'publisher';
  return `<div class="f2"><div><label for="lk" style="margin-top:0">Что это</label><select id="lk" name="kind" data-chg="link.kind">${Object.keys(LKINDS).map((v) => opt(v, KIND1[v], k)).join('')}</select></div>
    <div><label for="ln" style="margin-top:0">Название / имя</label><input id="ln" name="name" value="${esc(x.name || '')}" required></div></div>
    <label for="lnet">Сеть или площадка (для соцсетей и площадок)</label><input id="lnet" name="net" list="lnets" value="${esc(x.net || '')}"><datalist id="lnets">${[...NETS, ...PLATS].map((v) => `<option value="${v}">`).join('')}</datalist>
    <div class="f2"><div><label for="lh">Ник / аккаунт</label><input id="lh" name="handle" value="${esc(x.handle || '')}" placeholder="@lana_freytag"></div>
    <div><label for="lc">Контакт</label><input id="lc" name="contact" value="${esc(x.contact || '')}" placeholder="почта, телефон, телеграм"></div></div>
    <label for="lu">Ссылка</label><input id="lu" name="url" value="${esc(x.url || '')}" placeholder="сайт, страница, профиль">
    <div class="target-config" ${k === 'target' ? '' : 'hidden'}><div class="target-config-title">Сотрудничество с таргетологом</div>
      <label for="targetStatus">Статус</label><select id="targetStatus" name="partnerStatus">${[['active','Работаем'],['paused','На паузе'],['done','Завершено']].map(([id,title])=>opt(id,title,x.partnerStatus||'active')).join('')}</select>
      <label>Книги, над которыми работает</label><div class="target-book-list">${c.wbooks.map(b => `<label class="check"><input type="checkbox" name="bookIds" value="${esc(b.id)}" ${(x.bookIds || []).includes(b.id) ? 'checked' : ''}>${esc(b.title)}</label>`).join('') || '<span class="small muted">Пока нет книг в Мастерской</span>'}</div>
      <label for="campaignNote">Кампании / зона ответственности</label><input id="campaignNote" name="campaignNote" value="${esc(x.campaignNote || '')}" placeholder="Например: Альпийский развод, реклама Литнета">
      <div class="target-sync-opts"><label class="check"><input type="checkbox" name="showDirect" ${x.showDirect ? 'checked' : ''}>Показывать контакт в «Директе»</label><label class="check"><input type="checkbox" name="showIncome" ${x.showIncome ? 'checked' : ''}>Показывать в «Доходах» → «Реклама»</label></div>
      <p class="small muted">Задачи с датами автоматически видны в Планере. Контакт и переписка не создают расходов и не меняют статистику.</p>
    </div>
    <label for="lnote">Заметки</label><textarea id="lnote" name="note" placeholder="условия, кто отвечает, что важно помнить">${esc(x.note || '')}</textarea>`;
}
const linkFrom = (fd) => ({ kind: fd.get('kind'), name: (fd.get('name') || '').trim(), net: (fd.get('net') || '').trim(), handle: (fd.get('handle') || '').trim(), contact: (fd.get('contact') || '').trim(), url: (fd.get('url') || '').trim(), note: fd.get('note') || '', ...(fd.get('kind') === 'target' ? { partnerStatus: fd.get('partnerStatus') || 'active', bookIds: fd.getAll('bookIds'), campaignNote: (fd.get('campaignNote') || '').trim(), showDirect: fd.has('showDirect'), showIncome: fd.has('showIncome') } : {}) });
// Тип контакта меняет дополнительные поля, не теряя набранный текст.
changes['link.kind'] = (v, el) => { const extra = el.closest('form')?.querySelector('.target-config'); if(extra) extra.hidden = v !== 'target'; };
acts['link.new'] = (d) => openSheet('Новая связь', linkForm({ kind: d?.kind }), async (fd) => {
  const id = 'l' + uid(), v = linkFrom(fd);
  await app().store.put('w_links', { id, ...v, log: [], createdAt: new Date().toISOString() });
  // старые запросы с тем же именем — сразу привязываем к новой связи
  for (const r of app().ctx().data.w_waiting) if (!r.contactId && (r.who || '').trim().toLowerCase() === v.name.toLowerCase()) await app().store.put('w_waiting', { ...r, contactId: id });
  app().go('/link/' + id);
}, { submitText: 'Добавить' });
acts['link.edit'] = (d) => {
  const x = app().ctx().data.w_links.find((l) => l.id === d.id);
  openSheet('Связь', linkForm(x) + `<p><button type="button" class="link danger" data-act="link.del" data-id="${x.id}">Удалить связь</button></p>`, async (fd) => { await app().store.patch('w_links', x.id, linkFrom(fd)); });
};
acts['link.del'] = async (d) => {
  if (!(await ask('Удалить связь вместе с историей общения? Запросы останутся.', 'Удалить'))) return;
  await app().store.remove('w_links', d.id);
  app().go('/links');
};
// запись в историю общения (используется и запросами)
export async function addLog(contactId, date, text) {
  const x = app().ctx().data.w_links.find((l) => l.id === contactId);
  if (!x || !text) return;
  await app().store.patch('w_links', x.id, { log: [...(x.log || []), { k: uid(), date, text }] });
}
forms['link.log'] = async (fd, f) => {
  const text = (fd.get('text') || '').trim();
  if (!text) return;
  const x = app().ctx().data.w_links.find(l => l.id === f.dataset.id);
  if (!x) return false;
  const kind = x.kind === 'target' ? String(fd.get('logKind') || 'note') : '';
  await app().store.patch('w_links', x.id, { log: [...(x.log || []), { k: uid(), date: fd.get('date') || app().ctx().today, text, ...(kind ? { kind } : {}) }] });
};
acts['link.logDel'] = async (d) => {
  const x = app().ctx().data.w_links.find((l) => l.id === d.id);
  await app().store.put('w_links', { ...x, log: (x.log || []).filter((l) => l.k !== d.k) });
};

// ---------- запросы (раньше «Жду ответа»): кому, о чём, когда напомнить ----------
function waitForm(c, x = {}) {
  return `<label for="wc" style="margin-top:0">Кому</label><select id="wc" name="contactId"><option value="">— вписать вручную —</option>${[...c.data.w_links].sort((p, q) => (p.name || '').localeCompare(q.name || '', 'ru')).map((l) => opt(l.id, l.name, x.contactId)).join('')}</select>
  <input name="who" value="${esc(x.contactId ? '' : x.who || '')}" placeholder="или впишите: редактор, конкурс, площадка…" aria-label="Кому" style="margin-top:6px">
  <label for="wq">Что отправила / о чём</label><textarea id="wq" name="what" placeholder="рукопись, заявка на конкурс, вопрос по договору…">${esc(x.what || '')}</textarea>
  <div class="f2"><div><label for="wsi">Отправила</label><input id="wsi" type="date" name="since" value="${x.since || c.today}" required></div><div><label for="wr">Напомнить через, дней</label><input id="wr" name="remindDays" inputmode="numeric" value="${x.remindDays ?? 14}"></div></div>`;
}
const waitFrom = (c, fd) => {
  const l = c.data.w_links.find((v) => v.id === fd.get('contactId'));
  return { contactId: l ? l.id : '', who: l ? l.name : (fd.get('who') || '').trim(), what: (fd.get('what') || '').trim(), since: fd.get('since'), remindDays: N(fd.get('remindDays')) || 14 };
};
acts['wait.new'] = (d) => {
  const c = app().ctx();
  openSheet('Новый запрос', waitForm(c, { contactId: d?.contact || '' }), async (fd) => {
    const v = waitFrom(c, fd);
    if (!v.who) { toast('Выберите, кому, или впишите'); return false; }
    await app().store.put('w_waiting', { id: 'a' + uid(), ...v, done: false });
    if (v.contactId) await addLog(v.contactId, v.since, `Отправила${v.what ? ': ' + v.what : ''}`);
  }, { submitText: 'Добавить' });
};
acts['wait.edit'] = (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  openSheet('Запрос', waitForm(c, x) + `<p><button type="button" class="link danger" data-act="wait.del" data-id="${x.id}">Удалить запрос</button></p>`, async (fd) => {
    const v = waitFrom(c, fd);
    if (!v.who) { toast('Выберите, кому, или впишите'); return false; }
    await app().store.put('w_waiting', { ...x, ...v });
  });
};
acts['wait.del'] = async (d) => { if (await ask('Удалить запрос?', 'Удалить')) await app().store.remove('w_waiting', d.id); };
acts['wait.nudge'] = async (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  await app().store.put('w_waiting', { ...x, since: c.today });
  if (x.contactId) await addLog(x.contactId, c.today, `Напомнила о себе${x.what ? ': ' + x.what : ''}`);
  toast('Отметила — снова отсчитываю дни');
};
acts['wait.answer'] = (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  openSheet('Ответили', `<label for="wa" style="margin-top:0">Что ответили (необязательно)</label><textarea id="wa" name="answer"></textarea>`, async (fd) => {
    const answer = (fd.get('answer') || '').trim();
    await app().store.put('w_waiting', { ...x, done: true, answer, answeredAt: c.today });
    if (x.contactId) await addLog(x.contactId, c.today, `Ответили${x.what ? ' (' + x.what + ')' : ''}${answer ? ': ' + answer : ''}`);
  }, { submitText: 'Сохранить' });
};

// Одна точка создания связанных дел из карточки и Планера. Дело хранится в
// контакте, откуда автоматически идет в Планер и в правильный раздел Todoist.
export async function addLinkedTask(contactId, { date, text, section = '', detail = '', sourceLogK = '' }) {
  const c=app().ctx(), contact=c.data.w_links.find(l=>l.id===contactId);
  if(!contact) throw new Error('Контакт не найден');
  const dateOK=/^\d{4}-\d{2}-\d{2}$/.test(date || '');
  if(!dateOK || !String(text || '').trim()) throw new Error('Укажите дело и дату');
  const bookId=String(section || '').startsWith('book:') ? section.slice(5) : '';
  if(bookId && !c.wbooksById[bookId]) throw new Error('Книга больше не найдена');
  const task={ k:uid(), date, text:String(text).trim(), detail:String(detail || '').trim(), done:false,
    section:bookId ? '' : section || (contact.kind === 'target' ? 'Деньги и реклама' : 'Связи'),
    ...(bookId ? { bookId } : {}), ...(sourceLogK ? { sourceLogK } : {}) };
  // Читаем текущую запись перед записью: не заменяем историю старой копией карточки.
  const latest=app().ctx().data.w_links.find(l=>l.id===contactId);
  await app().store.patch('w_links', contactId, { todos: [...(latest.todos || []),task] });
  app().scheduleTodoist?.();
  return task;
}
changes['target.entryType'] = (v, el) => {
  const form=el.closest('form');
  const folder=form?.querySelector('select[name="section"]');
  if(folder) { folder.disabled=v==='log'; folder.closest('.target-quick-grid')?.classList.toggle('target-log-mode',v==='log'); }
  const input=form?.querySelector('input[name="text"]');
  if(input) input.placeholder=v==='log' ? 'Что обсудили или о чем договорились…' : 'Написать таргетологу, запросить отчет…';
  const submit=form?.querySelector('button[type="submit"]');
  if(submit) submit.textContent=v==='log' ? 'Записать' : 'Добавить';
};
forms['target.entry']=async(fd,form)=>{
  const contactId=form.dataset.id, text=String(fd.get('text') || '').trim();
  const date=String(fd.get('date') || ''),detail=String(fd.get('detail') || '').trim();
  if(!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {toast('Укажите текст и дату');return false;}
  try {
    if(fd.get('entryType')==='log') {
      const x=app().ctx().data.w_links.find(l=>l.id===contactId);
      await app().store.patch('w_links', contactId, { log:[...(x.log || []),{k:uid(),date,kind:'note',text:detail ? text+'\n'+detail : text}] });
      toast('Сохранено в истории');
    } else {
      await addLinkedTask(contactId,{date,text,detail,section:String(fd.get('section') || 'Деньги и реклама')});
      toast('Дело добавлено в Планер' + (app().ctx().settings.todoistToken ? ' · Todoist синхронизируется' : ''));
    }
  } catch(e) {toast('Не получилось сохранить: '+e.message);return false;}
};
// правка дела или записи в «Общении и делах»: текст, подробности, дата (у записи — ещё вид); дело само обновится в Планере и Todoist
const LOG_KINDS={sent:'Написала',received:'Ответили',agreement:'Договорились',call:'Созвон',note:'Запись'};
acts['target.edit']=(d)=>{
  const x=app().ctx().data.w_links.find(l=>l.id===d.id), task=d.t==='task';
  const e=(task ? x?.todos : x?.log || [])?.find(y=>y.k===d.k);
  if(!e) return false;
  openSheet(task ? 'Дело' : 'Запись', task
    ? `<label for="teT" style="margin-top:0">Что сделать</label><input id="teT" name="text" required maxlength="500" value="${esc(e.text||'')}">
       <label for="teD">Текст сообщения или подробности</label><textarea id="teD" name="detail" rows="6">${esc(e.detail||'')}</textarea>
       <label for="teW">Когда</label><input id="teW" type="date" name="date" value="${esc(e.date||'')}" required>`
    : `<div class="f2"><div><label for="teK" style="margin-top:0">Что было</label><select id="teK" name="kind">${Object.entries(LOG_KINDS).map(([k,v])=>opt(k,v,e.kind||'note')).join('')}</select></div>
       <div><label for="teW" style="margin-top:0">Когда</label><input id="teW" type="date" name="date" value="${esc(e.date||'')}" required></div></div>
       <label for="teT">Текст</label><textarea id="teT" name="text" rows="6" required>${esc(e.text||'')}</textarea>`, async(fd)=>{
    const text=String(fd.get('text')||'').trim(), date=String(fd.get('date')||'');
    if(!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Укажите текст и дату');return false;}
    const cur=app().ctx().data.w_links.find(l=>l.id===d.id);
    if(task){
      await app().store.patch('w_links',cur.id,{todos:(cur.todos||[]).map(t=>t.k===d.k?{...t,text,date,detail:String(fd.get('detail')||'').trim()}:t)});
      app().scheduleTodoist?.();
    } else await app().store.patch('w_links',cur.id,{log:(cur.log||[]).map(l=>l.k===d.k?{...l,text,date,kind:String(fd.get('kind')||'note')}:l)});
    toast('Сохранено');
  },{submitText:'Сохранить'});
  return false;
};
acts['target.logToTask']=async(d)=>{
  const x=app().ctx().data.w_links.find(l=>l.id===d.id),entry=(x?.log || []).find(l=>l.k===d.k);
  if(!entry) return;
  if((x.todos || []).some(t=>t.sourceLogK===entry.k)){toast('Это дело уже в Планере');return;}
  try {
    await addLinkedTask(x.id,{date:entry.date >= app().ctx().today ? entry.date : app().ctx().today,
      text:'Отправить сообщение — '+x.name,detail:entry.text,sourceLogK:entry.k});
    toast('Сообщение добавлено в Планер');
  } catch(e){toast('Не удалось создать дело: '+e.message);}
};

// напоминания по связи: дата + что сделать → в Планере и на Главной
acts['link.todo'] = (d) => {
  const c = app().ctx(), x = c.data.w_links.find((l) => l.id === d.id);
  openSheet(`Напомнить — ${x.name}`, `<label for="tdt" style="margin-top:0">Что сделать</label><input id="tdt" name="text" required placeholder="написать редактору, отправить синопсис, выложить пост…">
    <label for="tdd">Когда</label><input id="tdd" type="date" name="date" value="${addDays(c.today, 1)}" required>`, async (fd) => {
    const text = (fd.get('text') || '').trim();
    if (!text) { toast('Напишите, что сделать'); return false; }
    await app().store.put('w_links', { ...x, todos: [...(x.todos || []), { k: uid(), date: fd.get('date'), text, done: false }] });
    toast('Напомню в Планере');
  }, { submitText: 'Добавить' });
};
acts['link.todoDone'] = async (d) => {
  const c = app().ctx(), x = c.data.w_links.find((l) => l.id === d.id), td = (x.todos || []).find((t) => t.k === d.k);
  await app().store.patch('w_links', x.id, { todos: (x.todos || []).map(t => (t.k === d.k ? { ...t, done: true, doneAt: c.today } : t)), log: [...(x.log || []), { k: uid(), date: c.today, kind:'note', text: td ? 'Сделано: '+td.text : 'Сделано' }] });
  app().scheduleTodoist?.();
  toast('Сделано — отмечено в Планере');
};
acts['link.todoDel'] = async (d) => {
  const x = app().ctx().data.w_links.find((l) => l.id === d.id);
  await app().store.patch('w_links', x.id, { todos: (x.todos || []).filter(t => t.k !== d.k) });
  app().scheduleTodoist?.();
};
// все открытые напоминания по связям — для Планера и Главной
export const linkTodos = (c) => (c.data.w_links || []).flatMap((x) => (x.todos || []).filter((t) => !t.done).map((t) => ({ ...t, linkId: x.id, name: x.name })));
