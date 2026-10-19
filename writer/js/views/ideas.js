import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, uid, ask } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import * as drive from '../drive.js';

const app = () => window.__app;
const tagsOf = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

import { KINDS, isDone, isOpen, ideaKind, bookGuess, chapterRef, ideaTitle, expired } from '../ideacalc.js';
import { chapterList } from '../wcalc.js';

// Идеи и заметки. Статусов два: открытая и «Готово» (галочкой, как задача); удалённые — в корзине 30 дней.
// Само раскладывается: книга — по словам в тексте, вид (правка, сцена, персонаж, название, идея) и глава — тоже.
export const IST = { new: 'Открыта', used: 'Готово' };
const matches = (x, q, c) => {
  if (!q) return true;
  const hay = [x.title, x.text, ...(x.tags || []), ...(x.comments || []).map((m) => m.text), x.bookId ? c.wbooksById[x.bookId]?.title : '', KINDS[ideaKind(x)]].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

export function ideasView(a) {
  const c = a.ctx(), ui = a.ui;
  const q = ui.ideaQ || '', fb = ui.ideaBook || '', done = ui.ideaSt === 'done';
  const trash = c.data.w_ideas.filter((x) => x.deletedAt);
  const live = c.data.w_ideas.filter((x) => !x.deletedAt);
  const inBook = (x) => !fb || (fb === '-' ? !(x.bookId && c.wbooksById[x.bookId]) : x.bookId === fb);
  const list = live.filter((x) => (done ? isDone(x) : !isDone(x)) && inBook(x) && matches(x, q, c))
    .sort((x, y) => (done ? (y.doneAt || y.createdAt || '').localeCompare(x.doneAt || x.createdAt || '') : (y.createdAt || '').localeCompare(x.createdAt || '')));
  const nOpen = live.filter((x) => !isDone(x) && inBook(x)).length, nDone = live.filter((x) => isDone(x) && inBook(x)).length;
  // книги — кнопками: у каждой число записей во вкладке (открытых или готовых)
  const inTab = (x) => (done ? isDone(x) : !isDone(x));
  const openBy = (id) => live.filter((x) => inTab(x) && (id === '-' ? !(x.bookId && c.wbooksById[x.bookId]) : x.bookId === id)).length;
  const bookChips = [['', 'Все', live.filter(inTab).length], ...c.wbooks.filter((b) => live.some((x) => x.bookId === b.id)).map((b) => [b.id, b.title.split(/[.!?:]/)[0], openBy(b.id)]), ['-', 'Без книги', openBy('-')]]
    .filter(([id, , n]) => !id || n || fb === id || live.some((x) => (id === '-' ? !x.bookId : x.bookId === id)));
  // группы по книгам (когда выбраны «Все»); «Без книги» — в конце
  const groups = new Map();
  for (const x of list) { const k = x.bookId && c.wbooksById[x.bookId] ? x.bookId : '-'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const keys = [...groups.keys()].sort((a2, b2) => (a2 === '-') - (b2 === '-'));
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Идеи и заметки</h2><button class="primary" data-act="idea.new" data-book="${fb && fb !== '-' ? fb : ''}">+ Записать</button></div>
  <div class="card idea-filter">
    <input type="search" value="${esc(q)}" placeholder="Поиск: слово из текста, книга, «правка», «глава 5»…" data-chg="idea.q" aria-label="Поиск по идеям">
    <div class="seg idea-seg"><button class="${done ? '' : 'on'}" data-act="idea.st" data-v="open">Открытые · ${nOpen}</button><button class="${done ? 'on' : ''}" data-act="idea.st" data-v="done">Готово · ${nDone}</button></div>
    <div class="chips idea-books">${bookChips.map(([id, t, n]) => `<button class="chip ${fb === id ? 'on' : ''}" data-act="idea.book" data-v="${id}">${esc(t)}${n ? ` <span class="muted">${n}</span>` : ''}</button>`).join('')}</div>
  </div>
  ${list.length ? (fb ? `<div class="card"><div class="list">${list.map((x) => ideaRow(c, x, ui.openIdea === x.id)).join('')}</div></div>` : keys.map((k) => {
    const items = groups.get(k), b = k === '-' ? null : c.wbooksById[k];
    return `<div class="card idea-group"><div class="ig-head"><span class="ig-h">${b ? (b.cover ? `<img class="ig-cover" src="${b.cover}" alt="">` : `<span class="ig-cover ig-ph">${esc(b.title.slice(0, 1))}</span>`) : `<span class="ig-cover ig-none">${ic('ideas')}</span>`}<span class="ig-t"><b>${b ? esc(b.title) : 'Без книги'}</b><span class="ig-n">${items.length} ${plural(items.length, ['запись', 'записи', 'записей'])}</span></span></span></div>
      <div class="list">${items.map((x) => ideaRow(c, x, ui.openIdea === x.id)).join('')}</div></div>`;
  }).join('')) : `<div class="card"><p class="muted" style="margin:0">${q || fb ? 'Ничего не нашлось — попробуйте другое слово или «Все».' : done ? 'Здесь появится то, что вы отметили галочкой как сделанное.' : 'Пусто. Запишите мысль — книгу, главу и вид записи приложение определит само.'}</p></div>`}
  ${c.settings.todoistToken && !done ? '<p class="small muted idea-hint">С телефона: задача в Todoist с меткой <b>идея</b> появится здесь сама; галочка в Todoist — и тут «Готово».</p>' : ''}
  ${trash.length ? `<div class="trash-link"><button class="link" data-act="idea.trash">${ic('trash')} Корзина (${trash.length})</button></div>` : ''}`;
  return { html, after: () => { sweepIdeaDocs(); purgeOld(); } };
}

// корзина чистится сама: старше 30 дней — навсегда
let purged = false;
function purgeOld() {
  if (purged) return; purged = true;
  for (const x of app().ctx().data.w_ideas.filter((y) => expired(y))) app().store.remove('w_ideas', x.id);
}

// превью: без разметки (##, **, списки), в одну-две строки
const plainSnip = (t) => String(t).replace(/^#+\s*/gm, '').replace(/[*_`>#]+/g, '').replace(/^\s*[-–—•]\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 220);
// строка: галочка «Готово», заголовок, серой строкой — вид, глава, дата; нажали — раскрывается
function ideaRow(c, x, open) {
  const comments = x.comments || [], done = isDone(x), kind = ideaKind(x), ch = chapterRef(`${x.title || ''} ${x.text || ''}`);
  const b = x.bookId ? c.wbooksById[x.bookId] : null;
  const chTab = ch && b ? chapterList(b).find((t) => t.title.trim().toLowerCase() === ch.title.toLowerCase()) : null;
  const title = ideaTitle(x), body = x.title ? x.text : String(x.text || '').split('\n').slice(1).join('\n').trim();
  const sub = [KINDS[kind], ch?.label, done && x.doneAt ? `сделано ${fmtDate(x.doneAt.slice(0, 10))}` : x.createdAt ? fmtDate(x.createdAt.slice(0, 10)) : '', comments.length ? `${comments.length} комм.` : '', x.fileLink ? 'документ' : ''].filter(Boolean).join(' · ');
  const head = `<div class="idea-head"><button class="idea-ok${done ? ' on' : ''}" data-act="idea.done" data-id="${x.id}" title="${done ? 'Вернуть в открытые' : 'Готово'}" aria-label="${done ? 'Вернуть в открытые' : 'Готово'}">${ic('check')}</button>
    <span class="idea-main" role="button" tabindex="0" data-act="idea.toggle" data-id="${x.id}"><b class="${done ? 'idea-done' : ''}">${esc(title)}</b><span class="idea-sub">${sub}</span></span></div>`;
  const pick = !x.bookId && c.wbooks.length ? `<div class="idea-pick"><select data-chg="idea.setBook" data-id="${x.id}" aria-label="К какой книге"><option value="">+ к книге</option>${c.wbooks.map((bk) => opt(bk.id, bk.title, '')).join('')}</select></div>` : '';
  if (!open) return `<div class="item idea" id="idea-${x.id}">${head}${body ? `<div class="idea-snip">${esc(plainSnip(body))}</div>` : ''}${pick}</div>`;
  return `<div class="item idea open" id="idea-${x.id}">${head}
    ${body ? `<p class="idea-text">${esc(body)}</p>` : ''}
    ${(x.tags || []).length || x.fileLink || chTab ? `<div class="tags">${chTab ? `<a class="tag" href="#" data-act="go" data-to="/ed/${b.id}/${encodeURIComponent(chTab.title)}">${ic('pen')} ${esc(chTab.title)}</a>` : ''}${(x.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}${x.fileLink ? `<a class="tag on" href="${esc(x.fileLink)}" target="_blank" rel="noopener">${ic('doc')} ${esc(x.fileName || 'документ')}</a>` : ''}</div>` : ''}
    <div class="row idea-acts"><select data-chg="idea.kind" data-id="${x.id}" aria-label="Вид записи">${Object.entries(KINDS).map(([k, v]) => opt(k, v, kind)).join('')}</select>
      <button class="link" data-act="idea.edit" data-id="${x.id}">Изменить</button>${!x.fileLink && drive.isConnected() && c.settings.wBooksFolder ? `<button class="link" data-act="idea.doc" data-id="${x.id}">В документ</button>` : ''}<button class="link danger" data-act="idea.quickDel" data-id="${x.id}">Удалить</button></div>
    ${pick}
    <div class="comments">${comments.map((m, i) => `<div class="comment"><div class="small muted">${fmtDate((m.at || '').slice(0, 10))}</div><div>${esc(m.text)}</div><button class="link danger" data-act="idea.delComment" data-id="${x.id}" data-i="${i}">убрать</button></div>`).join('')}
      <form data-form="idea.comment" data-id="${x.id}" class="row"><input name="text" placeholder="Комментарий" style="flex:1" aria-label="Комментарий"><button type="submit">Добавить</button></form></div>
  </div>`;
}

function ideaForm(c, x = {}) {
  return `<label for="ix">Что пришло в голову</label><textarea id="ix" name="text" style="min-height:140px" placeholder="Можно одной строкой. Первая строка станет заголовком.">${esc(x.title ? `${x.title}${x.text ? '\n' + x.text : ''}` : x.text || '')}</textarea>
    <div class="f2"><div><label for="ib">Книга</label><select id="ib" name="bookId"><option value="">определить само</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select></div>
    <div><label for="ik">Вид</label><select id="ik" name="kind"><option value="">определить само</option>${Object.entries(KINDS).map(([k, v]) => opt(k, v, x.kind || '')).join('')}</select></div></div>`;
}
// первая строка — заголовок, остальное — текст; книга и вид — если не выбраны, приложение определит само
const fromForm = (fd, c) => {
  const all = String(fd.get('text') || '').trim(), [first, ...rest] = all.split('\n');
  const bookId = fd.get('bookId') || bookGuess(all, c.wbooks)?.id || '';
  return { title: first.trim().slice(0, 200), text: rest.join('\n').trim(), bookId, kind: fd.get('kind') || '' };
};

changes['idea.q'] = (v) => { app().ui.ideaQ = v.trim(); app().rerender(); };
acts['idea.book'] = (d) => { app().ui.ideaBook = d.v; };
acts['idea.st'] = (d) => { app().ui.ideaSt = d.v; };
acts['idea.reset'] = () => { const u = app().ui; u.ideaQ = ''; u.ideaBook = ''; u.ideaSt = 'open'; };
// галочка: «Готово» ⇄ открытая (с «Вернуть»)
acts['idea.done'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  if (!x) return false;
  const done = isDone(x);
  await app().store.put('w_ideas', { ...x, status: done ? 'new' : 'used', doneAt: done ? '' : new Date().toISOString(), ...(done ? { tdOff: false } : {}) });
  toast(done ? 'Снова в открытых' : 'Готово', { undo: async () => { await app().store.put('w_ideas', x); } });
  return false;
};
changes['idea.kind'] = async (v, el) => { const x = app().ctx().data.w_ideas.find((i) => i.id === el.dataset.id); await app().store.put('w_ideas', { ...x, kind: v }); };
changes['idea.setBook'] = async (v, el) => { if (!v) return; const x = app().ctx().data.w_ideas.find((i) => i.id === el.dataset.id); await app().store.put('w_ideas', { ...x, bookId: v, ...(x.tdId ? { tdMove: true } : {}) }); toast('Идея привязана к книге'); docToBook({ ...x, bookId: v }); };
acts['idea.newFor'] = (d) => acts['idea.new'](d); // «+ Идея» на странице книги — книга уже выбрана
// со страницы книги: идеи этой книги, нужная — раскрыта
acts['idea.open'] = (d) => {
  const a = app();
  const x = d.id ? a.ctx().data.w_ideas.find((i) => i.id === d.id) : null;
  a.ui.ideaBook = d.book || ''; a.ui.ideaQ = ''; a.ui.ideaSt = x && isDone(x) ? 'done' : 'open'; a.ui.openIdea = d.id || null;
  a.go('/ideas');
  if (d.id) setTimeout(() => document.getElementById('idea-' + d.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
};
acts['idea.toggle'] = (d) => { app().ui.openIdea = app().ui.openIdea === d.id ? null : d.id; };
acts['idea.new'] = (d) => {
  const c = app().ctx();
  openSheet('Новая идея', ideaForm(c, d?.book ? { bookId: d.book } : {}), async (fd) => {
    const v = fromForm(fd, c);
    if (!v.title && !v.text) { toast('Напишите хотя бы пару слов'); return false; }
    await app().store.put('w_ideas', { id: 'i' + uid(), ...v, status: 'new', tags: [], comments: [], createdAt: new Date().toISOString() });
    const b = v.bookId ? c.wbooksById[v.bookId] : null;
    toast(`Записано${b ? ` — к книге «${b.title.split(/[.!?:]/)[0]}»` : ''} · ${KINDS[ideaKind(v)].toLowerCase()}`);
  });
};
acts['idea.edit'] = (d) => {
  const c = app().ctx(), x = c.data.w_ideas.find((i) => i.id === d.id);
  openSheet('Запись', ideaForm(c, x) + `<p><button type="button" class="link danger" data-act="idea.del" data-id="${x.id}">Удалить</button></p>`, async (fd) => {
    const v = fromForm(fd, c), moved = v.bookId && v.bookId !== x.bookId;
    await app().store.put('w_ideas', { ...x, ...v, ...(moved && x.tdId ? { tdMove: true } : {}) });
    if (moved) docToBook({ ...x, bookId: v.bookId });
  });
};
acts['idea.del'] = async (d) => {
  await acts['idea.quickDel'](d);
};
// быстрое удаление (урна у идеи): идея уходит в «Удалённые», оттуда её можно вернуть
acts['idea.quickDel'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  if (!x) return;
  await app().store.put('w_ideas', { ...x, deletedAt: new Date().toISOString() });
  toast('В корзине', { undo: async () => { await app().store.put('w_ideas', { ...x, deletedAt: '' }); } });
};
// «Удалённые» — внизу страницы идей, неприметной ссылкой
let trashQ = '';
function trashSheet() {
  const c = app().ctx();
  const list = app().store.data.w_ideas.filter((x) => x.deletedAt).sort((x, y) => y.deletedAt.localeCompare(x.deletedAt));
  const row = (x) => {
    const b = x.bookId ? c.wbooksById[x.bookId] : null, comments = x.comments || [];
    const hay = [x.title, x.text, ...(x.tags || []), ...comments.map((m) => m.text), b ? b.title : ''].join(' ').toLowerCase();
    return `<details class="item trash-item" data-hay="${esc(hay)}"><summary><span class="ti-main"><b>${esc(x.title || (x.text || '').slice(0, 60) || 'Без названия')}</b><span class="sub">${b ? esc(b.title) + ' · ' : ''}удалена ${fmtDate(x.deletedAt.slice(0, 10))}</span></span>
      <span class="ti-btns"><button data-act="idea.restore" data-id="${x.id}">Вернуть</button><button class="icon-btn" data-act="idea.purge" data-id="${x.id}" aria-label="Удалить навсегда" title="Удалить навсегда">${ic('trash')}</button></span></summary>
      <div class="ti-body">${x.text ? `<p class="idea-text">${esc(x.text)}</p>` : '<p class="small muted">Текста нет.</p>'}
        ${(x.tags || []).length ? `<div class="tags">${x.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
        ${comments.length ? `<div class="comments">${comments.map((m) => `<div class="comment"><div class="small muted">${fmtDate((m.at || '').slice(0, 10))}</div><div>${esc(m.text)}</div></div>`).join('')}</div>` : ''}
        <div class="small muted">создана ${x.createdAt ? fmtDate(x.createdAt.slice(0, 10)) : '—'}</div></div></details>`;
  };
  openSheet('Корзина', list.length ? `<p class="small muted" style="margin-top:0">Через 30 дней после удаления записи стираются сами.</p>` + ( `${list.length > 1 || trashQ ? `<input type="search" id="trq" value="${esc(trashQ)}" placeholder="Поиск по удалённым" aria-label="Поиск по удалённым" style="margin-bottom:8px">` : ''}
    <div class="list trash-list">${list.map(row).join('')}</div><p class="small muted" data-trempty hidden>Ничего не нашлось.</p>
    <p style="margin-top:12px"><button class="link danger" data-act="idea.purgeAll">Очистить всё</button></p>`) : '<p class="muted">Здесь пусто.</p>', null);
  const inp = document.getElementById('trq');
  const filt = () => {
    const q = (inp?.value || '').trim().toLowerCase(); trashQ = q;
    let n = 0;
    document.querySelectorAll('dialog[open] .trash-item').forEach((el) => { const ok = q.split(/\s+/).every((w) => el.dataset.hay.includes(w)); el.hidden = !ok; if (ok) n++; });
    const e = document.querySelector('dialog[open] [data-trempty]'); if (e) e.hidden = n > 0;
  };
  if (inp) { inp.addEventListener('input', filt); filt(); }
}
acts['idea.trash'] = () => { trashQ = ''; trashSheet(); };
acts['idea.restore'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  await app().store.put('w_ideas', { ...x, deletedAt: '' });
  toast('Вернула из корзины'); trashSheet();
};
acts['idea.purge'] = async (d) => {
  if (!(await ask('Удалить идею навсегда?', 'Удалить'))) return;
  await app().store.remove('w_ideas', d.id); trashSheet();
};
acts['idea.purgeAll'] = async () => {
  const list = app().ctx().data.w_ideas.filter((x) => x.deletedAt);
  if (!(await ask(`Удалить навсегда ${list.length} шт.?`, 'Удалить'))) return;
  for (const x of list) await app().store.remove('w_ideas', x.id);
  trashSheet();
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
// папка книги на Диске — там, где лежит её Документ
async function bookFolder(c, bookId) {
  const b = bookId && c.wbooksById[bookId];
  if (!b?.fileId) return null;
  try { return await drive.parentOf(b.fileId); } catch { return null; }
}
// документ идеи — в папку её книги (если ещё не там); тихо, без ошибок на экране
async function docToBook(x) {
  if (!x?.fileId || !x.bookId || !drive.hasFreshToken()) return;
  try { const to = await bookFolder(app().ctx(), x.bookId); if (to) await drive.moveFile(x.fileId, to); } catch { /* попробуем в другой раз */ }
}
// один раз за открытие: уже созданные документы идей — по папкам книг
let swept = false;
export function sweepIdeaDocs() {
  if (swept || !drive.hasFreshToken()) return;
  swept = true;
  (async () => { for (const x of app().ctx().data.w_ideas) if (x.fileId && x.bookId && !x.deletedAt) await docToBook(x); })();
}
acts['idea.doc'] = async (d) => {
  const c = app().ctx(), x = c.data.w_ideas.find((i) => i.id === d.id);
  try { await drive.ensureToken(); } catch (e) { toast(e.message); return; }
  try {
    const body = [x.title, x.text, ...(x.comments || []).map((m) => '— ' + m.text)].filter(Boolean).join('\n\n');
    const inBook = await bookFolder(c, x.bookId);
    const f = await drive.createDoc('Идея: ' + (x.title || x.text.slice(0, 40)), inBook || c.settings.wIdeasFolder || c.settings.wBooksFolder, body);
    await app().store.put('w_ideas', { ...x, fileLink: f.webViewLink, fileName: f.name, fileId: f.id });
    toast(inBook ? `Документ создан в папке книги «${c.wbooksById[x.bookId].title}»` : 'Документ создан на Google Диске');
  } catch (e) { toast(e.message); }
};
export { changes };
