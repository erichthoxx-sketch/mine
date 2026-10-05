import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, closeSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { recordProgress, written, pace, forecastDate, charsAt, contestStatus, daysLeft } from '../wcalc.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';

const app = () => window.__app;
export const STATUS = { progress: 'В процессе', done: 'Завершена' };
export const PLATFORMS = ['Литнет', 'Литмаркет', 'Литгород'];
const zn = (n) => num(n || 0) + ' зн.';

export function driveBar(c) {
  if (!drive.driveConfigured) return '<p class="small muted">Google Диск ещё не подключён к приложению — см. Настройки (шестерёнка вверху).</p>';
  if (!drive.isConnected()) return '<button class="primary" data-act="drive.connect">Подключить Google Диск</button>';
  if (!c.settings.wBooksFolder) return '<button class="primary" data-act="go" data-to="/settings">Выбрать папку с книгами</button>';
  return `<div class="row"><span class="badge good">● Google Диск подключён</span><button data-act="wbook.refresh">Обновить знаки</button></div>`;
}

function tile(c, b) {
  const today = written(b.history, c.today, 1);
  return `<a href="#" class="cover-tile" data-act="go" data-to="/book/${b.id}">
    <div class="cover">${b.cover ? `<img src="${b.cover}" alt="">` : `<div class="cover-ph"><span>${esc(b.title)}</span></div>`}</div>
    <div class="ct-title">${esc(b.title)}</div>
    <div class="tags"><span class="tag ${b.status === 'done' ? '' : 'on'}">${STATUS[b.status] || STATUS.progress}</span>${(b.platforms || []).map((p) => `<span class="tag">${esc(p)}</span>`).join('')}</div>
    <div class="ct-num">${zn(b.chars)}${today ? ` <span class="up">+${num(today)}</span>` : ''}</div></a>`;
}

export function booksView(a) {
  const c = a.ctx();
  const active = c.wbooks.filter((b) => b.status !== 'done').length;
  const html = `
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
  const ideas = c.data.w_ideas.filter((x) => x.bookId === b.id);
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
  ${(b.tabs || []).length ? `<div class="card"><h2>Главы (вкладки документа)</h2><div class="scroll"><table><tr><th>Вкладка</th><th>Знаков</th></tr>${b.tabs.map((t) => `<tr><td>${esc(t.title)}</td><td>${num(t.chars)}</td></tr>`).join('')}<tr class="total"><td>Всего</td><td>${num(b.chars)}</td></tr></table></div></div>` : ''}
  ${contests.length ? `<div class="card"><h2>Конкурсы</h2>${contests.map((x) => { const s = contestStatus(x, b, c.today); return `<div class="item small"><b>${esc(x.name)}</b> · ${s.daysLeft == null ? '' : s.daysLeft < 0 ? 'завершён' : 'осталось ' + s.daysLeft + ' дн.'}${s.need != null ? ` · нужно ещё ${zn(s.need)}` : ''}</div>`; }).join('')}</div>` : ''}
  ${ideas.length ? `<div class="card"><h2>Идеи к книге</h2>${ideas.map((x) => `<div class="item small">${ic('ideas')} ${esc(x.title || x.text.slice(0, 60))}</div>`).join('')}</div>` : ''}
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
acts['wbook.refresh'] = () => refreshAll(app());
acts['wbook.refreshOne'] = async (d) => { try { await refreshOne(app(), app().ctx().wbooksById[d.id], true); toast('Знаки обновлены'); } catch (e) { toast(e.message); } };
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
function pickSheet() {
  openSheet('Файлы в папке с книгами', picked.length ? `<p class="small muted">Нажмите «Добавить» у файлов-книг. Остальные файлы (синопсисы, черновики) просто пропустите.</p><div class="list">${picked.map((f, i) => `<div class="item row between"><span><b>${esc(f.name)}</b><br><span class="small muted">${f.mimeType === drive.MIME.docx ? 'Word' : 'Google Документ'}${f.path ? ' · ' + esc(f.path) : ''}</span></span><button type="button" class="primary" data-act="wbook.addFile" data-i="${i}">Добавить</button></div>`).join('')}</div>` : '<p>Все документы из папки уже добавлены.</p>', null);
}
acts['wbook.pick'] = async () => {
  const c = app().ctx();
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
  await app().store.put('w_books', { ...b, ...patch });
  toast('Сохранено');
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
