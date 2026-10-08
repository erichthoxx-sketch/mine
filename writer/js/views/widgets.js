// Приоритетные показы в виджетах Литнета — для Мастерской: шкала в «Маркетинге» и напоминание подать заявку
import { esc, acts, toast, openSheet } from '../../../js/ui.js';
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
  if (!(p.next.spent > 0 || p.next.forecast > 0 || p.current.total > 0 || (c.data.campaigns || []).some((k) => k.channel === 'litnet'))) return '';
  return widgetCardHtml(p, c.settings);
}
acts['widget.applied'] = async (d) => {
  const st = app().store, m = (st.data.months || []).find((x) => x.id === d.m) || { id: d.m };
  await st.put('months', { ...m, id: d.m, widgetApplied: true, widgetAppliedAt: app().ctx().today });
  toast('Отмечено: заявка подана');
};

acts['widget.bonus'] = (d) => {
  const st = app().store, m = (st.data.months || []).find((x) => x.id === d.m) || { id: d.m };
  openSheet('Бонусные показы', `<p class="small muted" style="margin-top:0">Например, приветственные разовые показы от Литнета. Они прибавятся к показам за рекламу в этом месяце.</p>
    <div class="f2"><div><label for="wb">Показов</label><input id="wb" name="bonus" inputmode="numeric" value="${m.widgetBonus || ''}" placeholder="20000"></div>
    <div><label for="wn">Что это</label><input id="wn" name="note" value="${esc(m.widgetBonusNote || 'приветственный бонус, разово')}"></div></div>`, async (fd) => {
    const v = Number(String(fd.get('bonus') || '').replace(/\s/g, '')) || 0;
    await st.put('months', { ...m, id: d.m, widgetBonus: v, widgetBonusNote: (fd.get('note') || '').trim() });
  });
};
