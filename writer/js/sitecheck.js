// «Мой сайт» (Связи): что сделать на сайте — находится само, сверкой «Мастерской» с сайтом. Чистые функции.
import { sameTitle } from '../../js/sitepub.js';
import { addDays, diffDays } from '../../js/calc.js';

export const SITE_LINK = 'mysite'; // запись в w_links: свои дела по сайту → Планер и Todoist (Мастерская → Сайт)

// Розыгрыш на сайте по пятницам: пока включён и на этой неделе не проведён — дело «Провести розыгрыш» на пятницу
// (пропустила — висит на сегодня до конца недели). Пятница — как на сайте (site/content.js → raffleFriday).
export function raffleTodo(site, today) {
  if (!site?.raffleOn) return null;
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() + (4 - ((d.getDay() + 6) % 7)));
  const fri = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return site.raffleLast === fri ? null : { date: fri };
}

// Домен сайта: куплен в Рег.ру 27.10.2026 на год. Дата «оплачен до» правится в «Мой сайт» (settings.site.domainTill).
// Напоминание «Продлить домен» — за 2 месяца; не продлила — висит в Планере на сегодня до продления.
export const DOMAIN = 'lanafreitag.ru', DOMAIN_TILL = '2027-10-27', DOMAIN_AHEAD = 60;
export function domainInfo(settings = {}, today) {
  const till = settings?.site?.domainTill || DOMAIN_TILL, days = diffDays(today, till);
  return { name: DOMAIN, till, days, due: addDays(till, -DOMAIN_AHEAD), soon: days <= DOMAIN_AHEAD, late: days < 0 };
}

// wbooks — книги Мастерской; site — siteInfo (js/sitepub.js); subs — подписчики [{at}]; seenAt — когда смотрела подписчиков
export function siteChecks({ wbooks = [], site = null, subs = null, seenAt = '' } = {}) {
  if (!site) return [];
  const out = [];
  for (const b of wbooks) {
    if (!b?.title || b.status === 'idea' || b.archived) continue;
    const s = site.books.find((x) => sameTitle(x.title, b.title));
    if (!s) {
      out.push({ k: 'add:' + b.id, title: `Добавить на сайт «${b.title}»`, why: b.status === 'done' ? 'Книга завершена, а на сайте её нет — читатели сайта о ней не узнают.' : 'Книга пишется, а на сайте её нет. Страница книги собирает читателей ещё до финала.', admin: true });
      continue;
    }
    if (s.hidden) out.push({ k: 'hidden:' + b.id, title: `Книга «${b.title}» скрыта на сайте`, why: 'Читатели её не видят. Если скрыли нарочно — всё в порядке.', admin: true, soft: true });
    else if (b.status === 'done' && s.status !== 'done') out.push({ k: 'done:' + b.id, title: `Отметить на сайте: «${b.title}» завершена`, why: 'В Мастерской книга завершена, а на сайте всё ещё «Пишется». Завершённую книгу охотнее покупают.', admin: true });
  }
  if (site.subOn && site.giftName && !site.giftUrl) out.push({ k: 'gift', title: 'Добавить ссылку на подарок', why: `Читатели подписываются ради «${site.giftName}», но скачать пока нечего.`, admin: true });
  if (subs) {
    const fresh = subs.filter((x) => x.at && (!seenAt || x.at > seenAt));
    if (fresh.length) out.push({ k: 'subs', title: `Новые подписчики: ${fresh.length}`, why: 'Пока нет рассылки, адреса лежат в админке сайта → «Общее» → Подписчики: их можно скопировать или скачать таблицей.', subs: fresh.length });
  }
  return out;
}
