// Свои задачи Ланы из Todoist (проекты «Книги» и «Мастерская») — общие для «Мастерской» и «Доходов».
// Список приходит при синхронизации Мастерской и лежит в настройках (settings.todoist.own).
export const ownTasks = (settings) => (settings?.todoist?.own || []);
// раздел «Книги» → книга: «Альпийский развод» ↔ «Альпийский развод. Он оставил меня умирать»
const short = (t) => String(t || '').split(/[.!?:]/)[0].trim().toLowerCase();
export function bookOfTask(x, books) {
  if (x.p.toLowerCase() !== 'книги' || !x.s) return null;
  const s = x.s.trim().toLowerCase();
  return books.find((b) => { const t = short(b.title); return t === s || (s.length >= 4 && (t.startsWith(s) || s.startsWith(t))); }) || null;
}
export const isMoneyTask = (x) => x.p.toLowerCase() === 'мастерская' && /деньг|реклам|налог|финанс/i.test(x.s);

// «Сделано» в приложении — закрываем задачу и в Todoist
import { acts, toast } from './ui.js';
acts['td.close'] = async (d) => {
  const a = window.__app, s = a.ctx().settings, token = s.todoistToken, td = s.todoist || {};
  if (!token) { toast('Todoist не подключён (Мастерская → Настройки)'); return; }
  try {
    const r = await fetch(`https://api.todoist.com/api/v1/tasks/${d.id}/close`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok && r.status !== 404) throw new Error('Todoist ответил ' + r.status);
  } catch (e) { toast('Не получилось закрыть в Todoist: ' + (e.message || e)); return; }
  await a.store.saveSettings({ todoist: { ...td, own: (td.own || []).filter((x) => x.id !== d.id) } });
  toast('Готово — закрыто и в Todoist');
};
