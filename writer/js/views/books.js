import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, closeSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { recordProgress, written, pace, forecastDate, charsAt, contestStatus, daysLeft } from '../wcalc.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';
import { finishEvent, removeEvent, chapterEvent, chapterUnset } from '../sync.js';

const app = () => window.__app;
export const STATUS = { idea: 'Идея', progress: 'В процессе', done: 'Завершена' };
export const PLATFORMS = ['Литнет', 'Литмаркет', 'Литгород'];
const zn = (n) => num(n || 0) + ' зн.';

export function driveBar(c) {
  if (!drive.driveConfigured) return '<p class="small muted">Google Диск ещё не подключён к приложению — см. Настройки (шестерёнка вверху).</p>';
  if (!drive.isConnected()) return '<button class="primary" data-act="drive.connect">Подключить Google Диск</button>';
  if (!c.settings.wBooksFolder) return '<button class="primary" data-act="go" data-to="/settings">Выбрать папку с книгами</button>';
  const fresh = drive.hasFreshToken();
  return `<div class="row"><span class="badge good">● Google Диск подключён</span><button data-act="wbook.refresh">Обновить с Диска</button></div>
    ${fresh ? '' : '<div class="small muted" style="margin-top:6px">Google даёт доступ на час — нажмите «Обновить с Диска», знаки подтянутся.</div>'}`;
}

// активные конкурсы книги: метка «Конкурс · N дн.»
const liveContests = (c, b) => c.data.w_contests.filter((x) => x.bookId === b.id && x.status !== 'done' && !(x.end && x.end < c.today));
const daysTo = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
function contestTags(c, b) {
  const l = liveContests(c, b);
  return l.length ? `<div class="tags">${l.map((x) => `<span class="tag on">Конкурс${x.end ? ` · ${daysTo(x.end, c.today)} дн.` : ''}</span>`).join('')}</div>` : '';
}
// напоминания: конкурсы, которые заканчиваются в ближайшую неделю
function contestReminders(c) {
  const soon = c.data.w_contests.filter((x) => x.end && x.status !== 'done' && x.end >= c.today && daysTo(x.end, c.today) <= 7).sort((a, b) => a.end.localeCompare(b.end));
  return soon.map((x) => { const b = x.bookId ? c.wbooksById[x.bookId] : null; const s2 = contestStatus(x, b, c.today); const n = daysTo(x.end, c.today);
    return `<div class="alert" style="margin-bottom:10px">⏳ Конкурс «${esc(x.name)}»: ${n === 0 ? 'заканчивается сегодня' : `до конца ${n} дн.`}${b ? ` · ${esc(b.title)}` : ''}${s2.need ? ` · нужно ещё ${zn(s2.need)}` : ''} <button class="link" data-act="go" data-to="/plan" style="padding:0">в планер</button></div>`; }).join('');
}

function tile(c, b) {
  const today = written(b.history, c.today, 1);
  return `<a href="#" class="cover-tile" data-act="go" data-to="/book/${b.id}">
    <div class="cover">${b.cover ? `<img src="${b.cover}" alt="">` : `<div class="cover-ph"><span>${esc(b.title)}</span></div>`}</div>
    <div class="ct-title">${esc(b.title)}</div>
    <div class="tags"><span class="tag ${b.status === 'progress' || !b.status ? 'on' : ''}">${STATUS[b.status] || STATUS.progress}</span>${(b.platforms || []).map((p) => `<span class="tag">${esc(p)}</span>`).join('')}</div>
    ${contestTags(c, b)}
    <div class="ct-num">${zn(b.chars)}${today ? ` <span class="up">+${num(today)}</span>` : ''}</div></a>`;
}

export function booksView(a) {
  const c = a.ctx();
  const active = c.wbooks.filter((b) => b.status !== 'done' && b.status !== 'idea').length;
  const html = `
  ${contestReminders(c)}
  <div class="card">
    <div class="grid3">
      <div><div class="k small muted">Сегодня написано</div><div class="big">${num(c.writtenToday)}</div><div class="small muted">знаков</div></div>
      <div><div class="k small muted">За 7 дней</div><div class="big">${num(c.writtenWeek)}</div><div class="small muted">знаков</div></div>
      <div><div class="k small muted">В работе</div><div class="big">${active}</div><div class="small muted">книг</div></div>
    </div>
    <div style="margin-top:12px">${driveBar(c)}</div>
  </div>
  <div class="row between" style="margin:16px 0 10px"><h2 style="margin:0">Книги</h2><button class="primary" data-act="wbook.new">+ Книга</button></div>
  ${c.wbooks.length ? `<div class="covers">${c.wbooks.map((b) => tile(c, b)).join('')}</div>` : '<div class="card"><p>Книг пока нет. Нажмите «+ Книга» и выберите файл на Google Диске — или добавьте книгу без файла.</p></div>'}`;
  return { html };
}

export function bookPage(a, id) {
  const c = a.ctx();
  const b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p><a href="#" data-act="go" data-to="/">← Все книги</a></div>' };
  const h = b.history || {};
  const p = pace(h, c.today);
  const fc = b.planChars ? forecastDate(h, c.today, Number(b.planChars)) : null;
  const contests = c.data.w_contests.filter((x) => x.bookId === b.id);
  // идеи к книге — самые свежие сверху; на странице книги не больше 8
  const ideas = c.data.w_ideas.filter((x) => x.bookId === b.id).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const IDEAS_MAX = 8;
  const extra = (b.platforms || []).filter((x) => !PLATFORMS.includes(x)).join(', ');
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/">← Все книги</a></p>
  <div class="card book-head">
    <div class="cover big">${b.cover ? `<img src="${b.cover}" alt="">` : `<div class="cover-ph"><span>${esc(b.title)}</span></div>`}
      <label class="btn small-btn">${b.cover ? 'Сменить обложку' : 'Загрузить обложку'}<input type="file" accept="image/*" data-chg="wbook.cover" data-id="${b.id}" hidden></label></div>
    <div class="book-info">
      <h2>${esc(b.title)}</h2>
      <div class="tags"><span class="tag on">${STATUS[b.status] || STATUS.progress}</span>${(b.platforms || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      ${b.webViewLink ? `<a class="btn primary" href="${esc(b.webViewLink)}" target="_blank" rel="noopener" style="margin:12px 0">✎ Открыть в Google Документах</a>` : ''}
      <dl class="dl">
        <dt>Всего знаков (с пробелами)</dt><dd>${zn(b.chars)}</dd>
        <dt>Сегодня / за 7 дней</dt><dd><span class="up">+${num(written(h, c.today, 1))}</span> / <span class="up">+${num(written(h, c.today, 7))}</span></dd>
        <dt>Темп за 2 недели</dt><dd>${p ? num(Math.round(p)) + ' зн. в день' : '—'}</dd>
        ${b.planChars ? `<dt>План ${zn(b.planChars)}</dt><dd>${(b.chars || 0) >= b.planChars ? 'набран ✔︎' : fc ? 'при таком темпе — к ' + fmtDate(fc) : 'темпа пока нет'}</dd>` : ''}
        <dt>Последняя правка файла</dt><dd>${b.modifiedTime ? fmtDate(b.modifiedTime.slice(0, 10)) : '—'}${b.countedAt ? ` <span class="muted small">· знаки обновлены ${fmtDate(b.countedAt.slice(0, 10))} ${b.countedAt.slice(11, 16)}</span>` : ''}</dd>
      </dl>
      ${b.fileId ? `<div class="row" style="margin-top:8px"><button data-act="wbook.refreshOne" data-id="${b.id}">Обновить знаки</button></div>` : ''}
    </div>
  </div>
  ${(b.tabs || []).length ? `<div class="card"><h2>Главы (вкладки документа)</h2><div class="scroll"><table><tr><th>Вкладка</th><th>Знаков</th><th>Выложена</th></tr>${b.tabs.map((t) => { const p2 = (b.published || {})[t.title]; return `<tr><td>${esc(t.title)}</td><td>${num(t.chars)}</td><td>${p2 ? `${fmtDate(p2)} <button class="link" style="padding:0" data-act="ch.unpub" data-id="${b.id}" data-t="${esc(t.title)}">отменить</button>` : `<button class="link" style="padding:0" data-act="ch.pubOne" data-id="${b.id}" data-t="${esc(t.title)}">сегодня</button>`}</td></tr>`; }).join('')}<tr class="total"><td>Всего</td><td>${num(b.chars)}</td><td>${Object.keys(b.published || {}).length}</td></tr></table></div>
    <div class="hint">Отметка «выложена» сразу появляется событием «Выкладка главы» в приложении «Доходы».</div></div>` : ''}
  ${contests.length ? `<div class="card"><h2>Конкурсы</h2>${contests.map((x) => { const s = contestStatus(x, b, c.today); return `<div class="item small"><b>${esc(x.name)}</b> · ${s.daysLeft == null ? '' : s.daysLeft < 0 ? 'завершён' : 'осталось ' + s.daysLeft + ' дн.'}${s.need != null ? ` · нужно ещё ${zn(s.need)}` : ''}</div>`; }).join('')}</div>` : ''}
  <div class="card"><div class="row between"><h2 style="margin:0">Идеи к книге</h2><button data-act="idea.newFor" data-book="${b.id}">+ Идея</button></div>
    ${ideas.length ? `<div class="list" style="margin-top:6px">${ideas.slice(0, IDEAS_MAX).map((x) => `<a class="item row between" href="#" data-act="idea.open" data-id="${x.id}" data-book="${b.id}"><span>${ic('ideas')} ${esc(x.title || x.text.slice(0, 60))}</span><span class="small muted">${(x.comments || []).length ? `${(x.comments || []).length} комм.` : ''}</span></a>`).join('')}</div>
      ${ideas.length > IDEAS_MAX ? `<div style="margin-top:10px"><button data-act="idea.open" data-book="${b.id}">Все идеи к книге (${ideas.length})</button></div>` : ''}` : '<p class="small muted" style="margin:8px 0 0">Идей к этой книге пока нет.</p>'}</div>
  <div class="card"><h2>О книге</h2>
  <form data-form="wbook.save" data-id="${b.id}">
    <label for="bt" style="margin-top:0">Название</label><input id="bt" name="title" value="${esc(b.title)}" required>
    <label for="bs">Статус</label><select id="bs" name="status">${Object.entries(STATUS).map(([k, v]) => opt(k, v, b.status || 'progress')).join('')}</select>
    <label>Где выкладывается</label><div class="checks">${PLATFORMS.map((x) => `<label class="check"><input type="checkbox" name="pf" value="${x}"${(b.platforms || []).includes(x) ? ' checked' : ''}>${x}</label>`).join('')}</div>
    <label for="bx">Другие площадки (через запятую)</label><input id="bx" name="pfx" value="${esc(extra)}">
    <div class="f2"><div><label for="bp">План по объёму, знаков</label><input id="bp" name="planChars" inputmode="numeric" value="${b.planChars ?? ''}"></div>
    <div><label for="bi">Книга в приложении доходов</label><select id="bi" name="incomeBookId"><option value="">—</option>${c.incomeBooks.map((x) => opt(x.id, x.title, c.incomeIdOf(b))).join('')}</select></div></div>
    ${b.fileId ? '' : `<label for="bm">Знаков сейчас (книга без файла)</label><input id="bm" name="manualChars" inputmode="numeric" value="${b.chars ?? ''}">`}
    <label for="bl">Ссылка на файл (если без Google Диска)</label><input id="bl" name="link" value="${esc(b.fileId ? '' : b.webViewLink || '')}" ${b.fileId ? 'disabled placeholder="файл с Google Диска подключён"' : ''}>
    <label for="bn">Заметки</label><textarea id="bn" name="note">${esc(b.note || '')}</textarea>
    <div class="row between" style="margin-top:14px"><button class="primary" type="submit">Сохранить</button><button type="button" class="danger" data-act="wbook.del" data-id="${b.id}">Убрать из приложения</button></div>
  </form></div>`;
  return { html };
}

// ---------- обновление знаков ----------
export async function refreshOne(a, b, force = false) {
  const c = a.ctx();
  const meta = await drive.fileMeta(b.fileId);
  if (!force && meta.modifiedTime === b.modifiedTime && charsAt(b.history, c.today) != null && (b.history || {})[c.today] != null) return false;
  const r = await drive.countFile(meta);
  await a.store.put('w_books', { ...b, title: b.title || meta.name, chars: r.total, tabs: r.tabs, modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink, mimeType: meta.mimeType, countedAt: new Date().toISOString(), history: recordProgress(b.history, c.today, r.total) });
  return true;
}
export async function refreshAll(a, { quiet = false } = {}) {
  const list = a.ctx().wbooks.filter((b) => b.fileId);
  let n = 0;
  try {
    for (const b of list) if (await refreshOne(a, b)) n++;
    if (!quiet) toast(n ? `Знаки обновлены: ${n} кн.` : 'Изменений в файлах нет');
  } catch (e) { if (!quiet || e instanceof drive.NeedAuth) toast(e.message); }
}
acts['wbook.refresh'] = async () => { try { await drive.ensureToken(); } catch (e) { toast(e.message); return; } await refreshAll(app()); app().rerender(); };
acts['wbook.refreshOne'] = async (d) => { try { await drive.ensureToken(); await refreshOne(app(), app().ctx().wbooksById[d.id], true); toast('Знаки обновлены'); } catch (e) { toast(e.message); } };
acts['drive.connect'] = async () => {
  try { await drive.connect(); toast('Google Диск подключён'); refreshAll(app(), { quiet: true }); } catch (e) { toast(e.message); }
};

// ---------- добавление книги ----------
acts['wbook.new'] = () => {
  const c = app().ctx();
  const ready = drive.isConnected() && c.settings.wBooksFolder;
  openSheet('Новая книга', `
    ${ready ? '<button type="button" class="primary wide" data-act="wbook.pick">Выбрать файл на Google Диске</button>' : `<p class="small muted">${drive.isConnected() ? 'Сначала выберите папку с книгами в Настройках (шестерёнка вверху).' : 'Подключите Google Диск, чтобы выбирать файлы книг.'}</p>`}
    <h3>Или создать новую книгу</h3>
    <label for="nb">Название</label><input id="nb" name="title">
    <label class="check"><input type="checkbox" name="mkdoc" ${ready ? 'checked' : 'disabled'}>Создать Google Документ в папке с книгами</label>`, async (fd) => {
    const title = (fd.get('title') || '').trim();
    if (!title) { toast('Впишите название'); return false; }
    let file = null;
    if (fd.get('mkdoc')) { try { file = await drive.createDoc(title, c.settings.wBooksFolder); } catch (e) { toast(e.message); return false; } }
    const id = 'w' + uid();
    await app().store.put('w_books', { id, title, status: 'progress', platforms: ['Литнет'], chars: 0, history: { [c.today]: 0 }, fileId: file?.id || '', webViewLink: file?.webViewLink || '', mimeType: file?.mimeType || '', modifiedTime: file?.modifiedTime || '', createdAt: new Date().toISOString() });
    toast('Книга добавлена');
    app().go('/book/' + id);
  }, { submitText: 'Создать' });
};
let picked = [];
function pickSheet(title = 'Файлы в папке с книгами') {
  openSheet(title, `${picked.length ? `<p class="small muted">Нажмите «Добавить» у файлов-книг. Остальные файлы (синопсисы, черновики) просто пропустите.</p><div class="list">${picked.map((f, i) => `<div class="item row between pick"><span><b>${esc(f.name)}</b><br><span class="small muted">${f.mimeType === drive.MIME.docx ? 'Word' : 'Google Документ'}${f.path ? ' · ' + esc(f.path) : ''}</span></span><button type="button" data-act="wbook.addFile" data-i="${i}">Добавить</button></div>`).join('')}</div>` : '<p>Новых документов не нашлось.</p>'}
    <h3>Нет нужной книги?</h3>
    <p class="small muted">Если файл лежит в другой папке или им поделились с вами — найдите его по названию на всём Диске.</p>
    <div class="row"><input id="ws" placeholder="часть названия" style="flex:1" aria-label="Название книги"><button type="button" data-act="wbook.search">Найти</button></div>`, null);
}
acts['wbook.search'] = async () => {
  const qv = (document.getElementById('ws')?.value || '').trim();
  if (!qv) { toast('Впишите часть названия'); return; }
  try { await drive.ensureToken(); } catch (e) { toast(e.message); return; }
  try {
    const have = new Set(app().ctx().wbooks.map((b) => b.fileId));
    picked = (await drive.searchDocs(qv)).filter((f) => !have.has(f.id));
    pickSheet(`Найдено по «${qv}»`);
  } catch (e) { toast(e.message); }
};
acts['wbook.pick'] = async () => {
  const c = app().ctx();
  try { await drive.ensureToken(); } catch (e) { toast(e.message); return; }
  closeSheet(); toast('Загружаю список файлов…');
  try {
    const have = new Set(c.wbooks.map((b) => b.fileId));
    picked = (await drive.listDocsTree(c.settings.wBooksFolder)).filter((f) => !have.has(f.id));
    pickSheet();
  } catch (e) { toast(e.message); }
};
acts['wbook.addFile'] = async (d) => {
  const f = picked[Number(d.i)];
  if (!f) return;
  const id = 'w' + uid();
  const b = { id, title: f.name.replace(/\.docx$/i, ''), fileId: f.id, mimeType: f.mimeType, webViewLink: f.webViewLink, modifiedTime: '', status: 'progress', platforms: ['Литнет'], chars: 0, history: {}, createdAt: new Date().toISOString() };
  await app().store.put('w_books', b);
  picked.splice(Number(d.i), 1); pickSheet();
  try { await refreshOne(app(), b, true); toast(`«${b.title}» добавлена`); } catch (e) { toast(e.message); }
};

// ---------- карточка книги ----------
forms['wbook.save'] = async (fd, f) => {
  const c = app().ctx(), b = c.wbooksById[f.dataset.id];
  const platforms = [...fd.getAll('pf'), ...String(fd.get('pfx') || '').split(',').map((x) => x.trim()).filter(Boolean)];
  const patch = { title: fd.get('title').trim(), status: fd.get('status'), platforms, planChars: N(fd.get('planChars')), incomeBookId: fd.get('incomeBookId') || '', note: fd.get('note') || '' };
  if (!b.fileId) {
    patch.webViewLink = (fd.get('link') || '').trim();
    const m = N(fd.get('manualChars'));
    if (m != null && !Number.isNaN(m)) { patch.chars = m; patch.history = recordProgress(b.history, c.today, m); }
  }
  if (patch.status === 'done' && b.status !== 'done') { patch.finishedAt = b.finishedAt || c.today; await finishEvent(c, { ...b, ...patch }, patch.finishedAt); }
  if (patch.status !== 'done' && b.status === 'done') { patch.finishedAt = ''; await removeEvent(`w:${b.id}:finish`); }
  await app().store.put('w_books', { ...b, ...patch });
  toast(patch.status === 'done' && b.status !== 'done' ? 'Сохранено — завершение отмечено в «Доходах»' : 'Сохранено');
};
acts['ch.pubOne'] = async (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  await app().store.put('w_books', { ...b, published: { ...(b.published || {}), [d.t]: c.today } });
  await chapterEvent(c, b, d.t, c.today);
  toast('Глава отмечена — и в «Доходах» тоже');
};
acts['ch.unpub'] = async (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  const published = { ...(b.published || {}) }; delete published[d.t];
  await app().store.put('w_books', { ...b, published });
  await chapterUnset(b, d.t);
};
changes['wbook.cover'] = async (v, el) => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  const c = app().ctx(), b = c.wbooksById[el.dataset.id];
  try {
    const cover = await resizeImage(file, 480);
    await app().store.put('w_books', { ...b, cover });
    toast('Обложка загружена');
    // заодно кладём в галерею маркетинга, оригинал — на Диск, если подключён
    const { saveMedia } = await import('./marketing.js');
    await saveMedia(file, { type: 'cover', bookId: b.id, thumb: await resizeImage(file, 600) });
  } catch (e) { toast(e.message); }
};
acts['wbook.del'] = async (d) => {
  if (!(await ask('Убрать книгу из приложения? Файл на Google Диске останется.', 'Убрать'))) return;
  await app().store.remove('w_books', d.id);
  app().go('/');
};
export { daysLeft };
