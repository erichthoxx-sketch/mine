// Дополнительные будничные обзоры дел на выходные; сами задания остаются на исходных датах.
import { addDays } from '../../js/calc.js';

const weekday = d => new Date(d + 'T00:00:00Z').getUTCDay();
const passive = new Set(['wait', 'done', 'weekend']); // запланированное само выйдет, делать ничего не надо
export const weekendReminderDay = date => {
  const d = weekday(date);
  return d === 6 ? addDays(date, -2) : d === 0 ? addDays(date, -2) : '';
};
export function weekendReviewItems(items = [], from = '', to = '', today = '') {
  const groups = new Map();
  for (const x of items) {
    if (!x.date || passive.has(x.kind) || !weekendReminderDay(x.date)) continue;
    const key = x.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(x);
  }
  return [...groups.entries()].map(([eventDate, list]) => {
    const reminder = weekendReminderDay(eventDate);
    if (reminder < from || reminder > to) return null;
    const isSaturday = weekday(eventDate) === 6;
    const names = list.slice(0, 3).map(x => String(x.title || '').replace(/<[^>]+>/g,'').trim());
    return {
      id: 'weekend_' + eventDate,
      kind: 'weekend',
      date: reminder < today ? today : reminder, // не пропадает из приложения, если вошла позже
      dueRaw: reminder, // Todoist не передвигает срок каждый просроченный день
      eventDate,
      title: 'Посмотреть дела на ' + (isSaturday ? 'субботу' : 'воскресенье') + ' (' + list.length + ')',
      sub: names.join(' · ') + (list.length > 3 ? ' · и еще ' + (list.length - 3) : '') + '. Даты самих задач не меняются.',
      to: '/plan',
    };
  }).filter(Boolean).sort((a,b) => a.date.localeCompare(b.date));
}
