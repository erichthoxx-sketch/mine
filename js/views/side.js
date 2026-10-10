// Колонка «Сегодня» для «Доходов» на широком экране: доход последнего дня, цель месяца и ближайшие важные даты
import { esc } from '../ui.js';
import { npdStatusOf, npdAlert } from '../npd.js';
import { rub, fmtDate, fmtMonth, fmtMonthIn, pct } from '../format.js';
import { dayStats, buildPlan, monthKey, daysInMonth, incomeSeries, sumSeries, addDays, addMonths, npdDeadline, widgetProgram } from '../calc.js';

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayLong = (d) => `${WD[new Date(d + 'T00:00:00Z').getUTCDay()]}, ${Number(d.slice(8, 10))} ${MONG[Number(d.slice(5, 7)) - 1]}`;
const dleft = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
const when = (n) => (n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`);

// ближайшие важные даты (на 3 недели): налог, Rocket, конец рекламы, заявка на показы
export function incomeDates(c) {
  const t = c.today, d = c.data, out = [];
  const add = (date, title, sub, to) => { if (date <= addDays(t, 21)) out.push({ date, title, sub, to }); };
  const mOf = (k) => (d.months || []).find((m) => m.id === k) || {};
  const prev = addMonths(monthKey(t), -1);
  const gross = sumSeries(incomeSeries(c.sales, [], prev + '-01', addDays(monthKey(t) + '-01', -1)), 'gross');
  if (gross > 0 && !mOf(prev).taxPaid) add(npdDeadline(prev), `Налог за ${fmtMonth(prev)}`, `≈ ${rub(gross * (Number(c.settings.taxRate) || 4) / 100, 0)}`, '/money');
  if (gross > 0 && mOf(prev).rocketFee == null && t >= monthKey(t) + '-20') add(t, `Цифры Rocket за ${fmtMonth(prev)}`, 'записать из кабинета', '/ads');
  for (const k of c.campaigns) {
    if (k.oneOff) continue;
    if (k.start && k.start > t) add(k.start, `Старт рекламы «${k.name}»`, '', '/ads');
    if (k.end && k.end >= t) add(k.end, `Конец рекламы «${k.name}»`, 'продлевать ли?', '/ads');
  }
  const na = npdAlert(npdStatusOf(c.sales, c.legacyDays, c.settings, t), t);
  if (na) add(t, na.title, na.sub, '/money');
  const w = widgetProgram({ campaigns: c.campaigns, reports: d.reports, today: t, settings: c.settings, months: d.months || [] }).next;
  if (w.open && !w.applied) add(w.deadline, `Заявка на показы на ${fmtMonth(w.month)}`, `до 19:00 МСК · расход ${rub(w.spent, 0)}`, '/ads');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function sideIncome(c) {
  const t = c.today, s = c.settings, mk = monthKey(t);
  const last = c.hasData ? c.dataEnd : null, st = last ? dayStats(c.sales, c.legacyDays, last) : null;
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} }).find((p) => p.month === mk);
  const mtd = sumSeries(incomeSeries(c.sales, c.legacyDays, mk + '-01', t));
  const daysLeft = daysInMonth(mk) - Number(t.slice(8, 10)) + 1;
  const need = plan ? Math.max(0, plan.plan - mtd) / Math.max(1, daysLeft) : null;
  const dates = incomeDates(c);
  const chg = st && st.vsAvg != null ? `<span class="${st.vsAvg >= 0 ? 'up' : 'down'}">${st.vsAvg >= 0 ? '▲' : '▼'} ${pct(Math.abs(st.vsAvg), 0)}</span> к среднему за неделю` : '';
  return `<div class="side-h"><div class="side-k">Сегодня</div><div class="side-date">${dayLong(t)}</div></div>
    ${st ? `<a class="side-card tap" href="#" data-act="go" data-to="/day"><div class="small muted">Доход ${last === t ? 'сегодня' : `за ${fmtDate(last).slice(0, 5)}`}</div><div class="side-big">${rub(st.royalty, 0)}</div><div class="small">${chg}</div></a>` : ''}
    ${plan ? `<a class="side-card tap" href="#" data-act="go" data-to="/money"><div class="row between small"><span class="muted">Цель на ${fmtMonth(mk).split(' ')[0]}</span><span>${pct(mtd / plan.plan, 0)}</span></div>
      <div class="side-big">${rub(mtd, 0)} <span class="muted small">из ${rub(plan.plan, 0)}</span></div>
      <div class="progress"><i style="width:${Math.min(100, (mtd / plan.plan) * 100).toFixed(1)}%"></i></div>
      <div class="small muted">${need > 0 ? `≈ ${rub(need, 0)} в день до конца месяца` : 'цель месяца выполнена ✓'}</div></a>` : ''}
    <div class="side-k" style="margin-top:20px">Ближайшее</div>
    ${dates.length ? `<div class="side-card"><div class="plist">${dates.map((x) => `<a class="pitem tap" href="#" data-act="go" data-to="${x.to}"><span class="dot k-money"></span><span class="pi-body"><span class="pi-t">${esc(x.title)}</span><span class="pi-s">${fmtDate(x.date).slice(0, 5)} · ${when(dleft(x.date, t))}${x.sub ? ' · ' + esc(x.sub) : ''}</span></span></a>`).join('')}</div></div>` : '<p class="small muted">Ничего срочного на три недели ✓</p>'}
    <div class="side-actions"><button data-act="event.quick" data-date="${t}">+ Событие</button><button data-act="sale.manual" data-date="${t}">+ Продажи</button><label class="btn" style="cursor:pointer" title="Отчёт о продажах Литнета (CSV) — загрузится сразу">Загрузить выгрузку<input type="file" accept=".csv,.txt" data-chg="imp.any" hidden></label></div>`;
}
export { fmtMonthIn };
