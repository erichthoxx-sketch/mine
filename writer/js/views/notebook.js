// «Блокнот» (бывшие «Идеи»): вкладки Заметки · Идеи · Промты.
// Заметки — как в Simplenote: список слева, текст справа, сохраняется само; закреп, теги, чек-листы, корзина, перенос из Simplenote.
// Промты — библиотека для нейросетей: у промта есть место (Легенда, редактор главы, маркетинг), там он и появляется с подставленной книгой.
import { ic } from '../../../js/icons.js';
import { esc, acts, changes, openSheet, closeSheet, opt, toast, uid, ask, copyRich, download } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import * as drive from '../drive.js';
import { findTab, contentToBlocks, blocksText } from '../docedit.js';
import { chapterList, isAuthorTab } from '../wcalc.js';
import { legendOf, legendContext } from '../legend.js';
import { synText } from '../synopsis.js';
import { ideasView } from './ideas.js';
import {
  noteTitle, notePreview, notesView, noteTags, normTag, textStats, expiredNote, toggleCheck, noteHtml,
  fromSimplenoteJson, fromText, newOnly, toSimplenoteJson, changedHere, WS_TAG, PLACES, VARS, fillPrompt, missingVars, promptsFor, docPromptTabs, guessPlace,
} from '../notecalc.js';

const app = () => window.__app;
const SUBS = [['notes', 'Заметки'], ['ideas', 'Идеи'], ['prompts', 'Промты']];
const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ок */ } };
const now = () => new Date().toISOString();
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), t = new Date();
  return d.toDateString() === t.toDateString() ? d.toTimeString().slice(0, 5) : fmtDate(iso.slice(0, 10)).slice(0, d.getFullYear() === t.getFullYear() ? 5 : 10);
};

export function notebookView(a, sub) {
  const s = SUBS.some(([k]) => k === sub) ? sub : lsGet('padTab', 'notes');
  lsSet('padTab', s);
  const tabs = `<div class="lg-tabs nb-tabs">${SUBS.map(([k, t]) => `<button class="${s === k ? 'on' : ''}" data-act="go" data-to="/ideas/${k}">${t}</button>`).join('')}</div>`;
  const r = s === 'ideas' ? ideasView(a, { embedded: true }) : s === 'prompts' ? promptsPane(a) : notesPane(a);
  return { html: tabs + r.html, after: r.after };
}

// ---------- заметки ----------
const notes = () => app().ctx().data.w_notes || [];
const noteOf = (id) => notes().find((n) => n.id === id);
// заметка с текстом прямо из поля (если она открыта): правка тега или булавки не затирает ещё не сохранённый текст
const cur = (id) => { const n = noteOf(id), ta = document.getElementById('nbText'); return n && ta && app().ui.noteId === id && ta.value !== n.text ? { ...n, text: ta.value, updatedAt: now() } : n; };

function notesPane(a) {
  const ui = a.ui, all = notes(), q = ui.noteQ || '', tag = ui.noteTag || '';
  const list = notesView(all, { q, tag });
  const open = ui.noteId && noteOf(ui.noteId) ? noteOf(ui.noteId) : null;
  const tags = noteTags(all), trashN = all.filter((n) => n.deletedAt).length;
  const item = (n) => `<button class="nb-item${open?.id === n.id ? ' on' : ''}" data-act="note.open" data-id="${n.id}" data-nid="${n.id}">
      <span class="nb-it-t">${n.pinned ? `<i class="nb-pin">${ic('pin')}</i>` : ''}<b>${esc(noteTitle(n))}</b><small>${when(n.updatedAt)}</small></span>
      <span class="nb-it-p">${esc(notePreview(n)) || '&nbsp;'}</span></button>`;
  const empty = q ? 'Ничего не нашлось.' : tag === '@trash' ? 'Корзина пуста.' : tag ? 'С этим тегом заметок нет.' : 'Заметок пока нет. Нажмите «+» — и пишите.';
  const html = `<div class="nb-wrap${open ? ' nb-has' : ''}">
    <section class="card nb-list">
      <div class="nb-head"><input type="search" class="nb-q" value="${esc(q)}" placeholder="Поиск по заметкам" data-chg="note.q" aria-label="Поиск по заметкам">
        <button class="plus-btn hm-plus" data-act="note.new" title="Новая заметка" aria-label="Новая заметка">${ic('plus')}</button></div>
      ${tags.length || trashN || tag ? `<label class="nb-filter"><select data-chg="note.tagSel" aria-label="Какие заметки показать">
        <option value="">Все заметки · ${all.length - trashN}</option>${tags.map((t) => `<option value="${esc(t.tag)}"${tag === t.tag ? ' selected' : ''}>#${esc(t.tag)} · ${t.n}</option>`).join('')}
        ${trashN || tag === '@trash' ? `<option value="@trash"${tag === '@trash' ? ' selected' : ''}>Корзина · ${trashN}</option>` : ''}</select></label>` : ''}
      <div class="nb-items">${list.length ? list.map(item).join('') : `<p class="muted nb-empty">${empty}</p>`}</div>
      <div class="nb-foot"><button class="link" data-act="note.import">Импорт</button>${all.length ? '<button class="link" data-act="note.export">Экспорт</button>' : ''}</div>
    </section>
    <section class="card nb-ed">${open ? editorHtml(a, open) : `<div class="nb-blank"><p class="muted">Выберите заметку слева или создайте новую.</p><button class="primary" data-act="note.new">Новая заметка</button></div>`}</section>
  </div>`;
  return { html, after: () => { notesAfter(open); purgeNotes(); } };
}

function editorHtml(a, n) {
  const c = a.ctx(), prev = !!a.ui.notePrev && !n.deletedAt, st = textStats(n.text);
  if (n.deletedAt) return `<div class="nb-bar"><button class="nb-back" data-act="note.back">${ic('chevron')}Заметки</button><span class="nb-sp"></span></div>
    <div class="nb-trash"><p class="muted">Заметка в корзине — через 30 дней сотрётся сама.</p><div class="row"><button class="primary" data-act="note.restore" data-id="${n.id}">Вернуть</button><button class="link danger" data-act="note.purge" data-id="${n.id}">Удалить навсегда</button></div></div>
    <div class="nb-view">${noteHtml(n.text)}</div>`;
  return `<div class="nb-bar"><button class="nb-back" data-act="note.back">${ic('chevron')}Заметки</button><span class="nb-sp"></span>
      <button class="ed-ic${n.pinned ? ' on' : ''}" data-act="note.pin" data-id="${n.id}" title="${n.pinned ? 'Открепить' : 'Закрепить сверху'}" aria-label="Закрепить">${ic('pin')}</button>
      <button class="ed-ic" data-act="note.checkline" title="Пункт чек-листа" aria-label="Пункт чек-листа"${prev ? ' disabled' : ''}>${ic('list')}</button>
      <button class="ed-ic${prev ? ' on' : ''}" data-act="note.prev" title="${prev ? 'Писать' : 'Просмотр: заголовки, списки, галочки'}" aria-label="Просмотр">${ic(prev ? 'pen' : 'eye')}</button>
      <button class="ed-ic" data-act="note.copy" data-id="${n.id}" title="Скопировать текст" aria-label="Скопировать">${ic('copy')}</button>
      <button class="ed-ic" data-act="note.del" data-id="${n.id}" title="В корзину" aria-label="В корзину">${ic('trash')}</button></div>
    ${prev ? `<div class="nb-view">${noteHtml(n.text) || '<p class="muted">Пусто.</p>'}</div>` : `<textarea id="nbText" class="nb-text" data-id="${n.id}" placeholder="Пишите. Первая строка станет названием." aria-label="Текст заметки">${esc(n.text || '')}</textarea>`}
    <div class="nb-meta">
      <div class="nb-tags">${(n.tags || []).map((t) => `<span class="nb-tg">#${esc(t)}<button data-act="note.untag" data-id="${n.id}" data-t="${esc(t)}" aria-label="Убрать тег">×</button></span>`).join('')}
        <input class="nb-tagin" placeholder="+ тег" data-id="${n.id}" aria-label="Добавить тег" enterkeyhint="done"></div>
      <div class="nb-info"><select class="nb-book" data-chg="note.book" data-id="${n.id}" aria-label="Книга">${opt('', 'Без книги', n.bookId || '')}${c.wbooks.filter((b) => b.status !== 'removed').map((b) => opt(b.id, b.title, n.bookId || '')).join('')}</select>
        <span class="small muted" id="nbStat">${st.words} сл. · ${st.chars} зн. · ${when(n.updatedAt)}</span></div>
    </div>`;
}

// текст сохраняется сам через полсекунды после правки; название в списке меняется сразу
let saveT = null;
function notesAfter(open) {
  const ta = document.getElementById('nbText');
  if (ta && open) {
    ta.addEventListener('input', () => {
      const li = document.querySelector(`.nb-item[data-nid="${open.id}"]`);
      if (li) { li.querySelector('.nb-it-t b').textContent = noteTitle({ text: ta.value }); li.querySelector('.nb-it-p').textContent = notePreview({ text: ta.value }) || ' '; }
      const s = textStats(ta.value), el = document.getElementById('nbStat'); if (el) el.textContent = `${s.words} сл. · ${s.chars} зн. · сохраняю…`;
      clearTimeout(saveT); saveT = setTimeout(() => saveText(open.id, ta.value), 500);
    });
    ta.addEventListener('blur', () => { if (saveT) { clearTimeout(saveT); saveT = null; saveText(open.id, ta.value); } });
    // новая заметка: курсор в текст (экран может перерисоваться дважды подряд — держим фокус секунду)
    if (app().ui.noteFocus > Date.now()) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  // тег: Enter или запятая
  document.querySelector('.nb-tagin')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault(); const t = normTag(e.target.value); if (!t) return;
    const n = cur(e.target.dataset.id); if (!n || (n.tags || []).includes(t)) { e.target.value = ''; return; }
    e.target.value = '';
    app().store.put('w_notes', { ...n, tags: [...(n.tags || []), t], updatedAt: now() });
  });
}
async function saveText(id, text) {
  saveT = null;
  const n = noteOf(id); if (!n || n.text === text) return;
  await app().store.put('w_notes', { ...n, text, updatedAt: now() });
  const el = document.getElementById('nbStat'), st = textStats(text);
  if (el && app().ui.noteId === id) el.textContent = `${st.words} сл. · ${st.chars} зн. · сохранено ${when(now())}`;
}
// пустая заметка, из которой ушли, — не нужна
function dropEmpty(id) {
  const n = id && noteOf(id);
  if (n && !String(n.text || '').trim() && !(n.tags || []).length) app().store.remove('w_notes', id);
}
let purged = false;
function purgeNotes() {
  if (purged) return; purged = true;
  const old = notes().filter((n) => expiredNote(n));
  if (old.length) app().store.removeMany('w_notes', old.map((n) => n.id));
}

// сохранить текст из поля той заметки, которой поле принадлежит (не «последней сохранявшейся»)
const flushText = () => { const ta = document.getElementById('nbText'); clearTimeout(saveT); saveT = null; if (ta?.dataset.id) return saveText(ta.dataset.id, ta.value); };
acts['note.new'] = async () => {
  await flushText(); dropEmpty(app().ui.noteId);
  const u = app().ui, tag = u.noteTag && u.noteTag !== '@trash' ? u.noteTag : '';
  const n = { id: 'n' + uid(), text: '', tags: [...new Set([WS_TAG, ...(tag ? [tag] : [])])], pinned: false, createdAt: now(), updatedAt: now() };
  if (u.noteTag === '@trash') u.noteTag = '';
  u.noteId = n.id; u.notePrev = false; u.noteFocus = Date.now() + 1000;
  await app().store.put('w_notes', n);
};
acts['note.open'] = async (d) => {
  const u = app().ui; if (u.noteId === d.id) return false;
  await flushText(); dropEmpty(u.noteId);
  u.noteId = d.id; u.notePrev = false;
};
acts['note.back'] = async () => { await flushText(); dropEmpty(app().ui.noteId); app().ui.noteId = null; };
acts['note.tag'] = (d) => { app().ui.noteTag = d.v; };
// фильтр заметок — одна тихая строка-список вместо ряда тегов (20.11.2026, её просьба: «лишнее… поминималистичнее»)
changes['note.tagSel'] = (v) => { app().ui.noteTag = v; app().ui.noteId = null; app().rerender(); };
changes['note.q'] = (v) => { app().ui.noteQ = v.trim(); app().rerender(); };
acts['note.pin'] = async (d) => { const n = cur(d.id); await app().store.put('w_notes', { ...n, pinned: !n.pinned }); };
acts['note.prev'] = async () => { await flushText(); app().ui.notePrev = !app().ui.notePrev; };
acts['note.check'] = async (d) => { const n = noteOf(app().ui.noteId); if (!n) return false; await app().store.put('w_notes', { ...n, text: toggleCheck(n.text, Number(d.l)), updatedAt: now() }); };
// пункт чек-листа: в начало текущей строки
acts['note.checkline'] = () => {
  const ta = document.getElementById('nbText'); if (!ta) return false;
  const v = ta.value, p = ta.selectionStart, ls = v.lastIndexOf('\n', p - 1) + 1;
  const line = v.slice(ls).split('\n')[0];
  const nv = /^\s*[-*]\s*\[[ xх]\]\s*/i.test(line) ? v.slice(0, ls) + line.replace(/^\s*[-*]\s*\[[ xх]\]\s*/i, '') + v.slice(ls + line.length) : v.slice(0, ls) + '- [ ] ' + v.slice(ls);
  ta.value = nv; ta.focus(); const np = p + (nv.length - v.length); ta.setSelectionRange(np, np); ta.dispatchEvent(new Event('input'));
  return false;
};
acts['note.copy'] = async (d) => { const n = noteOf(d.id); toast((await copyRich(n?.text || '').catch(() => false)) ? 'Скопировано' : 'Не получилось скопировать'); return false; };
acts['note.untag'] = async (d) => { const n = cur(d.id); await app().store.put('w_notes', { ...n, tags: (n.tags || []).filter((t) => t !== d.t), updatedAt: now() }); };
changes['note.book'] = async (v, el) => { const n = cur(el.dataset.id); await app().store.put('w_notes', { ...n, bookId: v || '' }); };
acts['note.del'] = async (d) => {
  await flushText();
  const n = noteOf(d.id); if (!n) return;
  if (!String(n.text || '').trim()) { await app().store.remove('w_notes', n.id); app().ui.noteId = null; return; }
  await app().store.put('w_notes', { ...n, deletedAt: now() }); app().ui.noteId = null;
  toast('Заметка в корзине', { undo: () => app().store.put('w_notes', { ...n }) });
};
acts['note.restore'] = async (d) => { const n = noteOf(d.id); const { deletedAt, ...rest } = n; await app().store.put('w_notes', rest); app().ui.noteTag = ''; toast('Заметка вернулась'); };
acts['note.purge'] = async (d) => { if (!(await ask('Удалить заметку навсегда?', 'Удалить'))) return false; await app().store.remove('w_notes', d.id); app().ui.noteId = null; };

// перенос из Simplenote: архив экспорта (.zip), notes.json или .txt
acts['note.import'] = () => {
  openSheet('Перенести из Simplenote', `<ol class="nb-steps"><li>В Simplenote: <b>Настройки</b> (или меню ☰) → <b>Экспорт заметок</b> (Export notes). Придёт архив .zip.</li>
    <li>Выберите этот архив здесь — можно и отдельные файлы .txt или notes.json.</li></ol>
    <p class="small muted">Теги, закреплённые и даты переносятся. Уже перенесённые заметки второй раз не добавятся. Своего открытого доступа к заметкам у Simplenote для других приложений нет, поэтому переносим файлом.</p>
    <label class="btn primary" style="display:inline-flex;margin-top:8px">Выбрать файл<input type="file" hidden multiple accept=".zip,.json,.txt,.md,text/plain,application/json,application/zip" data-chg="note.importFile"></label>`, null);
};
changes['note.importFile'] = async (v, el) => {
  const files = [...(el.files || [])]; if (!files.length) return;
  try {
    let got = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const Zip = await drive.loadJsZip(), z = await Zip.loadAsync(f);
        const js = Object.values(z.files).find((x) => /notes\.json$/i.test(x.name));
        if (js) got.push(...fromSimplenoteJson(await js.async('string')));
        else for (const x of Object.values(z.files)) if (!x.dir && /\.(txt|md)$/i.test(x.name)) got.push(fromText(x.name.split('/').pop(), await x.async('string'), x.date ? new Date(x.date).toISOString() : undefined));
      } else if (/\.json$/i.test(f.name)) got.push(...fromSimplenoteJson(await f.text()));
      else got.push(fromText(f.name, await f.text(), new Date(f.lastModified || Date.now()).toISOString()));
    }
    const impAt = new Date().toISOString(), add = newOnly(got.filter((n) => n.text.trim()), notes()).map((n) => ({ id: 'n' + uid(), ...n, impAt }));
    if (!add.length) { toast(got.length ? 'Все эти заметки уже перенесены' : 'В файле не нашлось заметок'); return; }
    await app().store.putMany('w_notes', add);
    closeSheet(); app().ui.noteTag = ''; app().ui.noteId = null;
    toast(`Перенесено заметок: ${add.length}`);
  } catch (e) { toast('Не получилось прочитать файл: ' + (e.message || e)); }
};
// экспорт: в Simplenote (их notes.json — загружается в Simplenote: Файл → Импорт заметок → Simplenote) или текстовыми файлами (.zip)
acts['note.export'] = () => {
  const c = app().ctx(), at = c.settings.notesExport?.at || '', all = notes().filter((n) => !n.deletedAt), fresh = all.filter((n) => changedHere(n, at));
  openSheet('Экспорт заметок', `<div class="nb-exp">
      <button class="primary" data-act="note.exp" data-k="sn" data-w="fresh"${fresh.length ? '' : ' disabled'}>В Simplenote — новые и изменённые · ${fresh.length}</button>
      <button class="small-btn" data-act="note.exp" data-k="sn" data-w="all">В Simplenote — все · ${all.length}</button>
      <button class="link small" data-act="note.exp" data-k="txt" data-w="all">Текстовыми файлами (.zip)</button></div>
    <p class="small muted" style="margin:12px 0 0">В Simplenote на компьютере: <b>Файл → Импорт заметок</b> (Import Notes) <b>→ Simplenote</b> → выберите скачанный notes.json. Теги, закреплённые и даты перенесутся.
      Simplenote добавляет заметки как новые — поэтому по умолчанию только созданные или изменённые здесь${at ? ` после прошлого экспорта ${fmtDate(at.slice(0, 10))}` : ''}, без двойных.</p>`, null);
  return false;
};
acts['note.exp'] = async (d) => {
  const c = app().ctx(), at = c.settings.notesExport?.at || '', all = notes().filter((n) => !n.deletedAt), list = d.w === 'fresh' ? all.filter((n) => changedHere(n, at)) : all;
  if (!list.length) { toast('Новых и изменённых заметок нет'); return false; }
  let ok;
  if (d.k === 'sn') {
    const json = JSON.stringify(toSimplenoteJson(list), null, 1);
    if (json.length > 4900000) { toast('Больше 5 МБ — Simplenote такой файл не примет. Выберите «новые и изменённые».'); return false; }
    ok = await download('notes.json', new Blob([json], { type: 'application/json' }), 'application/json');
  } else {
    const Zip = await drive.loadJsZip(), z = new Zip(), used = new Set();
    for (const n of list) {
      let nm = noteTitle(n).replace(/[\\/:*?"<>|«»]+/g, ' ').trim().slice(0, 60) || 'zametka', k = nm, i = 2;
      while (used.has(k)) k = `${nm} ${i++}`; used.add(k);
      z.file(`${k}.txt`, n.text + ((n.tags || []).length ? `\n\n${n.tags.map((t) => '#' + t).join(' ')}` : ''));
    }
    ok = await download(`zametki_${c.today}.zip`, await z.generateAsync({ type: 'blob' }), 'application/zip');
  }
  if (!ok) return false;
  if (d.k === 'sn') await app().store.saveSettings({ notesExport: { at: new Date().toISOString(), n: list.length } });
  closeSheet(); toast(d.k === 'sn' ? `Скачан notes.json · ${list.length} — загрузите его в Simplenote` : 'Заметки скачаны');
  return false;
};

// ---------- промты ----------
const prompts = () => (app().ctx().data.w_prompts || []).filter((p) => !p.deletedAt);
const promptOf = (id) => (app().ctx().data.w_prompts || []).find((p) => p.id === id);

function promptsPane(a) {
  const c = a.ctx(), ui = a.ui, pl = ui.prPlace || '', q = (ui.prQ || '').toLowerCase();
  const all = prompts();
  const list = all.filter((p) => (!pl || (p.place || 'any') === pl) && (!q || `${p.title} ${p.text}`.toLowerCase().includes(q)))
    .sort((x, y) => (y.uses || 0) - (x.uses || 0) || String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
  const found = docPromptTabs(c.wbooks, c.data.w_prompts);
  const counts = Object.fromEntries(Object.keys(PLACES).map((k) => [k, all.filter((p) => (p.place || 'any') === k).length]));
  const card = (p) => `<div class="pr-card" data-act="pr.edit" data-id="${p.id}">
      <div class="row between"><b>${esc(p.title || 'Без названия')}</b><button class="ed-ic" data-act="pr.copy" data-id="${p.id}" title="Скопировать" aria-label="Скопировать">${ic('copy')}</button></div>
      <div class="small muted">${PLACES[p.place || 'any']}${p.bookId ? ' · ' + esc(c.wbooksById[p.bookId]?.title || 'книга') : ''}${p.uses ? ` · брала ${p.uses} раз` : ''}</div>
      <p class="pr-prev">${esc(String(p.text || '').slice(0, 220))}</p></div>`;
  const html = `<div class="row between nb-prhead"><p class="small muted" style="margin:0;max-width:560px">Промт сам появляется там, где нужен: в Легенде (Идея, Каркас, Персонажи, Синопсис) и в редакторе главы — кнопка «Промты». Книга, Легенда и глава подставятся сами.</p><button class="primary" data-act="pr.new">+ Промт</button></div>
    ${found.length ? `<div class="card pr-found"><b>Промты во вкладках ваших Документов</b>${found.map((f) => `<div class="row between pr-f"><span>«${esc(f.tab)}»<span class="sub">${esc(f.book)}</span></span><button data-act="pr.fromDoc" data-b="${f.bookId}" data-t="${esc(f.tab)}">Взять</button></div>`).join('')}</div>` : ''}
    <div class="card nb-prlist">
      <div class="nb-head"><input type="search" class="nb-q" value="${esc(ui.prQ || '')}" placeholder="Поиск по промтам" data-chg="pr.q" aria-label="Поиск по промтам"></div>
      <div class="nb-chips"><button class="nb-chip${pl ? '' : ' on'}" data-act="pr.place" data-v="">Все <span>${all.length || ''}</span></button>${Object.entries(PLACES).filter(([k]) => counts[k]).map(([k, t]) => `<button class="nb-chip${pl === k ? ' on' : ''}" data-act="pr.place" data-v="${k}">${t} <span>${counts[k]}</span></button>`).join('')}</div>
      ${list.length ? `<div class="pr-grid">${list.map(card).join('')}</div>` : `<p class="muted nb-empty">${all.length ? 'Ничего не нашлось.' : 'Промтов пока нет. Добавьте свой — или возьмите из вкладки Документа, если там есть «Промт».'}</p>`}
    </div>`;
  return { html };
}
acts['pr.place'] = (d) => { app().ui.prPlace = d.v; };
changes['pr.q'] = (v) => { app().ui.prQ = v.trim(); app().rerender(); };
acts['pr.new'] = (d) => promptSheet(null, d.place || '');
acts['pr.edit'] = (d, el, e) => { if (e?.target?.closest('[data-act="pr.copy"]')) return false; promptSheet(promptOf(d.id)); return false; };
function promptSheet(p, place = '') {
  const c = app().ctx();
  openSheet(p ? 'Промт' : 'Новый промт', `<label for="prT">Название</label><input id="prT" name="title" value="${esc(p?.title || '')}" placeholder="например, Сцена от лица героини" required>
    <div class="f2"><div><label for="prP">Где пригодится</label><select id="prP" name="place">${Object.entries(PLACES).map(([k, t]) => opt(k, t, p?.place || place || 'any')).join('')}</select></div>
      <div><label for="prB">Для книги</label><select id="prB" name="bookId">${opt('', 'Для всех книг', p?.bookId || '')}${c.wbooks.filter((b) => b.status !== 'removed').map((b) => opt(b.id, b.title, p?.bookId || '')).join('')}</select></div></div>
    <label for="prX">Текст</label><textarea id="prX" name="text" rows="10" class="pr-text" required>${esc(p?.text || '')}</textarea>
    <div class="pr-vars small muted">Подставится само: ${VARS.map(([k, t]) => `<button type="button" class="nb-chip" data-act="pr.var" data-v="${esc(k)}" title="${esc(t)}">{${esc(k)}}</button>`).join('')}</div>
    ${p ? `<p style="margin-top:14px"><button type="button" class="link danger" data-act="pr.del" data-id="${p.id}">Удалить промт</button></p>` : ''}`,
  async (fd) => {
    const x = { ...(p || { id: 'p' + uid(), createdAt: now(), uses: 0 }), title: String(fd.get('title') || '').trim(), place: fd.get('place') || 'any', bookId: fd.get('bookId') || '', text: String(fd.get('text') || '').trim(), updatedAt: now() };
    if (!x.text) { toast('Впишите текст промта'); return false; }
    await app().store.put('w_prompts', x); toast(p ? 'Промт сохранён' : 'Промт добавлен');
  }, { submitText: p ? 'Сохранить' : 'Добавить' });
}
acts['pr.var'] = (d) => {
  const ta = document.getElementById('prX'); if (!ta) return false;
  const p = ta.selectionStart ?? ta.value.length, ins = `{${d.v}}`;
  ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd ?? p); ta.focus(); ta.setSelectionRange(p + ins.length, p + ins.length);
  return false;
};
acts['pr.del'] = async (d) => {
  const p = promptOf(d.id); if (!p) return false;
  closeSheet(); await app().store.put('w_prompts', { ...p, deletedAt: now() });
  toast('Промт удалён', { undo: () => { const { deletedAt, ...rest } = p; return app().store.put('w_prompts', rest); } });
  return false;
};
acts['pr.copy'] = async (d) => { const p = promptOf(d.id); toast((await copyRich(p?.text || '').catch(() => false)) ? 'Промт скопирован' : 'Не получилось скопировать'); return false; };
// взять промт из вкладки Документа «Промт…»
acts['pr.fromDoc'] = async (d) => {
  const b = app().ctx().wbooksById[d.b]; if (!b?.fileId) return false;
  try {
    await drive.ensureToken();
    const tab = findTab(await drive.getDoc(b.fileId), d.t); if (!tab) throw new Error('вкладка не найдена');
    const text = blocksText(contentToBlocks(tab.documentTab?.body?.content || [])).trim();
    if (!text) { toast('Вкладка пустая'); return false; }
    await app().store.put('w_prompts', { id: 'p' + uid(), title: `${d.t} — ${b.title}`, place: guessPlace(d.t), bookId: b.id, text, src: `${b.id}:${d.t}`, uses: 0, createdAt: now(), updatedAt: now() });
    toast('Промт добавлен — место можно поменять, нажав на него');
  } catch (e) { toast('Не получилось прочитать вкладку: ' + (e.message || e)); }
  return false;
};

// ---------- «Промты» в Легенде и редакторе: готовый текст с подставленной книгой ----------
// place — место, b — книга, extra — {глава, текст главы}
export function promptVars(b, extra = {}) {
  const L = legendOf(b), syn = synText(b);
  const main = chapterList(b).filter((t) => !isAuthorTab(t.title)), i = extra.глава ? main.findIndex((t) => t.title === extra.глава) : -1, p = i >= 0 ? L.plan[i] : null;
  return {
    книга: b.title, легенда: legendContext(L, { title: b.title, mode: 'work', synopsis: syn }), синопсис: syn,
    ...(p ? { 'каркас главы': [p.title, p.what, p.why ? 'Зачем: ' + p.why : ''].filter(Boolean).join('\n') } : {}),
    ...extra,
  };
}
export const promptCount = (place, bookId) => promptsFor(prompts(), place, bookId).length;
export function openPrompts(place, b, extra = {}) {
  const list = promptsFor(prompts(), place, b.id), vars = promptVars(b, extra);
  const row = (p) => {
    const miss = missingVars(fillPrompt(p.text, vars));
    return `<div class="pr-pick"><div class="row between"><b>${esc(p.title || 'Без названия')}</b><span class="small muted">${PLACES[p.place || 'any']}</span></div>
      <p class="pr-prev">${esc(fillPrompt(p.text, vars).slice(0, 180))}</p>
      ${miss.length ? `<p class="small muted" style="margin:0 0 6px">Без значения: ${miss.map((k) => `{${esc(k)}}`).join(', ')}${miss.some((k) => /глав/.test(k)) ? ' — откройте нужную главу в редакторе' : ''}</p>` : ''}
      <div class="row"><button data-act="pr.use" data-id="${p.id}" data-to="claude">Скопировать и открыть Claude</button><button class="link" data-act="pr.use" data-id="${p.id}">Только скопировать</button></div></div>`;
  };
  openSheet(`Промты — ${PLACES[place]}`, `${list.length ? list.map(row).join('') : `<p class="muted">Для этого места промтов пока нет.</p>`}
    <p style="margin-top:14px"><button class="link" data-act="pr.newHere" data-place="${place}">+ Новый промт для этого места</button> · <button class="link" data-act="pr.all">Все промты</button></p>`, null);
  openPrompts.vars = vars;
}
acts['pr.use'] = async (d) => {
  const p = promptOf(d.id); if (!p) return false;
  const text = fillPrompt(p.text, openPrompts.vars || {});
  // копирование начинается в момент нажатия, окно чата — следом
  if (d.to === 'claude') { const pc = copyRich(text).catch(() => false); window.open('https://claude.ai/new', '_blank', 'noopener'); toast((await pc) ? 'Скопировано — вставьте в чат и отправьте' : 'Не получилось скопировать'); }
  else toast((await copyRich(text).catch(() => false)) ? 'Промт скопирован — книга подставлена' : 'Не получилось скопировать');
  app().store.put('w_prompts', { ...p, uses: (p.uses || 0) + 1, usedAt: now() });
  return false;
};
acts['pr.newHere'] = (d) => { closeSheet(); setTimeout(() => promptSheet(null, d.place), 50); return false; };
acts['pr.all'] = () => { closeSheet(); app().go('/ideas/prompts'); return false; };
