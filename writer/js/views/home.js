// Главная Мастерской: всё актуальное за текущий месяц по книгам и напоминания обо всём, у чего есть дата
import { esc } from '../../../js/ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn, fmtMonthCap, plural } from '../../../js/format.js';
import { monthKey, addDays, addMonths, incomeSeries, sumSeries, npdDeadline } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { charsAt, writtenToday, contestStatus, waitingStatus, forecastDate } from '../wcalc.js';
import { STATUS } from './books.js';

const zn = (n) => num(n || 0) + ' зн.';
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
    add(x.end, `Конкурс «${x.name}» заканчивается`, `${b ? esc(b.title) : ''}${s.need ? ` · нужно ещё ${zn(s.need)}${s.perDay ? ` (~${zn(s.perDay)} в день)` : ''}` : ''}`, '/plan');
    if (x.start && x.start >= t) add(x.start, `Конкурс «${x.name}» начинается`, b ? esc(b.title) : '', '/plan', 7);
  }
  for (const b of c.wbooks) {
    if ((b.status || 'progress') !== 'progress') continue;
    if (b.finishBy) add(b.finishBy, `Дописать «${b.title}»`, b.planChars ? `${zn(b.chars)} из ${zn(b.planChars)}` : zn(b.chars), '/plan');
    if (b.publishUntil) add(b.publishUntil, `Закончить выкладку «${b.title}»`, '', '/plan');
    if (b.publishStart && b.publishStart >= t) add(b.publishStart, `Начать выкладку «${b.title}»`, '', '/plan', 7);
  }
  for (const x of d.w_queue) if (!x.done && x.due) add(x.due, x.title, x.bookId && c.wbooksById[x.bookId] ? esc(c.wbooksById[x.bookId].title) : 'из очереди «Что пишу дальше»', '/plan');
  for (const x of d.w_waiting) {
    if (x.done) continue;
    const s = waitingStatus(x, t), remind = addDays(x.since, Number(x.remindDays) || 14);
    add(remind, `Напомнить о себе: ${x.who}`, `жду ${s.days} дн.${x.what ? ' · ' + esc(x.what.slice(0, 60)) : ''}`, '/plan', 3);
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
  const b = r.b, t = c.today, fc = b.planChars ? forecastDate(b.history || {}, t, Number(b.planChars)) : null;
  const tabs = (b.tabs || []).filter((x) => x.counted !== false), pubN = Object.keys(b.published || {}).length;
  const parts = [];
  if (b.planChars) parts.push(bar('Объём', (b.chars || 0) / b.planChars, `${num(b.chars || 0)} из ${num(b.planChars)} · ${Math.round(((b.chars || 0) / b.planChars) * 100)} %`, fc ? `по темпу допишу к ${fmtDate(fc)}${b.finishBy ? (fc <= b.finishBy ? ' — успеваю к сроку' : ` — срок ${fmtDate(b.finishBy)}, не успеваю`) : ''}` : (b.finishBy ? `срок ${fmtDate(b.finishBy)}` : '')));
  else parts.push(`<div class="small">${zn(b.chars)}${b.finishBy ? ` · допишу к ${fmtDate(b.finishBy)} (${when(dleft(b.finishBy, t))})` : ''} <span class="muted">· план по объёму — в карточке книги</span></div>`);
  if (tabs.length) parts.push(bar('Выкладка', pubN / tabs.length, `глав ${pubN} из ${tabs.length}`, b.publishUntil ? `выкладка до ${fmtDate(b.publishUntil)} (${when(dleft(b.publishUntil, t))})` : ''));
  else if (b.publishStart && b.publishUntil) { const all = dleft(b.publishUntil, b.publishStart) || 1; parts.push(bar('Выкладка', dleft(t, b.publishStart) / all, `до ${fmtDate(b.publishUntil)}`)); }
  return `<a class="card wcard tap" href="#" data-act="go" data-to="/book/${b.id}">
    <span class="mk-cover big">${b.cover ? `<img src="${b.cover}" alt="">` : `<span>${esc(b.title.slice(0, 1))}</span>`}</span>
    <span class="wcard-body"><span class="row between"><b>${esc(b.title)}</b>${r.contests.map((x) => `<span class="badge">конкурс · ${x.end ? when(dleft(x.end, t)) : ''}</span>`).join('')}</span>
      ${parts.join('')}
      <span class="small">В ${fmtMonthIn(monthKey(t)).split(' ')[0]}: +${num(r.wrote)} зн.${r.today ? ` (сегодня +${num(r.today)})` : ''} · глав ${r.chapters}${r.income != null ? ` · доход ${rub(r.income, 0)}` : ''}</span></span></a>`;
}

export function homeView(a) {
  const c = a.ctx(), t = c.today, mk = monthKey(t), from = mk + '-01';
  const rem = reminders(c);
  // по книгам за месяц: написано (по истории знаков), глав выложено, доход по связанной книге «Доходов»
  const rows = c.wbooks.map((b) => {
    const h = b.history || {};
    const startVal = charsAt(h, addDays(from, -1)) ?? (Object.keys(h).sort().find((k) => k >= from) ? h[Object.keys(h).sort().find((k) => k >= from)] : null);
    const wrote = startVal != null && b.chars != null ? Math.max(0, b.chars - startVal) : 0;
    const chapters = Object.values(b.published || {}).filter((dt) => dt >= from && dt <= t).length;
    const incomeId = c.incomeIdOf(b);
    const income = incomeId ? sumSeries(incomeSeries(c.data.sales, [], from, t, incomeId)) : null;
    const contests = c.data.w_contests.filter((x) => x.bookId === b.id && x.status !== 'done' && !(x.end && x.end < t));
    return { b, wrote, today: writtenToday(b, t), chapters, income, contests };
  }).filter((r) => (r.b.status || 'progress') === 'progress' || r.wrote || r.chapters || r.income);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const inWork = rows.filter((r) => (r.b.status || 'progress') === 'progress'), others = rows.filter((r) => (r.b.status || 'progress') !== 'progress');
  const html = `
  <h2>${fmtMonthCap(mk)}</h2>
  <div class="grid4">
    <div class="stat"><div class="k">Написано за месяц</div><div class="v">${num(sum('wrote'))}</div><div class="s">${plural(sum('wrote'), ['знак', 'знака', 'знаков'])} · сегодня +${num(sum('today'))}</div></div>
    <div class="stat"><div class="k">Глав выложено</div><div class="v">${sum('chapters')}</div><div class="s">в ${fmtMonthIn(mk)}</div></div>
    <div class="stat"><div class="k">Доход за ${fmtMonth(mk).split(' ')[0]}</div><div class="v">${rub(sumSeries(incomeSeries(c.data.sales, [], from, t)), 0)}</div></div>
    <div class="stat"><div class="k">В работе</div><div class="v">${inWork.length}</div><div class="s">${plural(inWork.length, ['книга', 'книги', 'книг'])}</div></div>
  </div>
  ${rem.length ? `<div class="card"><h2>Напоминания</h2><div class="list">${rem.map((r) => `<a class="item row between" href="${r.to.startsWith('..') ? r.to : '#'}" ${r.to.startsWith('..') ? '' : `data-act="go" data-to="${r.to}"`}><span>${esc(r.title)}${r.sub ? `<span class="sub">${r.sub}</span>` : ''}</span><span class="badge ${r.n < 0 ? 'bad' : r.n <= 3 ? 'warn' : ''}">${fmtDate(r.date).slice(0, 5)} · ${when(r.n)}</span></a>`).join('')}</div></div>` : ''}
  ${inWork.length ? `<h2 style="margin-top:18px">В работе</h2>${inWork.map((r) => workCard(c, r)).join('')}` : ''}
  ${others.length ? `<div class="card"><h2>Другие книги в ${fmtMonthIn(mk)}</h2><div class="list">${others.map((r) => `<a class="item row between" href="#" data-act="go" data-to="/book/${r.b.id}"><span>${esc(r.b.title)}<span class="sub">${[r.wrote ? `+${num(r.wrote)} зн.` : '', r.chapters ? `глав ${r.chapters}` : '', STATUS[r.b.status] || ''].filter(Boolean).join(' · ')}</span></span><b>${r.income != null ? rub(r.income, 0) : ''}</b></a>`).join('')}</div></div>` : ''}`;
  return { html };
}
export { ic };
