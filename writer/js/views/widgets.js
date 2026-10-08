// Приоритетные показы в виджетах Литнета — для Мастерской: шкала в «Маркетинге» и напоминание подать заявку
import { esc, acts, toast } from '../../../js/ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn } from '../../../js/format.js';
import { widgetProgram } from '../../../js/calc.js';

const app = () => window.__app;
export const widgetState = (c) => widgetProgram({ campaigns: c.data.campaigns || [], reports: c.data.reports || [], today: c.today, settings: c.settings, months: c.data.months || [] });
// напоминание: с 15-го по 25-е, пока заявка не отмечена поданной
export function widgetReminder(c) {
  const n = widgetState(c).next;
  if (!n.open || n.applied || !(n.spent > 0 || n.forecast > 0)) return null;
  return { date: n.deadline, title: `Подать заявку на приоритетные показы на ${fmtMonth(n.month)}`, sub: `до ${fmtDate(n.deadline).slice(0, 5)}, 19:00 МСК · расход с ${fmtDate(n.from).slice(0, 5)}: ${rub(n.spent, 0)}`, to: '/marketing' };
}
export function widgetCard(c) {
  const p = widgetState(c), n = p.next, cur = p.current, N = (v) => num(v);
  if (!(n.spent > 0 || n.forecast > 0 || cur.shows > 0)) return '';
  const share = Math.min(1, ((n.spent - n.blocks * n.step) / n.step) || 0);
  const form = c.settings.widgetFormUrl ? `<a class="btn" href="${esc(c.settings.widgetFormUrl)}" target="_blank" rel="noopener">Открыть форму</a>` : '';
  return `<div class="card"><h2>Приоритетные показы в виджетах</h2>
    <div class="row between small" style="margin-top:4px"><span>Сейчас, в ${fmtMonthIn(cur.month)}</span><b>${cur.shows ? N(cur.shows) + ' показов' : 'нет'}</b></div>
    <div class="wbar" style="margin-top:10px"><div class="row between small"><span>На ${fmtMonth(n.month)} · реклама ${fmtDate(n.from).slice(0, 5)}–${fmtDate(n.to).slice(0, 5)}</span><span>${rub(n.spent, 0)}</span></div>
      <div class="progress"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
      <div class="small muted">${n.shows ? `уже ${N(n.shows)} показов · ` : ''}до ${n.shows ? 'следующих' : 'первых'} +${N(n.step * n.perRub)} — ещё ${rub(n.toNext, 0)}${n.forecastShows !== n.shows ? ` · по плану кампаний ≈ ${N(n.forecastShows)}` : ''}</div></div>
    ${n.open && !n.applied ? `<div class="alert alert-thin" style="margin-top:8px">Пора подать заявку на ${fmtMonth(n.month)} — до ${fmtDate(n.deadline)}, 19:00 МСК. В форме укажите расход: <b>${rub(n.spent, 0)}</b>.<div class="row" style="margin-top:6px">${form}<button class="primary" data-act="widget.applied" data-m="${n.month}">Заявку подала</button></div></div>`
      : n.applied ? `<div class="small up" style="margin-top:6px">✓ Заявка на ${fmtMonth(n.month)} подана</div>` : `<div class="small muted" style="margin-top:6px">Заявки на ${fmtMonth(n.month)} — с ${fmtDate(n.to.slice(0, 8) + '15').slice(0, 5)} по ${fmtDate(n.deadline).slice(0, 5)}, напомню.</div>`}
  </div>`;
}
acts['widget.applied'] = async (d) => {
  const st = app().store, m = (st.data.months || []).find((x) => x.id === d.m) || { id: d.m };
  await st.put('months', { ...m, id: d.m, widgetApplied: true, widgetAppliedAt: app().ctx().today });
  toast('Отмечено: заявка подана');
};
