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

const PAGE = 50;
const noBook = (x, c) => !(x.bookId && c.wbooksById[x.bookId]);
const short = (t) => String(t || '').split(/[.!?:]/)[0].trim() || t;
// вкладки: открытые, готово, корзина
const TABS = [['open', 'Открытые'], ['done', 'Готово'], ['trash', 'Корзина']];
const inTabOf = (st) => (x) => (st === 'trash' ? !!x.deletedAt : !x.deletedAt && (st === 'done' ? isDone(x) : !isDone(x)));
const stampOf = (st, x) => (st === 'trash' ? x.deletedAt : st === 'done' ? x.doneAt || x.createdAt : x.createdAt) || '';

export function ideasView(a) {
  const c = a.ctx(), ui = a.ui;
  const q = ui.ideaQ || '', fb = ui.ideaBook || '', st = TABS.some(([k]) => k === ui.ideaSt) ? ui.ideaSt : 'open', fk = ui.ideaKind || '';
  const all = c.data.w_ideas, inTab = inTabOf(st);
  const inBook = (x) => !fb || (fb === '-' ? noBook(x, c) : x.bookId === fb);
  const base = all.filter((x) => inTab(x) && matches(x, q, c)); // для счётчиков книг и видов
  const list = base.filter((x) => inBook(x) && (!fk || ideaKind(x) === fk)).sort((x, y) => stampOf(st, y).localeCompare(stampOf(st, x)));
  const nTab = Object.fromEntries(TABS.map(([k]) => [k, all.filter((x) => inTabOf(k)(x) && inBook(x)).length]));
  const kinds = Object.keys(KINDS).map((k) => [k, base.filter((x) => inBook(x) && ideaKind(x) === k).length]);
  const shown = list.slice(0, ui.ideaN || PAGE);
  const bookName = fb === '-' ? 'Без книги' : fb ? short(c.wbooksById[fb]?.title || 'Книга') : 'Все книги';
  const rows = shown.map((x) => (st === 'trash' ? trashRow(c, x, !fb) : ideaRow(c, x, ui.openIdea === x.id, !fb))).join('');
  const empty = q || fb || fk ? 'Ничего не нашлось — попробуйте другое слово, книгу или вид.' : st === 'done' ? 'Здесь появится то, что вы отметили кружком как сделанное.' : st === 'trash' ? 'Корзина пуста.' : 'Пусто. Запишите мысль — книгу, главу и вид записи приложение определит само.';
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Идеи и заметки</h2><button class="primary" data-act="idea.new" data-book="${fb && fb !== '-' ? fb : ''}">+ Записать</button></div>
  <div class="ideas-wrap">
    <aside class="card ideas-side">${bookList(c, base, fb)}</aside>
    <div class="ideas-main">
      <div class="card idea-filter">
        <input type="search" value="${esc(q)}" placeholder="Поиск по всем записям" data-chg="idea.q" aria-label="Поиск по записям">
        <div class="idea-seg">${TABS.map(([k, t]) => `<button class="${st === k ? 'on' : ''}" data-act="idea.st" data-v="${k}">${t}${nTab[k] ? ` <span>${nTab[k]}</span>` : ''}</button>`).join('')}</div>
        <div class="idea-pickers"><button class="idea-pk ideas-bookbtn" data-act="idea.books">${ic('books')}<span>${esc(bookName)}</span>${ic('chevron')}</button>
          <select class="idea-pk" data-chg="idea.kindF" aria-label="Вид записи"><option value="">Все виды</option>${kinds.map(([k, n]) => `<option value="${k}"${fk === k ? ' selected' : ''}>${KINDS[k]}${n ? ` · ${n}` : ''}</option>`).join('')}</select>
          ${q || fb || fk ? '<button class="link idea-reset" data-act="idea.reset">Сбросить</button>' : ''}</div>
      </div>
      ${st === 'trash' && list.length ? '<p class="small muted idea-hint">Через 30 дней после удаления записи стираются сами.</p>' : ''}
      <div class="card idea-list">${list.length ? `<div class="list">${rows}</div>${list.length > shown.length ? `<div class="idea-more"><button data-act="idea.more">Показать ещё · осталось ${list.length - shown.length}</button></div>` : ''}` : `<p class="muted" style="margin:0">${empty}</p>`}</div>
      ${st === 'trash' && list.length > 1 ? '<p style="text-align:center"><button class="link danger" data-act="idea.purgeAll">Очистить корзину</button></p>' : ''}
      ${c.settings.todoistToken && st === 'open' ? '<p class="small muted idea-hint">С телефона: задача в Todoist с меткой <b>идея</b> появится здесь сама; галочка в Todoist — и тут «Готово».</p>' : ''}
    </div>
  </div>`;
  return { html, after: () => { sweepIdeaDocs(); purgeOld(); } };
}

// список книг: «Все», «Без книги» и книги с записями — свежие сверху, с поиском (книг может быть сколько угодно)
function bookList(c, base, fb) {
  const last = new Map(), cnt = new Map();
  for (const x of c.data.w_ideas) { const k = noBook(x, c) ? '-' : x.bookId; const t = x.createdAt || ''; if (!last.has(k) || t > last.get(k)) last.set(k, t); }
  for (const x of base) { const k = noBook(x, c) ? '-' : x.bookId; cnt.set(k, (cnt.get(k) || 0) + 1); }
  const books = [...last.keys()].filter((k) => k !== '-').sort((x, y) => last.get(y).localeCompare(last.get(x)));
  const item = (id, title, n, hay) => `<button class="ib-item${fb === id ? ' on' : ''}" data-act="idea.book" data-v="${id}" data-hay="${esc((hay || title).toLowerCase())}"><span>${esc(title)}</span>${n ? `<span class="ib-n">${n}</span>` : ''}</button>`;
  return `${books.length > 6 ? '<input type="search" class="ib-q" placeholder="Найти книгу" aria-label="Найти книгу">' : ''}
    <div class="ib-list">${item('', 'Все книги', base.length, 'все книги')}${books.map((id) => item(id, c.wbooksById[id].title, cnt.get(id) || 0)).join('')}${last.has('-') ? item('-', 'Без книги', cnt.get('-') || 0) : ''}</div>`;
}
// поиск по списку книг — без перерисовки, прямо по строкам (и в колонке, и в окне)
document.addEventListener('input', (e) => {
  const inp = e.target.closest?.('.ib-q');
  if (!inp) return;
  const q = inp.value.trim().toLowerCase(), root = inp.parentElement;
  root.querySelectorAll('.ib-item').forEach((el) => { el.hidden = !!q && !q.split(/\s+/).every((w) => el.dataset.hay.includes(w)); });
});
// на телефоне книги открываются окном
acts['idea.books'] = () => {
  const c = app().ctx(), ui = app().ui, st = TABS.some(([k]) => k === ui.ideaSt) ? ui.ideaSt : 'open';
  openSheet('Книга', `<div class="ideas-sheet">${bookList(c, c.data.w_ideas.filter((x) => inTabOf(st)(x) && matches(x, ui.ideaQ || '', c)), ui.ideaBook || '')}</div>`, null);
  return false;
};

// корзина чистится сама: старше 30 дней — навсегда
let purged = false;
function purgeOld() {
  if (purged) return; purged = true;
  for (const x of app().ctx().data.w_ideas.filter((y) => expired(y))) app().store.remove('w_ideas', x.id);
}

// превью: без разметки (##, **, списки), в одну-две строки
const plainSnip = (t) => String(t).replace(/^#+\s*/gm, '').replace(/[*_`>#]+/g, '').replace(/^\s*[-–—•]\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 220);
// строка: галочка «Готово», заголовок, серой строкой — вид, глава, дата; нажали — раскрывается
function ideaRow(c, x, open, withBook) {
  const comments = x.comments || [], done = isDone(x), kind = ideaKind(x), ch = chapterRef(`${x.title || ''} ${x.text || ''}`);
  const b = x.bookId ? c.wbooksById[x.bookId] : null;
  const chTab = ch && b ? chapterList(b).find((t) => t.title.trim().toLowerCase() === ch.title.toLowerCase()) : null;
  const title = ideaTitle(x), body = x.title ? x.text : String(x.text || '').split('\n').slice(1).join('\n').trim();
  const sub = [withBook && b ? esc(short(b.title)) : '', KINDS[kind], ch?.label, done && x.doneAt ? `сделано ${fmtDate(x.doneAt.slice(0, 10))}` : x.createdAt ? fmtDate(x.createdAt.slice(0, 10)) : '', comments.length ? `${comments.length} комм.` : '', x.fileLink ? 'документ' : ''].filter(Boolean).join(' · ');
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

// строка в корзине: вернуть или стереть навсегда
function trashRow(c, x, withBook) {
  const b = x.bookId ? c.wbooksById[x.bookId] : null;
  const sub = [withBook && b ? esc(short(b.title)) : '', KINDS[ideaKind(x)], `удалено ${fmtDate(x.deletedAt.slice(0, 10))}`].filter(Boolean).join(' · ');
  const body = x.title ? x.text : String(x.text || '').split('\n').slice(1).join('\n').trim();
  return `<div class="item idea idea-trash" id="idea-${x.id}"><div class="idea-head"><span class="idea-main"><b>${esc(ideaTitle(x))}</b><span class="idea-sub">${sub}</span></span>
    <span class="ti-btns"><button data-act="idea.restore" data-id="${x.id}">Вернуть</button><button class="icon-btn" data-act="idea.purge" data-id="${x.id}" aria-label="Удалить навсегда" title="Удалить навсегда">${ic('trash')}</button></span></div>
    ${body ? `<div class="idea-snip">${esc(plainSnip(body))}</div>` : ''}</div>`;
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

changes['idea.q'] = (v) => { app().ui.ideaQ = v.trim(); app().ui.ideaN = PAGE; app().rerender(); };
acts['idea.book'] = (d) => { const u = app().ui; u.ideaBook = d.v; u.ideaN = PAGE; if (document.querySelector('dialog[open] .ideas-sheet')) document.querySelector('dialog[open]').close(); };
acts['idea.st'] = (d) => { app().ui.ideaSt = d.v; app().ui.ideaN = PAGE; };
changes['idea.kindF'] = (v) => { app().ui.ideaKind = v; app().ui.ideaN = PAGE; app().rerender(); };
acts['idea.more'] = () => { app().ui.ideaN = (app().ui.ideaN || PAGE) + PAGE; };
acts['idea.reset'] = () => { const u = app().ui; u.ideaQ = ''; u.ideaBook = ''; u.ideaKind = ''; u.ideaN = PAGE; };
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
  a.ui.ideaBook = d.book || ''; a.ui.ideaQ = ''; a.ui.ideaKind = ''; a.ui.ideaN = PAGE; a.ui.ideaSt = x && isDone(x) ? 'done' : 'open'; a.ui.openIdea = d.id || null;
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
  toast('В корзине — вкладка «Корзина»', { undo: async () => { await app().store.put('w_ideas', { ...x, deletedAt: '' }); } });
};
// корзина — третья вкладка («Открытые | Готово | Корзина»)
acts['idea.trash'] = () => { app().ui.ideaSt = 'trash'; app().go('/ideas'); };
acts['idea.restore'] = async (d) => {
  const x = app().ctx().data.w_ideas.find((i) => i.id === d.id);
  await app().store.put('w_ideas', { ...x, deletedAt: '' });
  toast('Вернула из корзины');
};
acts['idea.purge'] = async (d) => {
  if (!(await ask('Удалить идею навсегда?', 'Удалить'))) return;
  await app().store.remove('w_ideas', d.id);
};
acts['idea.purgeAll'] = async () => {
  const list = app().ctx().data.w_ideas.filter((x) => x.deletedAt);
  if (!(await ask(`Удалить навсегда ${list.length} шт.?`, 'Удалить'))) return;
  for (const x of list) await app().store.remove('w_ideas', x.id);
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
