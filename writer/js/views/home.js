// Главная Мастерской: всё актуальное за текущий месяц по книгам и напоминания обо всём, у чего есть дата
import { esc } from '../../../js/ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn, fmtMonthCap, plural } from '../../../js/format.js';
import { monthKey, addDays, addMonths, incomeSeries, sumSeries, npdDeadline } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { charsAt, writtenToday, contestStatus, waitingStatus, forecastDate, chapterOutDates, plannedPubs, bookSchedule, writtenMonth, goalStatus, dailyWrittenAll, al, alNum, contestVol } from '../wcalc.js';
import { STATUS, progressBlock, daysTxt, driveChip } from './books.js';
import { goalTitle, goalToday, activeGoals } from './goals.js';
import { writtenChart } from '../wcharts.js';

const zn = (n) => al(n);
const dleft = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
const when = (n) => (n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`);
const SOON = 14; // за сколько дней показывать напоминание

// Все напоминания с датами: {date, title, sub, to, kind}
export function reminders(c) {
  const out = [], t = c.today, d = c.data;
  const add = (date, title, sub, to, horizon = SOON) => { if (date && dleft(date, t) <= horizon) out.push({ date, n: dleft(date, t), title, sub, to }); };
  for (const x of d.w_contests) {
    if (x.status === 'done' || !x.end || x.end < addDays(t, -3)) continue;
    const b = x.bookId ? c.wbooksById[x.bookId] : null, s = contestStatus(x, b, t);
    add(x.end, `Конкурс «${x.name}» заканчивается`, `${b ? esc(b.title) : ''}${s.need ? ` · нужно ещё ${contestVol(x)(s.need)}${s.perDay ? ` (~${contestVol(x)(s.perDay)} в день)` : ''}` : ''}`, '/plan');
    if (x.start && x.start >= t) add(x.start, `Конкурс «${x.name}» начинается`, b ? esc(b.title) : '', '/plan', 7);
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
    <span class="wcard-body"><span class="row between"><b>${esc(b.title)}</b></span>
      ${progressBlock(c, b)}
      <span class="small">В ${fmtMonthIn(monthKey(t)).split(' ')[0]}: +${zn(r.wrote)}${r.today ? ` (сегодня +${alNum(r.today)})` : ''} · глав ${r.chapters}${r.timers ? ` (+${r.timers} на таймере)` : ''}${r.income != null ? ` · доход ${rub(r.income, 0)}` : ''}</span></span></a>`;
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
    const timers = new Set(plannedPubs(b, t).filter((x) => x.date.slice(0, 7) === mk && !out[x.ch]).map((x) => x.ch)).size;
    const incomeId = c.incomeIdOf(b);
    const income = incomeId ? sumSeries(incomeSeries(c.data.sales, [], from, t, incomeId)) : null;
    const contests = c.data.w_contests.filter((x) => x.bookId === b.id && x.status !== 'done' && !(x.end && x.end < t));
    return { b, wrote, today: writtenToday(b, t), chapters, timers, income, contests };
  }).filter((r) => (r.b.status || 'progress') === 'progress' || r.wrote || r.chapters || r.income);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
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
    <div class="stat"><div class="k">Написано за месяц</div><div class="v">${alNum(sum('wrote'))}</div><div class="s">а.л. · сегодня +${alNum(sum('today'))}</div></div>
    <div class="stat"><div class="k">Глав в ${fmtMonthIn(mk).split(' ')[0]}</div><div class="v">${sum('chapters') + sum('timers')}</div><div class="s">${sum('timers') ? `${sum('chapters')} ${plural(sum('chapters'), ['вышла', 'вышли', 'вышло'])} · ${sum('timers')} на таймере` : plural(sum('chapters'), ['вышла', 'вышли', 'вышло'])}</div></div>
    <div class="stat"><div class="k">Доход за ${fmtMonth(mk).split(' ')[0]}</div><div class="v">${rub(sumSeries(incomeSeries(c.data.sales, [], from, t)), 0)}</div></div>
    <div class="stat"><div class="k">В работе</div><div class="v">${inWork.length}</div><div class="s">${plural(inWork.length, ['книга', 'книги', 'книг'])}</div></div>
  </div>
  ${rem.length ? `<div class="card"><h2>Напоминания</h2><div class="list">${rem.map((r) => `<a class="item row between" href="${r.to.startsWith('..') ? r.to : '#'}" ${r.to.startsWith('..') ? '' : `data-act="go" data-to="${r.to}"`}><span>${esc(r.title)}${r.sub ? `<span class="sub">${r.sub}</span>` : ''}</span><span class="badge ${r.n < 0 ? 'bad' : r.n <= 3 ? 'warn' : ''}">${fmtDate(r.date).slice(0, 5)} · ${when(r.n)}</span></a>`).join('')}</div></div>` : ''}
  ${chartCard}
  ${inWork.length ? `<h2 style="margin-top:18px">В работе</h2>${inWork.map((r) => workCard(c, r)).join('')}` : ''}
  ${others.length ? `<div class="card"><h2>Другие книги в ${fmtMonthIn(mk)}</h2><div class="list">${others.map((r) => `<a class="item row between" href="#" data-act="go" data-to="/book/${r.b.id}"><span>${esc(r.b.title)}<span class="sub">${[r.wrote ? `+${zn(r.wrote)}` : '', r.chapters ? `глав ${r.chapters}` : '', STATUS[r.b.status] || ''].filter(Boolean).join(' · ')}</span></span><b>${r.income != null ? rub(r.income, 0) : ''}</b></a>`).join('')}</div></div>` : ''}`;
  return { html, after: () => writtenChart(document.getElementById('wchart'), { days: series, target }) };
}
export { ic };
