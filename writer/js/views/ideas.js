import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, uid, ask } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import * as drive from '../drive.js';

const app = () => window.__app;
const tagsOf = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// Статусы идей: активные — новые и в работе; использованные и архив — отдельно, чтобы не мешали
export const IST = { new: 'Новая', work: 'В работе', used: 'Использована', archive: 'В архиве' };
const ACTIVE = (x) => !x.status || x.status === 'new' || x.status === 'work';
const matches = (x, q, c) => {
  if (!q) return true;
  const hay = [x.title, x.text, ...(x.tags || []), ...(x.comments || []).map((m) => m.text), x.bookId ? c.wbooksById[x.bookId]?.title : ''].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

export function ideasView(a) {
  const c = a.ctx(), ui = a.ui;
  const q = ui.ideaQ || '', fb = ui.ideaBook || '', fs = ui.ideaSt || 'active';
  const all = [...c.data.w_ideas].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const list = all.filter((x) => (fs === 'all' ? true : fs === 'active' ? ACTIVE(x) : x.status === fs)
    && (!fb || (fb === '-' ? !x.bookId : x.bookId === fb)) && matches(x, q, c));
  // группы по книгам: где идея свежее — выше; «Без книги» — в конце
  const groups = new Map();
  for (const x of list) { const k = x.bookId && c.wbooksById[x.bookId] ? x.bookId : '-'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const keys = [...groups.keys()].sort((a2, b2) => (a2 === '-') - (b2 === '-'));
  const cnt = (st) => all.filter((x) => (st === 'active' ? ACTIVE(x) : x.status === st)).length;
  const booksWithIdeas = c.wbooks.filter((b) => all.some((x) => x.bookId === b.id));
  const openAll = keys.length <= 4 || !!fb || !!q; // групп немного — раскрыты все; много — свёрнуты, видно счётчики
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Идеи</h2><button class="primary" data-act="idea.new" data-book="${fb && fb !== '-' ? fb : ''}">+ Идея</button></div>
  <div class="card idea-filter">
    <input type="search" value="${esc(q)}" placeholder="Поиск по идеям: слово из названия, текста, метки…" data-chg="idea.q" aria-label="Поиск по идеям">
    <div class="f2"><div><select data-chg="idea.book" aria-label="Книга"><option value="">Все книги</option>${booksWithIdeas.map((b) => opt(b.id, b.title, fb)).join('')}<option value="-"${fb === '-' ? ' selected' : ''}>Без книги</option></select></div>
    <div><select data-chg="idea.st" aria-label="Статус">${opt('active', `Активные (${cnt('active')})`, fs)}${opt('used', `Использованные (${cnt('used')})`, fs)}${opt('archive', `Архив (${cnt('archive')})`, fs)}${opt('all', `Все (${all.length})`, fs)}</select></div></div>
    ${q || fb || fs !== 'active' ? '<button class="link" style="padding:0" data-act="idea.reset">Сбросить фильтры</button>' : ''}
  </div>
  ${list.length ? keys.map((k) => {
    const items = groups.get(k), b = k === '-' ? null : c.wbooksById[k];
    const open = openAll || items.some((x) => x.id === ui.openIdea);
    return `<details class="card idea-group" ${open ? 'open' : ''}><summary><span>${b ? ic('books') + ' ' + esc(b.title) : 'Без книги'}</span><span class="muted small">${items.length}</span></summary>
      <div class="list">${items.map((x) => ideaRow(c, x, ui.openIdea === x.id)).join('')}</div></details>`;
  }).join('') : `<div class="card"><p class="muted" style="margin:0">${all.length ? 'Ничего не нашлось — попробуйте другое слово или сбросьте фильтры.' : 'Идей пока нет. Запишите первую — она не потеряется и будет доступна с телефона.'}</p></div>`}`;
  return { html };
}

// строка идеи: коротко; нажали — раскрывается с текстом, комментариями и действиями
function ideaRow(c, x, open) {
  const comments = x.comments || [];
  const st = x.status || 'new';
  const head = `<div class="row between idea-head" role="button" tabindex="0" data-act="idea.toggle" data-id="${x.id}"><span><b>${esc(x.title || (x.text || '').slice(0, 60) || 'Без названия')}</b>${st !== 'new' ? ` <span class="badge">${IST[st]}</span>` : ''}</span><span class="small muted">${x.createdAt ? fmtDate(x.createdAt.slice(0, 10)) : ''}${comments.length ? ` · ${comments.length} комм.` : ''}</span></div>`;
  if (!open) return `<div class="item idea" id="idea-${x.id}">${head}${x.text ? `<div class="small muted idea-snip">${esc(x.text.slice(0, 120))}${x.text.length > 120 ? '…' : ''}</div>` : ''}</div>`;
  return `<div class="item idea open" id="idea-${x.id}">${head}
    ${x.text ? `<p class="idea-text">${esc(x.text)}</p>` : ''}
    <div class="tags">${(x.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}${x.fileLink ? `<a class="tag on" href="${esc(x.fileLink)}" target="_blank" rel="noopener">${ic('doc')} ${esc(x.fileName || 'документ')}</a>` : ''}</div>
    <div class="row" style="margin-top:8px"><select data-chg="idea.setSt" data-id="${x.id}" aria-label="Статус идеи" style="width:auto">${Object.entries(IST).map(([k, v]) => opt(k, v, st)).join('')}</select>
      <button class="link" data-act="idea.edit" data-id="${x.id}">Изменить</button>
      <button class="link danger" data-act="idea.quickDel" data-id="${x.id}">Удалить</button>
      ${!x.fileLink && drive.isConnected() && c.settings.wBooksFolder ? `<button class="link" data-act="idea.doc" data-id="${x.id}">Превратить в документ</button>` : ''}</div>
    <div class="comments">${comments.map((m, i) => `<div class="comment"><div class="small muted">${fmtDate((m.at || '').slice(0, 10))}</div><div>${esc(m.text)}</div><button class="link danger" data-act="idea.delComment" data-id="${x.id}" data-i="${i}">убрать</button></div>`).join('')}
      <form data-form="idea.comment" data-id="${x.id}" class="row"><input name="text" placeholder="Комментарий" style="flex:1" aria-label="Комментарий"><button class="primary" type="submit">Добавить</button></form></div>
  </div>`;
}

function ideaForm(c, x = {}) {
  return `<label for="it">Коротко</label><input id="it" name="title" value="${esc(x.title || '')}" placeholder="например: сцена в горах, он возвращается">
    <label for="ix">Подробнее</label><textarea id="ix" name="text" style="min-height:140px">${esc(x.text || '')}</textarea>
    <label for="ig">Метки через запятую (необязательно — для поиска)</label><input id="ig" name="tags" value="${esc((x.tags || []).join(', '))}" placeholder="сюжет, герой, название">
    <div class="f2"><div><label for="ib">К какой книге</label><select id="ib" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select></div>
    <div><label for="is">Статус</label><select id="is" name="status">${Object.entries(IST).map(([k, v]) => opt(k, v, x.status || 'new')).join('')}</select></div></div>
    <label for="il">Ссылка на файл (необязательно)</label><input id="il" name="fileLink" value="${esc(x.fileLink || '')}" placeholder="ссылка на документ Google Диска">`;
}
const fromForm = (fd) => ({ title: (fd.get('title') || '').trim(), text: (fd.get('text') || '').trim(), tags: tagsOf(fd.get('tags')), bookId: fd.get('bookId') || '', status: fd.get('status') || 'new', fileLink: (fd.get('fileLink') || '').trim() });

changes['idea.q'] = (v) => { app().ui.ideaQ = v.trim(); app().rerender(); };
changes['idea.book'] = (v) => { app().ui.ideaBook = v; app().rerender(); };
changes['idea.st'] = (v) => { app().ui.ideaSt = v; app().rerender(); };
acts['idea.reset'] = () => { const u = app().ui; u.ideaQ = ''; u.ideaBook = ''; u.ideaSt = 'active'; };
changes['idea.setSt'] = async (v, el) => { const x = app().ctx().data.w_ideas.find((i) => i.id === el.dataset.id); await app().store.put('w_ideas', { ...x, status: v }); toast(`Идея: ${IST[v].toLowerCase()}`); };
acts['idea.newFor'] = (d) => acts['idea.new'](d); // «+ Идея» на странице книги — книга уже выбрана
// со страницы книги: идеи этой книги, нужная — раскрыта
acts['idea.open'] = (d) => {
  const a = app();
  a.ui.ideaBook = d.book || ''; a.ui.ideaQ = ''; a.ui.ideaSt = 'all'; a.ui.openIdea = d.id || null;
  a.go('/ideas');
  if (d.id) setTimeout(() => document.getElementById('idea-' + d.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
};
acts['idea.toggle'] = (d) => { app().ui.openIdea = app().ui.openIdea === d.id ? null : d.id; };
acts['idea.new'] = (d) => {
  const c = app().ctx();
  openSheet('Новая идея', ideaForm(c, d?.book ? { bookId: d.book } : {}), async (fd) => {
    const v = fromForm(fd);
    if (!v.title && !v.text) { toast('Напишите хотя бы пару слов'); return false; }
    await app().store.put('w_ideas', { id: 'i' + uid(), ...v, comments: [], createdAt: new Date().toISOString() });
    toast('Идея сохранена');
  });
};
acts['idea.edit'] = (d) => {
  const c = app().ctx(), x = c.data.w_ideas.find((i) => i.id === d.id);
  openSheet('Идея', ideaForm(c, x) + `<p><button type="button" class="link danger" data-act="idea.del" data-id="${x.id}">Удалить идею</button></p>`, async (fd) => {
    await app().store.put('w_ideas', { ...x, ...fromForm(fd), fileName: fromForm(fd).fileLink === x.fileLink ? x.fileName : '' });
  });
};
acts['idea.del'] = async (d) => {
  if (!(await ask('Удалить идею вместе с комментариями?'))) return;
  await app().store.remove('w_ideas', d.id);
};
// быстрое удаление: без вопроса, но с «Вернуть» в подсказке
acts['idea.quickDel'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  if (!x) return;
  await app().store.remove('w_ideas', x.id);
  toast('Идея удалена', { undo: async () => { await app().store.put('w_ideas', x); toast('Идея возвращена'); } });
};
forms['idea.comment'] = async (fd, f) => {
  const text = (fd.get('text') || '').trim();
  if (!text) return;
  const x = app().ctx().data.w_ideas.find((i) => i.id === f.dataset.id);
  await app().store.put('w_ideas', { ...x, comments: [...(x.comments || []), { text, at: new Date().toISOString() }] });
};
acts['idea.delComment'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  await app().store.put('w_ideas', { ...x, comments: (x.comments || []).filter((_, i) => i !== Number(d.i)) });
};
acts['idea.doc'] = async (d) => {
  const c = app().ctx(), x = c.data.w_ideas.find((i) => i.id === d.id);
  try { await drive.ensureToken(); } catch (e) { toast(e.message); return; }
  try {
    const body = [x.title, x.text, ...(x.comments || []).map((m) => '— ' + m.text)].filter(Boolean).join('\n\n');
    const f = await drive.createDoc('Идея: ' + (x.title || x.text.slice(0, 40)), c.settings.wIdeasFolder || c.settings.wBooksFolder, body);
    await app().store.put('w_ideas', { ...x, fileLink: f.webViewLink, fileName: f.name, fileId: f.id });
    toast('Документ создан на Google Диске');
  } catch (e) { toast(e.message); }
};
export { changes };
