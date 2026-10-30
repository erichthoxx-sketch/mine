// Левая колонка на компьютере: под разделами — ближайшее важное (на две недели): даты запусков, сбой, бюджет кампании,
// конец рекламы из «Доходов», совет урезать расход. Тихо и коротко: дата серым и одна строка.
import { esc } from '../../../js/ui.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { launchMilestones } from '../launchcalc.js';
import { spendAdvice } from '../dcalc.js';
import { resolvedLaunches } from './launchctx.js';
import { metrikaOf } from './metrika.js';
import { demo } from '../demo.js';

const when = (d, t) => { const n = Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(t + 'T00:00:00Z')) / 86400000); return n <= 0 ? 'сегодня' : n === 1 ? 'завтра' : `${d.slice(8, 10)}.${d.slice(5, 7)}`; };

export function navSide(a) {
  if (!a.store.user || demo.on) return '';
  const c = a.ctx(), t = c.today, till = addDays(t, 14), out = [];
  const add = (date, text, to, warn = false) => { if (date && date <= till) out.push({ date: date < t ? t : date, text, to, warn }); };
  const L = resolvedLaunches(a);
  for (const x of L) for (const m of launchMilestones(x.plan)) if (m.date >= t) add(m.date, m.title, '/launch/' + x.id);
  const last = [...outageSet(c.data.days || [])].filter((d) => d >= addDays(t, -6) && d <= t).sort().pop();
  if (last) add(t, `Был сбой ${last.slice(8, 10)}.${last.slice(5, 7)} — пока не менять настройки`, '/', true);
  const main = a.snap('main'), stats = a.snap('stats'), m = metrikaOf(c);
  for (const camp of (main?.campaigns || []).filter((x) => x.state === 'ON')) {
    if (camp.budget?.kind === 'period' && camp.budget.to && camp.budget.to >= t) add(camp.budget.to, `Кончается бюджет «${camp.name}»`, '/c/' + camp.id);
    const r = m?.counterId && stats ? spendAdvice({ camp, daily: stats.daily || [], conv: stats.conv || [], today: t, goals: m.main, skip: outageSet(c.data.days || []), value: L[0]?.plan.royalty || Number(c.settings.direct?.econ?.rev) || null }) : null;
    if (r?.kind === 'cut' || r?.kind === 'back') add(t, `«${camp.name}»: ${r.kind === 'cut' ? 'урезать расход' : 'вернуть прежний расход'}`, '/c/' + camp.id, true);
  }
  for (const k of c.data.campaigns || []) if (!k.oneOff && k.end && k.end >= t) add(k.end, `Конец рекламы «${k.name}»`, '/');
  if (!out.length) return '';
  out.sort((x, y) => x.date.localeCompare(y.date));
  return `<div class="nav-side"><div class="nav-side-h">Ближайшее</div>${out.slice(0, 6).map((x) => `<a href="#" class="nav-side-i" data-act="go" data-to="${esc(x.to)}"><span class="${x.warn ? 'warnc' : 'muted'}">${when(x.date, t)}</span>${esc(x.text)}</a>`).join('')}</div>`;
}
