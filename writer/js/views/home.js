// Главная Мастерской: всё актуальное за текущий месяц по книгам и напоминания обо всём, у чего есть дата
import { esc, acts, openSheet } from '../../../js/ui.js';
import { npdStatusOf, npdAlert } from '../../../js/npd.js';
import { ownTasks, isImportant, tdText } from '../../../js/tdtasks.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn, fmtMonthCap, plural } from '../../../js/format.js';
import { monthKey, addDays, addMonths, incomeSeries, sumSeries, npdDeadline } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { charsAt, writtenToday, contestStatus, waitingStatus, forecastDate, chapterOutDates, plannedPubs, bookSchedule, writtenMonth, goalStatus, dailyWrittenAll, al, alNum, contestVol, contestBookIds, contestUnsent } from '../wcalc.js';
import { STATUS, progressBlock, daysTxt, driveChip, GAINS_V, refreshing } from './books.js';
import { goalTitle, goalToday, activeGoals } from './goals.js';
import { widgetReminder } from './widgets.js';
import { linkTodos } from './links.js';
import { domainInfo } from '../sitecheck.js';
import { marketingNeeds, planItems } from './plan.js';
import { writtenChart } from '../wcharts.js';
import { archiveWarn, loadArchive } from './archive.js';
import { fold } from '../../../js/ui.js';
import { weekSummary, finishPace } from '../../../js/insights.js';

const zn = (n) => al(n);
const dleft = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
const when = (n) => (n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`);
const SOON = 14; // за сколько дней показывать напоминание

// Все напоминания с датами: {date, title, sub, to, kind}
export function reminders(c) {
  const out = [], t = c.today, d = c.data;
  const add = (date, title, sub, to, horizon = SOON) => { if (date && dleft(date, t) <= horizon) out.push({ date, n: dleft(date, t), title, sub, to }); };
  // конкурсы — только «Подать на конкурс», за неделю до конца приёма
  for (const x of d.w_contests) {
    if (x.status === 'done' || x.status === 'sent' || !x.end || x.end < t) continue;
    const un = contestUnsent(x).map((id) => c.wbooksById[id]).filter(Boolean);
    if (un.length) add(x.end, `Подать на конкурс «${x.name}»`, `${un.map((y) => esc(y.title)).join(', ')}${(x.emails || [])[0] ? ' · ' + esc(x.emails[0]) : ''}`, '/plan', 7);
  }
  for (const b of c.wbooks) {
    if ((b.status || 'progress') !== 'progress') continue;
    const s = bookSchedule(b, t);
    if (b.finishBy && !s.doneWriting) add(b.finishBy, `Дописать «${b.title}»`, s.planCh ? `глав ${s.written} из ≈${s.planCh}` : '', '/book/' + b.id);
    if (s.until && s.remaining !== 0) add(s.until, `Закончить выкладку «${b.title}»`, b.publishUntil ? '' : 'посчитано по графику', '/book/' + b.id);
    // день выкладки по графику: напоминание, только если глава ещё не отмечена и не стоит на таймере
    // в день выкладки по графику: напоминание, только если в этот день ничего не выложено и не стоит на таймере
    if (s.next && s.next.date === t) add(s.next.date, `Выложить ${s.next.ch ? `«${s.next.ch}»` : 'следующую главу'} — ${s.next.pf}`, `«${esc(b.title)}» · по графику: ${daysTxt(b.pubDays)}`, '/book/' + b.id, 0);
    if (b.publishStart && b.publishStart >= t) add(b.publishStart, `Начать выкладку «${b.title}»`, '', '/plan', 7);
  }
  // цели: в день цели, пока норма не набрана / не отмечено «Сделала»
  for (const g of activeGoals(c)) {
    const st = goalStatus(g, g.bookId ? c.wbooksById[g.bookId] : null, t);
    if (st.active && st.todayDay && !st.doneToday) add(t, `Цель: ${goalTitle(c, g)}`, goalToday(c, g, st), '/plan', 0);
  }
  // лимит НПД (2,4 млн ₽ в год): превышен или вот-вот будет
  const na = npdAlert(npdStatusOf(d.sales || [], [], c.settings, t), t); if (na) add(t, na.title, na.sub, '/plan', 0);
  // свои задачи из Todoist (Книги, Мастерская) — на сегодня и просроченные
  // с приоритетом — всегда на Главной (без даты — сегодня), остальные — на сегодня и просроченные
  for (const x of ownTasks(c.settings)) if (x.d || isImportant(x)) add(!x.d || x.d < t ? t : x.d, tdText(x.t), esc(x.s || x.p) + (x.d && x.d < t ? ' · просрочено' : ''), '/plan', isImportant(x) ? 3650 : 0);
  // приоритетные показы: подать заявку до 25-го
  const wr = widgetReminder(c); if (wr) add(wr.date, wr.title, wr.sub, wr.to, 15);
  // напоминания по связям и подготовка маркетинга
  for (const x of linkTodos(c)) add(x.date, x.text, x.name, '/link/' + x.linkId, 1);
  const dm = domainInfo(c.settings, t); if (dm.soon) add(t, `Продлить домен ${dm.name}`, dm.late ? 'срок оплаты прошёл' : `оплачен до ${fmtDate(dm.till)}`, '/mysite', 0);
  for (const m of marketingNeeds(c)) add(m.date, m.title, esc(m.sub), m.to, 0);
  // Только конкретные UTM-обновления заранее. Общих обзоров выходных нет.
  for (const task of planItems(c, t, addDays(t, 14)).filter(x => x.kind === 'utm'))
    add(task.date, task.title, task.sub, task.to, 14);
  for (const x of d.w_queue) if (!x.done && x.due) add(x.due, x.title, x.bookId && c.wbooksById[x.bookId] ? esc(c.wbooksById[x.bookId].title) : 'из очереди «Что пишу дальше»', '/plan');
  for (const x of d.w_waiting) {
    if (x.done) continue;
    const s = waitingStatus(x, t), remind = addDays(x.since, Number(x.remindDays) || 14);
    add(remind, `Напомнить о себе: ${x.who}`, `${s.days} дн. без ответа${x.what ? ' · ' + esc(x.what.slice(0, 60)) : ''}`, x.contactId ? '/link/' + x.contactId : '/links', 3);
  }
  // из «Доходов»: налог за прошлый месяц (до 28-го), цифры Rocket (после 20-го), конец рекламных кампаний
  const prev = addMonths(monthKey(t), -1), mPrev = (d.months || []).find((m) => m.id === prev) || {};
  const prevGross = sumSeries(incomeSeries(d.sales, [], prev + '-01', addDays(monthKey(t) + '-01', -1)), 'gross');
  if (prevGross > 0 && !mPrev.taxPaid) add(npdDeadline(prev), `Налог за ${fmtMonth(prev)}`, `≈ ${rub(prevGross * (Number(c.settings.taxRate) || 4) / 100, 0)} · чек и оплата — в «Доходах» → Финансы`, '../', 10);
  if (prevGross > 0 && mPrev.rocketFee == null && t >= monthKey(t) + '-20') add(t, `Записать цифры Rocket за ${fmtMonth(prev)}`, 'в «Доходах» → Реклама', '../', 0);
  for (const k of d.campaigns || []) if (!k.oneOff && k.end && k.end >= t) add(k.end, `Заканчивается реклама «${k.name}»`, 'решить, продлевать ли', '../', 5);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// карточка книги в работе: обложка, прогресс по объёму, выкладка, сроки, месяц
function bar(label, share, right, hint = '') {
  const pctv = Math.max(0, Math.min(1, share || 0));
  return `<div class="wbar"><div class="row between small"><span>${label}</span><span>${right}</span></div><div class="progress"><i style="width:${(pctv * 100).toFixed(1)}%"></i></div>${hint ? `<div class="small muted">${hint}</div>` : ''}</div>`;
}
function workCard(c, r) {
  const b = r.b, t = c.today;
  return `<a class="card wcard tap" href="#" data-act="go" data-to="/book/${b.id}">
    <span class="mk-cover big">${b.cover ? `<img src="${b.cover}" alt="">` : `<span>${esc(b.title.slice(0, 1))}</span>`}</span>
    <span class="wcard-body"><span class="wcard-title">${esc(b.title)}</span>
      ${progressBlock(c, b)}
      <span class="wcard-foot"><span class="wf-k">В ${fmtMonthIn(monthKey(t)).split(' ')[0]}</span>
        <span><b>+${zn(r.wrote)}</b>${r.today ? ` <span class="muted">(сегодня +${alNum(r.today)})</span>` : ''}</span>
        <span><b>${r.chapters}</b> ${plural(r.chapters, ['глава вышла', 'главы вышли', 'глав вышло'])}${r.timers ? ` <span class="muted">+${r.timers} на таймере</span>` : ''}</span>
        ${r.income != null ? `<span>доход <b>${rub(r.income, 0)}</b></span>` : ''}</span></span></a>`;
}

// Сводка недели (js/insights.js): доход за 7 дней с данными против прошлых 7, почему, что с рекламой, дела на неделю.
// В понедельник и вторник раскрыта сама; дальше — строкой (раскрытие запоминается).
function weekCard(c) {
  const w = weekSummary(c.data, c.settings, c.today);
  if (!w.income && !w.was) return '';
  // успеть к конкурсу: книга в работе, привязанная к идущему конкурсу «для законченных»
  for (const ct of c.data.w_contests || []) for (const id of contestBookIds(ct)) {
    const b = c.wbooksById[id], fp = b && (b.status || 'progress') === 'progress' && ct.status !== 'done' ? finishPace(b, ct, c.today) : null;
    if (fp && !fp.done) w.todo.push({ k: 'contest:' + ct.id, text: `«${b.title}» к конкурсу «${ct.name}» (до ${fmtDate(ct.end).slice(0, 5)}): ≈ ${num(fp.left)} зн. — по ${num(fp.perDay)} в день${fp.onTrack ? ', по нынешнему темпу успеваете' : fp.forecast ? `, по нынешнему темпу — к ${fmtDate(fp.forecast).slice(0, 5)}, не успеваете` : ''}` });
  }
  const KIND = { good: 'up', bad: 'down', even: '' };
  const d = w.delta, wd = new Date(c.today + 'T00:00:00Z').getUTCDay();
  const body = `<div class="row between"><b>${rub(w.income, 0)} за 7 дней</b><span class="small ${d == null ? 'muted' : d >= 0 ? 'up' : 'down'}">${d == null ? '' : `${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))} % · прошлая неделя ${rub(w.was, 0)}`}</span></div>
    ${w.reasons.length ? `<p class="small muted" style="margin:6px 0 0">${esc(w.reasons.join(' · '))}</p>` : ''}
    ${w.ads.length ? `<h3>Реклама</h3><div class="list">${w.ads.map((x) => `<div class="item"><b>${esc(x.name)}</b><div class="small ${KIND[x.kind]}">${esc(x.text.charAt(0).toUpperCase() + x.text.slice(1))}${x.est ? ' <span class="muted">(расход — оценка)</span>' : ''}</div></div>`).join('')}</div>` : ''}
    ${w.todo.length ? `<h3>На эту неделю</h3><div class="list">${w.todo.slice(0, 5).map((x) => `<div class="item small">${esc(x.text)}</div>`).join('')}</div>` : ''}`;
  return `<div class="card folds">${fold('home-week', `Неделя ${fmtDate(w.from).slice(0, 5)}–${fmtDate(w.to).slice(0, 5)}`, body, { open: wd === 1 || wd === 2, sub: `${rub(w.income, 0)}${d != null ? ` · ${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))} %` : ''}` })}</div>`;
}

export function homeView(a) {
  const c = a.ctx(), t = c.today, mk = monthKey(t), from = mk + '-01';
  const rem = reminders(c);
  // по книгам за месяц: написано (по истории знаков), глав выложено, доход по связанной книге «Доходов»
  const rows = c.wbooks.map((b) => {
    const wrote = writtenMonth(b, t);
    const out = chapterOutDates(b, t);
    const chapters = Object.values(out).filter((dt) => dt >= from && dt <= t).length;
    // на таймере с датой в этом месяце (главы, которые ещё не вышли нигде)
    const tlist = plannedPubs(b, t).filter((x) => x.date.slice(0, 7) === mk && !out[x.ch]);
    const timers = new Set(tlist.map((x) => x.ch)).size;
    const incomeId = c.incomeIdOf(b);
    const income = incomeId ? sumSeries(incomeSeries(c.data.sales, [], from, t, incomeId)) : null;
    const contests = c.data.w_contests.filter((x) => contestBookIds(x).includes(b.id) && x.status !== 'done' && !(x.end && x.end < t));
    return { b, wrote, today: writtenToday(b, t), chapters, timers, tlist, income, contests };
  }).filter((r) => (r.b.status || 'progress') === 'progress' || r.wrote || r.chapters || r.income);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  // подсчёт поменялся, а пересчитать ещё не вышло (Диск не открыт) — не показываем старую неверную цифру
  const stale = rows.some((r) => (r.b.status || 'progress') === 'progress' && r.b.fileId && r.b.mimeType === 'application/vnd.google-apps.document' && (r.b.gainsV || 0) < GAINS_V);
  const inWork = rows.filter((r) => (r.b.status || 'progress') === 'progress'), others = rows.filter((r) => (r.b.status || 'progress') !== 'progress');
  // знаки по дням за 30 дней — все книги; пунктир — сумма норм по активным целям на сегодня
  const series = dailyWrittenAll(c.wbooks, addDays(t, -29), t, t);
  const target = activeGoals(c).reduce((s2, g) => { const st = goalStatus(g, g.bookId ? c.wbooksById[g.bookId] : null, t); return s2 + (g.type === 'daily' && st.active && st.perDay ? st.perDay : 0); }, 0) || null;
  const known = series.filter((x) => x.known), avg7 = series.slice(-7).filter((x) => x.known);
  const best = known.reduce((m, x) => (x.value > (m?.value || 0) ? x : m), null);
  const chartCard = known.length ? `<div class="card"><h2>Написано по дням, а.л.</h2><div class="chart" id="wchart"></div>
    <div class="small muted chart-cap">${[avg7.length ? `в среднем ${zn(Math.round(avg7.reduce((a2, x) => a2 + x.value, 0) / avg7.length))} в день за неделю` : '', best && best.value ? `лучший день — ${fmtDate(best.date).slice(0, 5)}: ${zn(best.value)}` : '', target ? `пунктир — норма по целям (${zn(target)})` : ''].filter(Boolean).join(' · ')}</div></div>` : '';
  const html = `
  <div class="row between home-h"><h2 style="margin:0">${fmtMonthCap(mk)}</h2>${driveChip(c)}</div>
  <div class="grid4">
    ${stale ? `<button class="stat stat-btn" data-act="wbook.refresh" title="Пересчитать по Google Диску"><div class="k">Написано за месяц</div><div class="v">—</div><div class="s">${refreshing.on ? 'считаю…' : 'пересчитать'}</div></button>`
      : `<div class="stat"><div class="k">Написано за месяц</div><div class="v">${alNum(sum('wrote'))}</div><div class="s">а.л. · сегодня +${alNum(sum('today'))}</div></div>`}
    <button class="stat stat-btn" data-act="home.chapters" title="Какие главы и откуда"><div class="k">Глав в ${fmtMonthIn(mk).split(' ')[0]}</div><div class="v">${sum('chapters') + sum('timers')}</div><div class="s">${[`${sum('chapters')} ${plural(sum('chapters'), ['вышла', 'вышли', 'вышло'])}`, sum('timers') ? `${sum('timers')} на таймере` : ''].filter(Boolean).join(' · ')}</div></button>
    <div class="stat"><div class="k">Доход за ${fmtMonth(mk).split(' ')[0]}</div><div class="v">${rub(sumSeries(incomeSeries(c.data.sales, [], from, t)), 0)}</div></div>
    <div class="stat"><div class="k">В работе</div><div class="v">${inWork.length}</div><div class="s">${plural(inWork.length, ['книга', 'книги', 'книг'])}</div></div>
  </div>
  ${weekCard(c)}
  ${archiveWarn(c)}
  ${rem.length ? `<div class="card"><h2>Напоминания</h2><div class="list">${rem.map((r) => `<a class="item row between" href="${r.to.startsWith('..') ? r.to : '#'}" ${r.to.startsWith('..') ? '' : `data-act="go" data-to="${r.to}"`}><span>${esc(r.title)}${r.sub ? `<span class="sub">${r.sub}</span>` : ''}</span><span class="badge ${r.n < 0 ? 'bad' : r.n <= 3 ? 'warn' : ''}">${fmtDate(r.date).slice(0, 5)} · ${when(r.n)}</span></a>`).join('')}</div></div>` : ''}
  ${chartCard}
  ${inWork.length ? `<h2 style="margin-top:18px">В работе</h2>${inWork.map((r) => workCard(c, r)).join('')}` : ''}
  ${others.length ? `<div class="card"><h2>Другие книги в ${fmtMonthIn(mk)}</h2><div class="list">${others.map((r) => `<a class="item row between" href="#" data-act="go" data-to="/book/${r.b.id}"><span>${esc(r.b.title)}<span class="sub">${[r.wrote ? `+${zn(r.wrote)}` : '', r.chapters ? `глав ${r.chapters}` : '', STATUS[r.b.status] || ''].filter(Boolean).join(' · ')}</span></span><b>${r.income != null ? rub(r.income, 0) : ''}</b></a>`).join('')}</div></div>` : ''}`;
  return { html, after: () => { writtenChart(document.getElementById('wchart'), { days: series, target }); loadArchive(false, true); } };
}
export { ic };

// «Глав в месяце» — только настоящие главы: что вышло и что стоит на таймере (отмечено «Запланировала» в выкладке).
// Пустые дни графика выкладки сюда НЕ идут — владелица: «зачем это записывается в главы?»
acts['home.chapters'] = () => {
  const c = window.__app.ctx(), t = c.today, mk = monthKey(t), from = mk + '-01';
  const rows = [];
  for (const b of c.wbooks) {
    const out = chapterOutDates(b, t);
    for (const [ch, dt] of Object.entries(out)) if (dt >= from && dt <= t) rows.push({ b, kind: 'вышла', ch, date: dt });
    for (const x of plannedPubs(b, t)) if (x.date.slice(0, 7) === mk && !out[x.ch]) rows.push({ b, kind: 'на таймере', ch: x.ch, date: x.date, pf: x.pf });
  }
  rows.sort((x, y) => x.date.localeCompare(y.date));
  openSheet(`Главы в ${fmtMonthIn(mk).split(' ')[0]}`, rows.length ? `<p class="small muted">«На таймере» — глава отмечена в выкладке как «Запланировала» на эту дату. Неверно — откройте книгу → «Выкладка» и снимите отметку.</p>
    <div class="list">${rows.map((r) => `<a class="item" href="#" data-act="home.chGo" data-to="/book/${esc(r.b.id)}"><div class="row between"><b>${esc(r.ch)}</b><span class="small muted">${fmtDate(r.date).slice(0, 5)} · ${r.kind}</span></div><div class="small muted">${esc(r.b.title)}${r.pf ? ' · ' + esc(r.pf) : ''}</div></a>`).join('')}</div>`
    : '<p class="muted">В этом месяце глав пока нет.</p>', null);
  return false;
};
acts['home.chGo'] = (d) => { document.getElementById('sheet')?.close(); window.__app.go(d.to); return false; };
