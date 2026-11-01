// Запуск синхронизации с Todoist: при открытии и после изменений (с паузой), не чаще раза в минуту;
// если в планере ничего не поменялось — раз в 10 минут (узнать, что закрыто в самом Todoist).
import { todoistTasks, syncTodoist, syncIdeas, fetchOwnTasks, moveDue, TD_DAYS } from './todoist.js';
import { overdueToMove, linkTodosToMove, trimMoved } from './dayhist.js';
import { planItems } from './views/plan.js';
import { addDays } from '../../js/calc.js';
import { toast } from '../../js/ui.js';

let busy = false, lastHash = '', lastAt = 0, timer = null, pullNext = false;
// свои дела из Todoist — отдельно от общей синхронизации и первым делом: даже если общая синхронизация споткнётся
// или ждёт своей очереди, Планер покажет свежие дела (раньше список мог застрять — «куда пропали дела на сегодня»)
let ownAt = 0;
// несделанные дела по связям (контакты) с прошлой даты — на сегодня; в журнале переносов остаётся «откуда»
async function carryLinks(a) {
  const c = a.ctx(), late = linkTodosToMove(c.data.w_links, c.today);
  if (!late.length) return [];
  for (const id of [...new Set(late.map((x) => x.linkId))]) {
    const l = a.ctx().data.w_links.find((y) => y.id === id), keys = new Set(late.filter((x) => x.linkId === id).map((x) => x.k));
    await a.store.patch('w_links', id, { todos: (l.todos || []).map((t) => (keys.has(t.k) ? { ...t, date: c.today } : t)) });
  }
  return late.map((x) => ({ link: x.linkId, id: x.k, t: x.t, from: x.from, to: c.today }));
}
export async function refreshOwn(a, { force = false } = {}) {
  const s = a.ctx().settings, token = s.todoistToken;
  if (!token || s.todoistOff || !navigator.onLine || (!force && Date.now() - ownAt < 20000)) return;
  ownAt = Date.now();
  try {
    const own = await fetchOwnTasks(token, s.todoist?.made || {}), today = a.ctx().today, moved = [];
    // несделанное с прошлых дней — само на сегодня (и в Todoist); повторяющиеся дела не трогаем
    for (const x of overdueToMove(own, today)) {
      try { await moveDue(token, x.id, today); moved.push({ id: x.id, t: x.t, from: x.d, to: today }); x.d = today; } catch (e) { console.error(e); }
    }
    try { moved.push(...await carryLinks(a)); } catch (e) { console.error(e); }
    const td = a.ctx().settings.todoist || {};
    await a.store.saveSettings({ todoist: { ...td, own, ownAt: new Date().toISOString(), ...(moved.length ? { moved: trimMoved([...(td.moved || []), ...moved], today) } : {}) } });
  } catch (e) {
    console.error(e);
    await a.store.saveSettings({ todoist: { ...(a.ctx().settings.todoist || {}), err: e.message || String(e), errAt: new Date().toISOString() } }).catch(() => {});
  }
}
// pull — открыла приложение или вернулась в него: подтянуть изменения из самого Todoist сразу (не чаще раза в 30 секунд)
export function scheduleTodoist(a, ms = 20000, { pull = false } = {}) {
  if (!a.ctx().settings.todoistToken || a.ctx().settings.todoistOff) return;
  if (pull) { pullNext = true; refreshOwn(a); }
  if (pullNext) ms = Math.min(ms, 2500); // ждём свежее из Todoist — не откладываем надолго
  clearTimeout(timer); timer = setTimeout(() => { const pl = pullNext; pullNext = false; runTodoist(a, { pull: pl }).catch(() => {}); }, ms);
}
export async function runTodoist(a, { force = false, pull = false } = {}) {
  const c = a.ctx(), s = c.settings, token = s.todoistToken;
  if (busy && Date.now() - lastAt > 3 * 60000) busy = false; // прошлая синхронизация зависла — не держим очередь
  if (!token || busy || (!force && (s.todoistOff || !navigator.onLine))) return null;
  const want = todoistTasks(planItems(c, c.today, addDays(c.today, TD_DAYS)), c.wbooksById);
  const hash = JSON.stringify([want.map((w) => [w.key, w.content, w.date, w.description]), c.data.w_ideas.map((x) => [x.id, x.title, x.text, x.deletedAt || '', x.tdId || '', x.bookId || '', x.status || ''])]);
  if (!force && !pull && hash === lastHash && Date.now() - lastAt < 10 * 60000) return null;
  if (!force && Date.now() - lastAt < (pull ? 30000 : 60000)) { scheduleTodoist(a, pull ? 30000 : 60000, { pull }); return null; }
  busy = true; lastAt = Date.now();
  try {
    const r = await syncTodoist(token, want, { ...(s.todoist || {}), books: c.wbooks.map((b) => ({ title: b.title })) });
    lastHash = hash;
    // закрыла в Todoist дело из очереди или по связям — отмечаем и здесь
    for (const w of r.doneInTodoist) {
      const x = w.item;
      if (x.kind === 'queue' && x.id) { const q = c.data.w_queue.find((y) => y.id === x.id); if (q && !q.done) await a.store.put('w_queue', { ...q, done: true, doneAt: c.today }); }
      if (x.todoK) { const l = c.data.w_links.find((y) => y.id === x.linkId); if (l) await a.store.put('w_links', { ...l, todos: (l.todos || []).map((t) => (t.k === x.todoK ? { ...t, done: true, doneAt: c.today } : t)) }); }
    }
    // идеи: метка «идея» в Todoist ⇄ Идеи Мастерской
    try { const ri = await syncIdeas(token, c.data.w_ideas, c.wbooksById); for (const x of ri.puts) await a.store.put('w_ideas', x); if (force && ri.created) toast(`Из Todoist пришло идей: ${ri.created}`); } catch (e) { console.error(e); }
    // поверх текущего: журнал переносов (moved) и время своих дел не теряются
    await a.store.saveSettings({ todoist: { ...(a.ctx().settings.todoist || {}), ...r.state, err: '' } });
    if (force) {
      const st = r.stats, parts = [st.created && `добавлено ${st.created}`, st.updated && `обновлено ${st.updated}`, st.closed && `закрыто ${st.closed}`, r.doneInTodoist.length && `сделано в Todoist: ${r.doneInTodoist.length}`].filter(Boolean);
      toast('Todoist: ' + (parts.join(' · ') || 'всё уже совпадает'));
    }
    return r;
  } catch (e) {
    // что-то не отправилось — свои задачи из Todoist всё равно подтягиваем, чтобы Планер их показал
    let own = null; try { own = await fetchOwnTasks(token, s.todoist?.made || {}); } catch { /* нет связи */ }
    await a.store.saveSettings({ todoist: { ...(s.todoist || {}), ...(own ? { own } : {}), err: e.message, errAt: new Date().toISOString() } }).catch(() => {});
    if (force) toast('Todoist: ' + e.message);
    return null;
  } finally { busy = false; }
}
