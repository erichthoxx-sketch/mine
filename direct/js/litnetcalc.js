// "Мой Литнет": только собственные персональные ссылки и реферальные метки.
// Литнет API для их выдачи нет — ссылки создаются в личном кабинете Литнета.
// Данные w_promolinks общие с Мастерской и ее будничными напоминаниями.
import { promoReminderDate, promoToken, isLitnetLink, validDay } from '../../writer/js/promolinks.js';
import { addDays } from '../../js/calc.js';

const name = x => String(x || '').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
export const bookMatches = (a,b) => !!a && !!b && name(a) === name(b);
export const exactTag = url => {
  const token = promoToken(url);
  if (!token || !/^[A-Za-z0-9_-]{1,128}$/.test(token)) return '';
  return 'utm_litref=' + token;
};
export const daysBetween = (a,b) => (validDay(a) && validDay(b)) ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) : null;
export function linkStatus(link, today) {
  const n = daysBetween(today, link?.expires);
  if (n == null) return {type:'unknown',label:'Дата не указана',renew:''};
  const renew = promoReminderDate(link.expires);
  if (n < 0) return {type:'expired',label:'Новые привязки не создаются',renew};
  if (n === 0) return {type:'today',label:'Последний день новых привязок',renew};
  if (n <= 5) return {type:'soon',label:'Осталось '+n+' дн.',renew};
  return {type:'active',label:'До '+link.expires.split('-').reverse().join('.'),renew};
}
export function visibleLinks(data = [], books = [], {today = ''} = {}) {
  const names = Object.fromEntries(books.map(b=>[String(b.id),b.title]));
  return data.filter(x=>x?.status!=='archived').map(x=>({
    ...x,bookTitle:names[String(x.bookId)]||x.book||'Без книги',
    tag:exactTag(x.url),state:linkStatus(x,today)
  })).sort((a,b)=>a.expires.localeCompare(b.expires));
}
export function readyForCampaign(link, campaignStart, bookName = '') {
  if (!link || link.status==='archived') return false;
  if (!exactTag(link.url) || !validDay(link.expires)) return false;
  if (campaignStart && link.expires < campaignStart) return false;
  return !bookName || bookMatches(link.bookTitle||link.book||'',bookName);
}
export function renewalInstructions(link) {
  return {expires:link.expires,notice:promoReminderDate(link.expires),tag:exactTag(link.url),
    reason:'После срока ссылка открывается, но больше не привязывает новых читателей'};
}
export function expiresFromCreated(created) {
  return validDay(created) ? addDays(created,29) : '';
}
