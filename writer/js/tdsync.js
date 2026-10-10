// Запуск синхронизации с Todoist: при открытии и после изменений (с паузой), не чаще раза в минуту;
// если в планере ничего не поменялось — раз в 10 минут (узнать, что закрыто в самом Todoist).
import { todoistTasks, syncTodoist, syncIdeas, TD_DAYS } from './todoist.js';
import { planItems } from './views/plan.js';
import { addDays } from '../../js/calc.js';
import { toast } from '../../js/ui.js';

let busy = false, lastHash = '', lastAt = 0, timer = null, pullNext = false;
// pull — открыла приложение или вернулась в него: подтянуть изменения из самого Todoist сразу (не чаще раза в 30 секунд)
export function scheduleTodoist(a, ms = 20000, { pull = false } = {}) {
  if (!a.ctx().settings.todoistToken || a.ctx().settings.todoistOff) return;
  if (pull) pullNext = true;
  if (pullNext) ms = Math.min(ms, 2500); // ждём свежее из Todoist — не откладываем надолго
  clearTimeout(timer); timer = setTimeout(() => { const pl = pullNext; pullNext = false; runTodoist(a, { pull: pl }).catch(() => {}); }, ms);
}
export async function runTodoist(a, { force = false, pull = false } = {}) {
  const c = a.ctx(), s = c.settings, token = s.todoistToken;
  if (!token || busy || (!force && (s.todoistOff || !navigator.onLine))) return null;
  const want = todoistTasks(planItems(c, c.today, addDays(c.today, TD_DAYS)), c.wbooksById);
  const hash = JSON.stringify([want.map((w) => [w.key, w.content, w.date, w.description]), c.data.w_ideas.map((x) => [x.id, x.title, x.text, x.deletedAt || '', x.tdId || '', x.bookId || ''])]);
  if (!force && !pull && hash === lastHash && Date.now() - lastAt < 10 * 60000) return null;
  if (!force && Date.now() - lastAt < (pull ? 30000 : 60000)) { scheduleTodoist(a, pull ? 30000 : 60000, { pull }); return null; }
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
    // идеи: метка «идея» в Todoist ⇄ Идеи Мастерской
    try { const ri = await syncIdeas(token, c.data.w_ideas, c.wbooksById); for (const x of ri.puts) await a.store.put('w_ideas', x); if (force && ri.created) toast(`Из Todoist пришло идей: ${ri.created}`); } catch (e) { console.error(e); }
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
