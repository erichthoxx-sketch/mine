// Приоритетные показы в виджетах Литнета — для Мастерской: шкала в «Маркетинге» и напоминание подать заявку
import { esc, acts, toast } from '../../../js/ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn } from '../../../js/format.js';
import { widgetProgram } from '../../../js/calc.js';
import { widgetCardHtml } from '../../../js/widgetcard.js';

const app = () => window.__app;
export const widgetState = (c) => widgetProgram({ campaigns: c.data.campaigns || [], reports: c.data.reports || [], today: c.today, settings: c.settings, months: c.data.months || [] });
// напоминание: с 15-го по 25-е, пока заявка не отмечена поданной
export function widgetReminder(c) {
  const n = widgetState(c).next;
  if (!n.open || n.applied || !(n.spent > 0 || n.forecast > 0)) return null;
  return { date: n.deadline, title: `Подать заявку на приоритетные показы на ${fmtMonth(n.month)}`, sub: `до ${fmtDate(n.deadline).slice(0, 5)}, 19:00 МСК · расход с ${fmtDate(n.from).slice(0, 5)}: ${rub(n.spent, 0)}`, to: '/marketing' };
}
export function widgetCard(c) {
  const p = widgetState(c);
  if (!(p.next.spent > 0 || p.next.forecast > 0 || p.current.shows > 0)) return '';
  return widgetCardHtml(p, c.settings);
}
acts['widget.applied'] = async (d) => {
  const st = app().store, m = (st.data.months || []).find((x) => x.id === d.m) || { id: d.m };
  await st.put('months', { ...m, id: d.m, widgetApplied: true, widgetAppliedAt: app().ctx().today });
  toast('Отмечено: заявка подана');
};
