// Запуск синхронизации с Todoist: при открытии и после изменений (с паузой), не чаще раза в минуту;
// если в планере ничего не поменялось — раз в 10 минут (узнать, что закрыто в самом Todoist).
import { todoistTasks, syncTodoist, TD_DAYS } from './todoist.js';
import { planItems } from './views/plan.js';
import { addDays } from '../../js/calc.js';
import { toast } from '../../js/ui.js';

let busy = false, lastHash = '', lastAt = 0, timer = null;
export function scheduleTodoist(a, ms = 20000) {
  if (!a.ctx().settings.todoistToken || a.ctx().settings.todoistOff) return;
  clearTimeout(timer); timer = setTimeout(() => runTodoist(a).catch(() => {}), ms);
}
export async function runTodoist(a, { force = false } = {}) {
  const c = a.ctx(), s = c.settings, token = s.todoistToken;
  if (!token || busy || (!force && (s.todoistOff || !navigator.onLine))) return null;
  const want = todoistTasks(planItems(c, c.today, addDays(c.today, TD_DAYS)), c.wbooksById);
  const hash = JSON.stringify(want.map((w) => [w.key, w.content, w.date, w.description]));
  if (!force && hash === lastHash && Date.now() - lastAt < 10 * 60000) return null;
  if (!force && Date.now() - lastAt < 60000) { scheduleTodoist(a, 60000); return null; }
  busy = true; lastAt = Date.now();
  try {
    const r = await syncTodoist(token, want, s.todoist || {});
    lastHash = hash;
    // закрыла в Todoist дело из очереди или по связям — отмечаем и здесь
    for (const w of r.doneInTodoist) {
      const x = w.item;
      if (x.kind === 'queue' && x.id) { const q = c.data.w_queue.find((y) => y.id === x.id); if (q && !q.done) await a.store.put('w_queue', { ...q, done: true, doneAt: c.today }); }
      if (x.todoK) { const l = c.data.w_links.find((y) => y.id === x.linkId); if (l) await a.store.put('w_links', { ...l, todos: (l.todos || []).map((t) => (t.k === x.todoK ? { ...t, done: true, doneAt: c.today } : t)) }); }
    }
    await a.store.saveSettings({ todoist: { ...r.state, err: '' } });
    if (force) {
      const st = r.stats, parts = [st.created && `добавлено ${st.created}`, st.updated && `обновлено ${st.updated}`, st.closed && `закрыто ${st.closed}`, r.doneInTodoist.length && `сделано в Todoist: ${r.doneInTodoist.length}`].filter(Boolean);
      toast('Todoist: ' + (parts.join(' · ') || 'всё уже совпадает'));
    }
    return r;
  } catch (e) {
    await a.store.saveSettings({ todoist: { ...(s.todoist || {}), err: e.message, errAt: new Date().toISOString() } }).catch(() => {});
    if (force) toast('Todoist: ' + e.message);
    return null;
  } finally { busy = false; }
}
