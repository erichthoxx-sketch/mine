// «Мой сайт» (Связи): что сделать на сайте — находится само, сверкой «Мастерской» с сайтом. Чистые функции.
import { sameTitle } from '../../js/sitepub.js';

export const SITE_LINK = 'mysite'; // запись в w_links: свои дела по сайту → Планер и Todoist (Мастерская → Сайт)

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
