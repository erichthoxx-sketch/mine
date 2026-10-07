// Главная Мастерской: всё актуальное за текущий месяц по книгам и напоминания обо всём, у чего есть дата
import { esc } from '../../../js/ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn, fmtMonthCap } from '../../../js/format.js';
import { monthKey, addDays, addMonths, incomeSeries, sumSeries, npdDeadline } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { charsAt, writtenToday, contestStatus, waitingStatus } from '../wcalc.js';
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
  const html = `
  <h2>${fmtMonthCap(mk)}</h2>
  <div class="grid4">
    <div class="stat"><div class="k">Написано за месяц</div><div class="v">${num(sum('wrote'))}</div><div class="s">знаков · сегодня +${num(sum('today'))}</div></div>
    <div class="stat"><div class="k">Глав выложено</div><div class="v">${sum('chapters')}</div><div class="s">в ${fmtMonthIn(mk)}</div></div>
    <div class="stat"><div class="k">Доход книг</div><div class="v">${rub(sum('income'), 0)}</div><div class="s">роялти за месяц, по «Доходам»</div></div>
    <div class="stat"><div class="k">В работе</div><div class="v">${c.wbooks.filter((b) => (b.status || 'progress') === 'progress').length}</div><div class="s">книг</div></div>
  </div>
  <div class="card"><h2>Напоминания</h2>
    ${rem.length ? `<div class="list">${rem.map((r) => `<a class="item row between" href="${r.to.startsWith('..') ? r.to : '#'}" ${r.to.startsWith('..') ? '' : `data-act="go" data-to="${r.to}"`}><span>${esc(r.title)}${r.sub ? `<span class="sub">${r.sub}</span>` : ''}</span><span class="badge ${r.n < 0 ? 'bad' : r.n <= 3 ? 'warn' : ''}">${fmtDate(r.date).slice(0, 5)} · ${when(r.n)}</span></a>`).join('')}</div>`
    : '<p class="muted" style="margin:0">На ближайшие две недели ничего срочного. Сроки книг, конкурсы и очередь — в Планере.</p>'}</div>
  <div class="card"><h2>Книги в этом месяце</h2>
    ${rows.length ? `<div class="list">${rows.map((r) => `<a class="item" href="#" data-act="go" data-to="/book/${r.b.id}"><div class="row between"><b>${esc(r.b.title)}</b><span class="small muted">${STATUS[r.b.status] || STATUS.progress}</span></div>
      <div class="small">написано +${num(r.wrote)} зн.${r.today ? ` (сегодня +${num(r.today)})` : ''} · глав выложено ${r.chapters}${r.income != null ? ` · доход ${rub(r.income, 0)}` : ''}</div>
      ${r.contests.length ? `<div class="small muted">${r.contests.map((x) => `конкурс «${esc(x.name)}»${x.end ? ' до ' + fmtDate(x.end) : ''}`).join(' · ')}</div>` : ''}</a>`).join('')}</div>`
    : '<p class="muted" style="margin:0">В этом месяце пока нет книг в работе.</p>'}
    <div class="hint">Написано — по знакам вкладок книги (Пролог, Главы, Эпилог, От автора); доход — по книге, связанной в карточке книги («Книга в приложении доходов»).</div></div>`;
  return { html };
}
export { ic };
