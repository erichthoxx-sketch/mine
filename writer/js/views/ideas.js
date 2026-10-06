import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, uid, ask } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import * as drive from '../drive.js';

const app = () => window.__app;
const tagsOf = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export function ideasView(a) {
  const c = a.ctx(), ui = a.ui;
  const all = [...c.data.w_ideas].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const tags = [...new Set(all.flatMap((x) => x.tags || []))].sort();
  const list = ui.ideaTag ? all.filter((x) => (x.tags || []).includes(ui.ideaTag) || x.bookId === ui.ideaTag) : all;
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Идеи</h2><button class="primary" data-act="idea.new">+ Идея</button></div>
  ${tags.length || c.wbooks.length ? `<div class="chips"><button class="chip${!ui.ideaTag ? ' on' : ''}" data-act="idea.filter" data-v="">все</button>${tags.map((t) => `<button class="chip${ui.ideaTag === t ? ' on' : ''}" data-act="idea.filter" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}${c.wbooks.filter((b) => all.some((x) => x.bookId === b.id)).map((b) => `<button class="chip${ui.ideaTag === b.id ? ' on' : ''}" data-act="idea.filter" data-v="${b.id}">${ic('books')} ${esc(b.title.slice(0, 24))}</button>`).join('')}</div>` : ''}
  ${list.length ? list.map((x) => ideaCard(c, x, ui.openIdea === x.id)).join('') : '<div class="card"><p class="muted">Идей пока нет. Запишите первую — она не потеряется и будет доступна с телефона.</p></div>'}`;
  return { html };
}

function ideaCard(c, x, open) {
  const book = x.bookId ? c.wbooksById[x.bookId] : null;
  const comments = x.comments || [];
  return `<div class="card idea" id="idea-${x.id}">
    <div class="row between"><b>${esc(x.title || 'Без названия')}</b><span class="small muted">${x.createdAt ? fmtDate(x.createdAt.slice(0, 10)) : ''}</span></div>
    ${x.text ? `<p class="idea-text">${esc(open ? x.text : x.text.slice(0, 220) + (x.text.length > 220 ? '…' : ''))}</p>` : ''}
    <div class="tags">${(x.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}${book ? `<span class="tag on">${ic('books')} ${esc(book.title)}</span>` : ''}${x.fileLink ? `<a class="tag on" href="${esc(x.fileLink)}" target="_blank" rel="noopener">${ic('doc')} ${esc(x.fileName || 'документ')}</a>` : ''}</div>
    <div class="row" style="margin-top:8px"><button class="link" data-act="idea.toggle" data-id="${x.id}">${open ? 'Свернуть' : `Комментарии (${comments.length})`}</button><button class="link" data-act="idea.edit" data-id="${x.id}">Изменить</button>
    ${!x.fileLink && drive.isConnected() && c.settings.wBooksFolder ? `<button class="link" data-act="idea.doc" data-id="${x.id}">Превратить в документ</button>` : ''}</div>
    ${open ? `<div class="comments">${comments.map((m, i) => `<div class="comment"><div class="small muted">${fmtDate((m.at || '').slice(0, 10))}</div><div>${esc(m.text)}</div><button class="link danger" data-act="idea.delComment" data-id="${x.id}" data-i="${i}">убрать</button></div>`).join('')}
      <form data-form="idea.comment" data-id="${x.id}" class="row"><input name="text" placeholder="Комментарий" style="flex:1" aria-label="Комментарий"><button class="primary" type="submit">Добавить</button></form></div>` : ''}
  </div>`;
}

function ideaForm(c, x = {}) {
  return `<label for="it">Коротко</label><input id="it" name="title" value="${esc(x.title || '')}" placeholder="например: сцена в горах, он возвращается">
    <label for="ix">Подробнее</label><textarea id="ix" name="text" style="min-height:140px">${esc(x.text || '')}</textarea>
    <label for="ig">Метки через запятую</label><input id="ig" name="tags" value="${esc((x.tags || []).join(', '))}" placeholder="сюжет, герой, название">
    <label for="ib">К какой книге</label><select id="ib" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select>
    <label for="il">Ссылка на файл (необязательно)</label><input id="il" name="fileLink" value="${esc(x.fileLink || '')}" placeholder="ссылка на документ Google Диска">`;
}
const fromForm = (fd) => ({ title: (fd.get('title') || '').trim(), text: (fd.get('text') || '').trim(), tags: tagsOf(fd.get('tags')), bookId: fd.get('bookId') || '', fileLink: (fd.get('fileLink') || '').trim() });

acts['idea.filter'] = (d) => { app().ui.ideaTag = d.v; };
acts['idea.newFor'] = (d) => acts['idea.new'](d); // «+ Идея» на странице книги — книга уже выбрана
// со страницы книги: идеи этой книги, нужная — раскрыта
acts['idea.open'] = (d) => {
  const a = app();
  a.ui.ideaTag = d.book || ''; a.ui.openIdea = d.id || null;
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
  try {
    const body = [x.title, x.text, ...(x.comments || []).map((m) => '— ' + m.text)].filter(Boolean).join('\n\n');
    const f = await drive.createDoc('Идея: ' + (x.title || x.text.slice(0, 40)), c.settings.wIdeasFolder || c.settings.wBooksFolder, body);
    await app().store.put('w_ideas', { ...x, fileLink: f.webViewLink, fileName: f.name, fileId: f.id });
    toast('Документ создан на Google Диске');
  } catch (e) { toast(e.message); }
};
export { changes };
