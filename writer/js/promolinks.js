// Ссылки для продвижения Литнета (utm_litref/ref): напоминания по сроку.
// Полностью чистая логика, даты в YYYY-MM-DD и UTC: результат не зависит от часового пояса.
// Правила Ланы: срок вт -> предыдущий чт; сб -> чт; вс -> пт; иначе предыдущий рабочий день.
import { addDays } from '../../js/calc.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = value => DATE.test(String(value || '')) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay();
export function promoReminderDate(expires) {
  if (!validDay(expires)) return '';
  const wd = weekday(expires);
  if (wd === 2) return addDays(expires, -5); // вторник: предыдущий четверг
  if (wd === 6 || wd === 0) return addDays(expires, -2); // суббота -> четверг, воскресенье -> пятница
  const prev = addDays(expires, -1);
  return weekday(prev) === 0 ? addDays(prev, -2) : weekday(prev) === 6 ? addDays(prev, -1) : prev;
}
export function isLitnetLink(value, type = 'promo') {
  if (!value) return type !== 'promo';
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['litnet.com', 'www.litnet.com'].includes(u.hostname) &&
      (type !== 'promo' || /^\/ref\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname));
  } catch { return false; }
}
export function promoToken(link) {
  if (!isLitnetLink(link)) return '';
  return new URL(link).pathname.split('/').filter(Boolean)[1] || '';
}
export function promoLinkTasks(links = [], today = '', { includeOverdue = true } = {}) {
  return links.filter(x => x && x.status !== 'archived' && validDay(x.expires) &&
      x.reminderDoneFor !== x.expires)
    .map(x => {
      const due = promoReminderDate(x.expires);
      return {
        id: x.id, expires: x.expires, due,
        date: includeOverdue && today && due < today ? today : due,
        overdue: !!today && due < today,
        title: 'Обновить UTM-ссылку' + (x.campaign ? ': ' + x.campaign : x.book ? ': ' + x.book : ''),
        sub: 'Литнет · действует до ' + x.expires + (x.book ? ' · ' + x.book : ''),
        to: '/marketing',
      };
    }).sort((a,b) => a.date.localeCompare(b.date) || a.expires.localeCompare(b.expires));
}
export function activePromoLinks(links = []) {
  return links.filter(x => x.status !== 'archived').slice().sort((a,b) => (a.expires || '').localeCompare(b.expires || ''));
}
