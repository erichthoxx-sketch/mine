import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, closeSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate, plural } from '../../../js/format.js';
import { recordProgress, written, writtenToday, writtenWeek, pace, forecastDate, charsAt, contestStatus, daysLeft, pubMap, pubState, pubPlatforms, chapterOutDates, plannedPubs, chapterList, bookSchedule, DOW, scheduleDates, planBySchedule } from '../wcalc.js';
export { chapterList };
import { mkSummary } from './marketing.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';
import { addDays } from '../../../js/calc.js';
import { finishEvent, removeEvent, chapterEvent, chapterUnset } from '../sync.js';

const app = () => window.__app;
export const STATUS = { idea: 'Идея', progress: 'В процессе', done: 'Завершена' };
export const PLATFORMS = ['Литнет', 'Литмаркет', 'Литгород', 'Литрес'];
const zn = (n) => num(n || 0) + ' зн.';

// Google Диск: подключён — точка-маркер; не подключён или нет папки — нужная кнопка
export const driveReady = (c) => drive.driveConfigured && drive.isConnected() && !!c.settings.wBooksFolder;
export function driveBar(c) {
  if (!drive.driveConfigured) return '<p class="small muted" style="margin:12px 0 0">Google Диск ещё не подключён к приложению — см. Настройки (шестерёнка вверху).</p>';
  if (!drive.isConnected()) return '<div style="margin-top:12px"><button class="primary" data-act="drive.connect">Подключить Google Диск</button></div>';
  if (!c.settings.wBooksFolder) return '<div style="margin-top:12px"><button class="primary" data-act="go" data-to="/settings">Выбрать папку с книгами</button></div>';
  return '';
}
// маленькая точка: синяя — Диск подключён, красная — нет
export const driveDot = (c) => `<span class="ddot ${driveReady(c) ? 'on' : 'off'}" title="${driveReady(c) ? 'Google Диск подключён' : 'Google Диск не подключён'}" aria-label="${driveReady(c) ? 'Google Диск подключён' : 'Google Диск не подключён'}"></span>`;
// для Главной: точка + «обновить» одной аккуратной кнопкой
export function driveChip(c) {
  if (!driveReady(c)) return `<button class="drive-chip" data-act="${drive.isConnected() ? 'go' : 'drive.connect'}" data-to="/settings">${driveDot(c)}Диск</button>`;
  return `<button class="drive-chip" data-act="wbook.refresh" title="Обновить знаки с Google Диска">${driveDot(c)}${ic('refresh')}Обновить</button>`;
}

// активные конкурсы книги: метка «Конкурс · N дн.»
const liveContests = (c, b) => c.data.w_contests.filter((x) => x.bookId === b.id && x.status !== 'done' && !(x.end && x.end < c.today));
const daysTo = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
function contestTags(c, b) {
  const l = liveContests(c, b);
  return l.length ? `<div class="tags">${l.map((x) => `<span class="tag on">Конкурс${x.end ? ` · ${daysTo(x.end, c.today)} дн.` : ''}</span>`).join('')}</div>` : '';
}
function tile(c, b) {
  const today = writtenToday(b, c.today);
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
  <div class="card">
    <div class="grid3">
      <div><div class="k small muted">Сегодня написано</div><div class="big">${num(c.writtenToday)}</div><div class="small muted">${plural(c.writtenToday, ['знак', 'знака', 'знаков'])}</div></div>
      <div><div class="k small muted">За 7 дней</div><div class="big">${num(c.writtenWeek)}</div><div class="small muted">${plural(c.writtenWeek, ['знак', 'знака', 'знаков'])}</div></div>
      <div><div class="k small muted">В работе</div><div class="big">${active}</div><div class="small muted">${plural(active, ['книга', 'книги', 'книг'])}</div></div>
    </div>
    ${driveBar(c)}
  </div>
  <div class="row between" style="margin:16px 0 10px"><h2 style="margin:0">Книги ${driveDot(c)}</h2><button class="primary" data-act="wbook.new">+ Книга</button></div>
  ${c.wbooks.length ? `<div class="covers">${c.wbooks.map((b) => tile(c, b)).join('')}</div>` : '<div class="card"><p>Книг пока нет. Нажмите «+ Книга» и выберите файл на Google Диске — или добавьте книгу без файла.</p></div>'}`;
  return { html };
}

// компактная дата «07.10»
// «уже было выложено» до начала учёта — дата условная, событий нет
const PAST = '2000-01-01';
const dm = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');
const mark = (ok) => (ok ? '<span class="up">✓</span>' : '<span class="muted">—</span>');
function bar(label, share, right, hint = '') {
  const v = Math.max(0, Math.min(1, share || 0));
  return `<div class="wbar"><div class="row between small"><span>${label}</span><span>${right}</span></div><div class="progress"><i style="width:${(v * 100).toFixed(1)}%"></i></div>${hint ? `<div class="small muted">${hint}</div>` : ''}</div>`;
}
const whenTxt = (n) => (n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`);
export const daysTxt = (days) => (days || []).map(Number).sort().map((x) => DOW[x - 1]).join(', ');
// Прогресс книги: главы (написано / выложено) по примерному плану глав, график выкладки, конкурсы с условием по объёму
export function progressBlock(c, b) {
  const t = c.today, s = bookSchedule(b, t), chs = chapterList(b), parts = [];
  const total = s.planCh || chs.length;
  if (s.planCh) parts.push(bar('Написано глав', s.written / s.planCh, `${s.written} из ≈${s.planCh}`, s.doneWriting ? 'все главы написаны' : s.finish ? `допишу к ${fmtDate(s.finish)}${b.finishBy ? '' : ' — по темпу'}` : ''));
  else parts.push(`<div class="small">Написано глав: <b>${s.written}</b> <span class="muted">· укажите, сколько примерно глав в книге, — сроки посчитаются сами</span></div>`);
  if (total) parts.push(bar('Выложено', s.out / total, `${s.out} из ${s.planCh ? '≈' + s.planCh : total}`, [b.publishStart ? `с ${fmtDate(b.publishStart)}` : '', b.pubDays?.length ? `по графику: ${daysTxt(b.pubDays)}` : '', s.until ? `до ${fmtDate(s.until)}${b.publishUntil ? '' : ' — посчитано'}` : ''].filter(Boolean).join(' · ')));
  if (s.next) parts.push(`<div class="small">Следующая: <b>${s.next.ch ? esc(s.next.ch) : 'новая глава'}</b> — ${esc(s.next.pf)}, ${fmtDate(s.next.date)} (${whenTxt(diffD(s.next.date, t))})</div>`);
  for (const x of liveContests(c, b)) {
    const st = contestStatus(x, b, t);
    parts.push(`<div class="small">Конкурс «${esc(x.name)}»${st.daysLeft != null ? ` · осталось ${st.daysLeft} дн.` : ''}${x.minChars ? ` — объём ${num(st.chars)} из ${num(x.minChars)} зн.: ${st.need === 0 ? '<span class="up">✓ проходит</span>' : `не хватает ${num(st.need)} зн.${st.perDay ? ` (~${num(st.perDay)} в день)` : ''}${st.onTrack ? ' — по темпу успеваю' : ''}`}` : ''}</div>`);
  }
  return parts.join('');
}
const diffD = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
changes['wb.planCh'] = async (v, el) => {
  const b = app().ctx().wbooksById[el.dataset.id], n = N(v);
  await app().store.put('w_books', { ...b, planChapters: n && n > 0 ? Math.round(n) : null });
};

export function bookPage(a, id) {
  const c = a.ctx();
  const b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p><a href="#" data-act="go" data-to="/books">← Все книги</a></div>' };
  const h = b.history || {};
  const p = pace(h, c.today);
  const contests = c.data.w_contests.filter((x) => x.bookId === b.id);
  // идеи к книге — самые свежие сверху; на странице книги не больше 8
  const ideas = c.data.w_ideas.filter((x) => x.bookId === b.id && !x.deletedAt).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const IDEAS_MAX = 8;
  const extra = (b.platforms || []).filter((x) => !PLATFORMS.includes(x)).join(', ');
  const chs = chapterList(b), pm = pubMap(b), pfs = pubPlatforms(b), outN = Object.keys(chapterOutDates(b, c.today)).length;
  const planned = plannedPubs(b, c.today);
  const other = (b.tabs || []).filter((t) => t.counted === false);
  const mk = mkSummary(c, b);
  const cell = (ch, pf) => {
    const v = (pm[ch] || {})[pf], st = pubState(v, c.today);
    const cls = st === 'done' ? 'pill done' : st === 'wait' ? 'pill wait' : 'pill';
    return `<td class="pc"><button class="${cls}" data-act="pub.mark" data-id="${b.id}" data-ch="${esc(ch)}" data-pf="${esc(pf)}">${st === 'done' ? (v.past ? '✓' : dm(v.date)) : st === 'wait' ? '⏱ ' + dm(v.date) : '—'}</button></td>`;
  };
  const sch = bookSchedule(b, c.today);

  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/books">← Все книги</a></p>
  <div class="card book-head">
    <div class="cover big">${b.cover ? `<img src="${b.cover}" alt="">` : `<div class="cover-ph"><span>${esc(b.title)}</span></div>`}
      <label class="btn small-btn">${b.cover ? 'Сменить обложку' : 'Загрузить обложку'}<input type="file" accept="image/*" data-chg="wbook.cover" data-id="${b.id}" hidden></label></div>
    <div class="book-info">
      <h2>${esc(b.title)}</h2>
      <div class="tags"><span class="tag on">${STATUS[b.status] || STATUS.progress}</span>${(b.platforms || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      ${contestTags(c, b)}
      ${b.webViewLink ? `<a class="btn primary" href="${esc(b.webViewLink)}" target="_blank" rel="noopener" style="margin:12px 0">✎ Открыть в Google Документах</a>` : ''}
      <dl class="dl">
        <dt>Всего знаков (с пробелами)</dt><dd>${zn(b.chars)}</dd>
        <dt>Сегодня / за 7 дней</dt><dd><span class="up">+${num(writtenToday(b, c.today))}</span> / <span class="up">+${num(writtenWeek(b, c.today))}</span></dd>
        <dt>Темп за 2 недели</dt><dd>${p ? num(Math.round(p)) + ' зн. в день' : '—'}</dd>
        <dt>Последняя правка файла</dt><dd>${b.modifiedTime ? fmtDate(b.modifiedTime.slice(0, 10)) : '—'}${b.countedAt ? ` <span class="muted small">· знаки обновлены ${fmtDate(b.countedAt.slice(0, 10))} ${b.countedAt.slice(11, 16)}</span>` : ''}</dd>
      </dl>
      ${b.fileId ? `<div class="row" style="margin-top:8px"><button data-act="wbook.refreshOne" data-id="${b.id}">Обновить знаки</button></div>` : ''}
    </div>
  </div>
  <div class="card"><div class="row between"><h2 style="margin:0">Прогресс и сроки</h2><button data-act="wb.dates" data-id="${b.id}">Сроки</button></div>
    <label class="inline-num">Глав в книге, примерно <input type="number" min="1" inputmode="numeric" value="${b.planChapters || ''}" placeholder="—" data-chg="wb.planCh" data-id="${b.id}"></label>
    ${progressBlock(c, b)}
  </div>
  <div class="card"><div class="row between"><h2 style="margin:0">Главы и выкладка</h2><button class="primary" data-act="pub.mark" data-id="${b.id}">Отметить выкладку</button></div>
    ${planned.length ? `<div class="alert alert-thin">Отложено: ${planned.map((x) => `${esc(x.ch)} — ${esc(x.pf)}, ${dm(x.date)}`).join('; ')}. В этот день глава сама станет выложенной.</div>` : ''}
    ${chs.length ? `<div class="scroll" style="margin-top:8px"><table class="pub-t${pfs.length > 2 ? " many" : ""}"><tr><th>Глава</th><th class="r">Знаков</th>${pfs.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>
      ${chs.map((t) => `<tr><td>${esc(t.title)}</td><td class="r">${t.chars == null ? '' : num(t.chars)}</td>${pfs.map((x) => cell(t.title, x)).join('')}</tr>`).join('')}
      <tr class="total"><td>Всего</td><td class="r">${num(b.chars)}</td>${pfs.map((x) => `<td>${chs.filter((t) => pubState((pm[t.title] || {})[x], c.today) === 'done').length}</td>`).join('')}</tr></table></div>` : '<p class="small muted" style="margin:8px 0 0">Глав пока нет: они берутся из вкладок Google Документа. Для книги без файла главу можно вписать при отметке выкладки.</p>'}
    <div class="hint">Нажмите на ячейку, чтобы отметить главу на площадке: «выложила» или «запланировала» (отложенная публикация — ⏱). Выкладка сразу попадает событием в «Доходы».${other.length ? ` Не считаются как текст книги: ${other.map((t) => esc(t.title)).join(', ')}.` : ''}</div></div>
  ${contests.length ? `<div class="card"><h2>Конкурсы</h2>${contests.map((x) => { const s = contestStatus(x, b, c.today); return `<div class="item small"><b>${esc(x.name)}</b> · ${s.daysLeft == null ? '' : s.daysLeft < 0 ? 'завершён' : 'осталось ' + s.daysLeft + ' дн.'}${s.need != null ? ` · нужно ещё ${zn(s.need)}` : ''}</div>`; }).join('')}</div>` : ''}
  <div class="card"><div class="row between"><h2 style="margin:0">Идеи к книге</h2><button data-act="idea.newFor" data-book="${b.id}">+ Идея</button></div>
    ${ideas.length ? `<div class="list" style="margin-top:6px">${ideas.slice(0, IDEAS_MAX).map((x) => `<a class="item row between" href="#" data-act="idea.open" data-id="${x.id}" data-book="${b.id}"><span>${ic('ideas')} ${esc(x.title || x.text.slice(0, 60))}</span><span class="small muted">${(x.comments || []).length ? `${(x.comments || []).length} комм.` : ''}</span></a>`).join('')}</div>
      ${ideas.length > IDEAS_MAX ? `<div style="margin-top:10px"><button data-act="idea.open" data-book="${b.id}">Все идеи к книге (${ideas.length})</button></div>` : ''}` : '<p class="small muted" style="margin:8px 0 0">Идей к этой книге пока нет.</p>'}</div>
  <div class="card"><h2>Маркетинг</h2>
    <div class="list">
      <a class="item row between" href="#" data-act="mk.go" data-id="${b.id}" data-tab="texts"><span>Тексты и баннеры<span class="sub">тексты ${mk.texts} из ${mk.textsAll} · картинок ${mk.banners}</span></span><span>${mark(mk.texts === mk.textsAll)}</span></a>
      <a class="item row between" href="#" data-act="mk.go" data-id="${b.id}" data-tab="target"><span>Для таргета<span class="sub">креативов ${mk.creatives} · объявлений ${mk.ads}</span></span><span>${mark(mk.creatives && mk.ads)}</span></a>
    </div>
    ${mk.creatives || mk.ads ? `<div class="row" style="margin-top:10px"><button data-act="mk.targetZip" data-id="${b.id}">Скачать пакет для таргетолога</button></div>` : ''}</div>
  <div class="card"><h2>Для издательства</h2>
    <div class="list">
      <a class="item row between" href="#" data-act="mk.go" data-id="${b.id}" data-tab="pub"><span>Рукопись</span><span>${mark(mk.manuscript)}</span></a>
      <a class="item row between" href="#" data-act="mk.go" data-id="${b.id}" data-tab="pub"><span>Синопсис</span><span>${mark(mk.synopsis)}</span></a>
      <a class="item row between" href="#" data-act="mk.go" data-id="${b.id}" data-tab="texts"><span>Аннотация</span><span>${mark(mk.annotation)}</span></a>
    </div>
    <div class="row" style="margin-top:10px"><button class="primary" data-act="mk.pubZip" data-id="${b.id}">Скачать пакет для издательства</button></div></div>
  <div class="card"><h2>О книге</h2>
  <form data-form="wbook.save" data-id="${b.id}">
    <label for="bt" style="margin-top:0">Название</label><input id="bt" name="title" value="${esc(b.title)}" required>
    <label for="bs">Статус</label><select id="bs" name="status">${Object.entries(STATUS).map(([k, v]) => opt(k, v, b.status || 'progress')).join('')}</select>
    <label>Где выкладывается</label><div class="checks">${PLATFORMS.map((x) => `<label class="check"><input type="checkbox" name="pf" value="${x}"${(b.platforms || []).includes(x) ? ' checked' : ''}>${x}</label>`).join('')}</div>
    <label for="bx">Другие площадки (через запятую)</label><input id="bx" name="pfx" value="${esc(extra)}">
    <div class="f2"><div><label for="bp">Глав в книге, примерно</label><input id="bp" name="planChapters" inputmode="numeric" value="${b.planChapters ?? ''}"></div>
    <div><label for="bi">Книга в приложении доходов</label><select id="bi" name="incomeBookId"><option value="">—</option>${c.incomeBooks.map((x) => opt(x.id, x.title, c.incomeIdOf(b))).join('')}</select></div></div>
    ${b.fileId ? '' : `<label for="bm">Знаков сейчас (книга без файла)</label><input id="bm" name="manualChars" inputmode="numeric" value="${b.chars ?? ''}">`}
    <label for="bl">Ссылка на файл (если без Google Диска)</label><input id="bl" name="link" value="${esc(b.fileId ? '' : b.webViewLink || '')}" ${b.fileId ? 'disabled placeholder="файл с Google Диска подключён"' : ''}>
    <label for="bn">Заметки</label><textarea id="bn" name="note">${esc(b.note || '')}</textarea>
    <div class="row between" style="margin-top:14px"><button class="primary" type="submit">Сохранить</button><button type="button" class="danger" data-act="wbook.del" data-id="${b.id}">Убрать из приложения</button></div>
  </form></div>`;
  return { html };
}

// ---------- обновление знаков ----------
const COUNT_RULE = 3; // 3 — считаются только вкладки «Пролог», «Глава …», «Эпилог», «От автора»
export async function refreshOne(a, b, force = false) {
  const c = a.ctx();
  const meta = await drive.fileMeta(b.fileId);
  const ruleChanged = (b.countRule || 1) < COUNT_RULE;
  if (!force && !ruleChanged && meta.modifiedTime === b.modifiedTime && (b.history || {})[c.today] != null && b.dayStart?.date === c.today && b.weekStart?.date === c.today && b.monthStart?.date === c.today) return false;
  const r = await drive.countFile(meta);
  // правило подсчёта поменялось (теперь только Пролог/Главы/Эпилог) — прежние цифры несравнимы, начинаем историю заново
  const history = ruleChanged ? { [c.today]: r.total } : recordProgress(b.history, c.today, r.total);
  // начало дня и начало недели: раз в день узнаём по истории версий файла, сколько знаков было в полночь
  let dayStart = b.dayStart && b.dayStart.date === c.today ? b.dayStart : null;
  let weekStart = b.weekStart && b.weekStart.date === c.today ? b.weekStart : null;
  let monthStart = b.monthStart && b.monthStart.date === c.today ? b.monthStart : null;
  if (!dayStart || !weekStart || !monthStart) {
    const wFrom = addDays(c.today, -6), mFrom = c.today.slice(0, 8) + '01';
    let g = {};
    try { g = await drive.gainsSince(meta, [...new Set([c.today, wFrom, mFrom])]); } catch { g = {}; }
    const prev = Object.keys(b.history || {}).filter((k) => k < c.today).sort().pop();
    if (!dayStart) dayStart = { date: c.today, chars: g[c.today] != null ? r.total - Math.max(0, g[c.today]) : (!ruleChanged && prev && prev >= addDays(c.today, -1) ? b.history[prev] : r.total) };
    if (!weekStart) weekStart = { date: c.today, from: wFrom, chars: g[wFrom] != null ? r.total - Math.max(0, g[wFrom]) : null };
    if (!monthStart) monthStart = { date: c.today, from: mFrom, chars: g[mFrom] != null ? r.total - Math.max(0, g[mFrom]) : null };
  }
  await a.store.put('w_books', { ...b, title: b.title || meta.name, chars: r.total, tabs: r.tabs, modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink, mimeType: meta.mimeType, countedAt: new Date().toISOString(), history, dayStart, weekStart, monthStart, countRule: COUNT_RULE });
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
  const patch = { title: fd.get('title').trim(), status: fd.get('status'), platforms, planChapters: N(fd.get('planChapters')) || null, incomeBookId: fd.get('incomeBookId') || '', note: fd.get('note') || '' };
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
// ---------- выкладка глав: «выложила» / «запланировала» (отложенная) / «снять» — по главам и площадкам ----------
acts['pub.mark'] = (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  const pm = pubMap(b), pfs = pubPlatforms(b), chs = chapterList(b);
  const firstFree = chs.find((t) => !pubState((pm[t.title] || {})[pfs[0]], c.today));
  const pre = new Set(d.ch ? [d.ch] : firstFree ? [firstFree.title] : []);
  const cur = d.ch && d.pf ? (pm[d.ch] || {})[d.pf] : null, curSt = pubState(cur, c.today);
  const hasSch = !!(b.publishStart && (b.pubDays || []).length);
  const defMode = d.mode || (curSt === 'wait' ? 'plan' : 'done');
  // первый день графика после сегодняшнего — дата по умолчанию для отложенной
  const nextSlot = () => (hasSch ? scheduleDates(b.publishStart, b.pubDays, addDays(c.today, 1), 1)[0] : null) || addDays(c.today, 1);
  const pickList = (fd) => { const firstN = N(fd.get('firstN')); return [...(firstN > 0 ? chs.slice(0, firstN).map((t) => t.title) : fd.getAll('ch')), ...String(fd.get('chx') || '').split(',').map((x) => x.trim()).filter(Boolean)]; };
  const stOf = (t) => pfs.map((x) => { const st = pubState((pm[t] || {})[x], c.today); return st ? `${x} ${st === 'done' ? '✓' : '⏱ ' + dm(pm[t][x].date)}` : ''; }).filter(Boolean).join(' · ');
  openSheet(`Выкладка — ${b.title}`, `
    ${chs.length ? `<label style="margin-top:0">Главы</label><div class="pick-list">${chs.map((t) => `<label class="check"><input type="checkbox" name="ch" value="${esc(t.title)}"${pre.has(t.title) ? ' checked' : ''}><span>${esc(t.title)}${stOf(t.title) ? ` <span class="small muted">· ${stOf(t.title)}</span>` : ''}</span></label>`).join('')}</div>` : ''}
    ${chs.length > 3 ? `<label for="pfn">Или первые N глав по порядку</label><input id="pfn" name="firstN" inputmode="numeric" placeholder="например, 12 — пролог и 11 глав">` : ''}
    <label for="pcx">${chs.length ? 'Или другая глава' : 'Глава'}</label><input id="pcx" name="chx" placeholder="например, Глава 25">
    <label>Площадки</label><div class="checks">${pfs.map((x) => `<label class="check"><input type="checkbox" name="pf" value="${esc(x)}"${(d.pf ? d.pf === x : x === pfs[0]) ? ' checked' : ''}>${esc(x)}</label>`).join('')}</div>
    <div class="f2"><div><label for="pmd">Что сделала</label><select id="pmd" name="mode">${opt('done', 'Выложила', defMode)}${opt('plan', 'Запланировала (отложенная)', defMode)}${opt('past', 'Уже выложено раньше — без событий', '')}${opt('clear', 'Снять отметку', '')}</select></div>
    <div><label for="pdt">Дата</label><input id="pdt" type="date" name="date" value="${cur?.date || d.date || (defMode === 'plan' ? nextSlot() : c.today)}"></div></div>
    ${hasSch ? `<div data-sch hidden><label class="check"><input type="checkbox" name="bySch" checked>По графику (${daysTxt(b.pubDays)}): каждой главе — свой день, начиная с даты</label><div class="small muted" data-preview></div></div>` : ''}
    <div class="hint">Отложенная публикация: до указанной даты глава отмечена ⏱, а в этот день сама станет выложенной. Событие «Выкладка главы» сразу ставится на эту дату в «Доходах». «Уже выложено раньше» — для глав, что вышли до начала учёта: они отметятся выложенными, но событий в «Доходах» не будет, дата не нужна.</div>`, async (fd) => {
    const list = pickList(fd);
    const plats = fd.getAll('pf'), mode = fd.get('mode'), date = fd.get('date') || c.today;
    if (!list.length) { toast('Выберите главу'); return false; }
    if (!plats.length) { toast('Выберите площадку'); return false; }
    if (mode === 'plan' && date <= c.today) { toast('Для отложенной публикации выберите дату позже сегодняшней'); return false; }
    // по графику: у каждой главы своя дата (для каждой площадки — свои свободные дни)
    const bySch = mode === 'plan' && hasSch && fd.get('bySch') && list.length > 1;
    const dateOf = {};
    for (const x of plats) {
      const plan = bySch ? planBySchedule(b, list, date, x) : null;
      if (bySch && !plan) { toast('Не хватило дней графика — проверьте даты в «Сроках»'); return false; }
      dateOf[x] = Object.fromEntries(list.map((ch) => [ch, plan ? plan.find((p) => p.ch === ch).date : date]));
    }
    const next = pubMap(b);
    for (const ch of list) {
      next[ch] = { ...(next[ch] || {}) };
      for (const x of plats) {
        if (mode === 'clear') { delete next[ch][x]; await chapterUnset(b, ch, x); continue; }
        if (mode === 'past') { next[ch][x] = { date: PAST, past: true }; await chapterUnset(b, ch, x); continue; }
        const dt = dateOf[x][ch];
        next[ch][x] = mode === 'plan' ? { date: dt, planned: true } : { date: dt };
        await chapterEvent(c, b, ch, dt, x);
      }
      if (!Object.keys(next[ch]).length) delete next[ch];
    }
    await app().store.put('w_books', { ...b, pub: next, published: null });
    const n = list.length, dts = Object.values(dateOf[plats[0]] || {}).sort();
    toast(mode === 'past' ? `Отмечено выложенными: ${n} — без событий в «Доходах»` : mode === 'clear' ? 'Отметка снята' : mode === 'plan' ? (bySch ? `Запланировано ${n} ${plural(n, ['глава', 'главы', 'глав'])} по графику: ${dm(dts[0])} – ${dm(dts[dts.length - 1])}` : `Запланировано на ${dm(date)} — в «Доходах» тоже`) : `${n > 1 ? 'Главы отмечены' : 'Глава отмечена'} — и в «Доходах» тоже`);
  }, { submitText: 'Сохранить' });
  // живая подсказка: какая глава в какой день выйдет; при выборе «Запланировала» — дата = ближайший день графика
  const form = document.querySelector('dialog[open] form');
  if (!form) return;
  const upd = (e) => {
    const fd = new FormData(form), mode = fd.get('mode'), box = form.querySelector('[data-sch]');
    if (e?.target?.name === 'mode' && mode === 'plan' && (form.elements.date.value || '') <= c.today) form.elements.date.value = nextSlot();
    if (!box) return;
    const list = pickList(fd), on = mode === 'plan' && list.length > 1;
    box.hidden = !on;
    if (!on) return;
    const plan = fd.get('bySch') ? planBySchedule(b, list, fd.get('date') || nextSlot(), (fd.getAll('pf')[0]) || pfs[0]) : null;
    box.querySelector('[data-preview]').textContent = plan ? plan.map((p) => `${p.ch} — ${dm(p.date)}`).join(' · ') : fd.get('bySch') ? '' : `все на ${dm(fd.get('date'))}`;
  };
  form.addEventListener('change', upd); form.addEventListener('input', upd); upd();
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
  app().go('/books');
};
export { daysLeft };
