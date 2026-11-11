// «Запуск книги» одним экраном (12.11.2026, идея «А», её «да»): всё, что нужно для старта книги, в одном списке —
// пункты отмечаются сами по данным Мастерской, сайта, Почты, Директа и Пиратов. Чистая функция; тест — tests/launchlist.test.js.
import { litTagInfo } from '../../js/littag.js';

const same = (a, b) => { const k = (x) => String(x || '').replace(/\*/g, '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ''); return !!k(a) && k(a) === k(b); };
const dm = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');

// site — содержимое сайта (books [{title, frag, ann, tagline, litnet…}]) или null, если сайт ещё не загрузился
export function launchChecklist({ book: b, site = null, settings = {}, campaigns = [], contests = [], mailQueue = [], mailSent = [], piracy = [], today }) {
  const sb = site ? (site.books || []).find((x) => same(x.title, b.title)) : undefined;
  const pubDates = Object.values(b.pub || {}).flatMap((ch) => Object.values(ch || {}).map((p) => p?.date)).filter(Boolean).sort();
  const first = b.publishStart || pubDates[0] || '';
  const ad = campaigns.filter((k) => !k.oneOff && String(k.name || '').toLowerCase().includes(String(b.title || '').toLowerCase().slice(0, 12)) && (!k.end || k.end >= today));
  const lt = litTagInfo(settings, today);
  const mail = [...mailQueue, ...mailSent].find((m) => String(m.subject || m.title || '').toLowerCase().includes(String(b.title || '').toLowerCase().slice(0, 12)));
  const myPir = piracy.filter((f) => f.bookId === b.id && !['gone', 'skip'].includes(f.status));
  const items = [
    { k: 'plan', ok: !!first, text: 'График выкладки', hint: first ? `первая глава ${dm(first)}` : 'поставьте дату первой главы — от неё считаются письмо и реклама', to: `/book/${b.id}` },
    { k: 'link', ok: !!b.direct?.link, text: 'Ссылка на книгу на Литнете', hint: b.direct?.link ? 'указана' : 'плитка «О книге» → ссылка: нужна сайту, рекламе и претензиям пиратам', to: `/book/${b.id}` },
    { k: 'texts', ok: !!((b.svc?.annotation || b.promo?.annotation) && b.legend?.idea?.logline), text: 'Аннотация и крючок', hint: (b.svc?.annotation || b.promo?.annotation) ? (b.legend?.idea?.logline ? 'готовы' : 'нет крючка — Легенда → Идея') : 'нет аннотации — вкладка «Аннотация» в Документе', to: `/legend/${b.id}` },
    { k: 'site', ok: sb ? !sb.hidden : sb === undefined ? null : false, text: 'Страница книги на сайте', hint: sb ? (sb.hidden ? 'скрыта — включите в админке' : 'есть') : sb === undefined ? 'проверяю сайт…' : 'книги нет на сайте — добавьте в админке', to: '/site' },
    { k: 'frag', ok: sb ? !!sb.frag : null, text: 'Бесплатный фрагмент на сайте', hint: sb?.frag ? `до «${b.siteFragUpto || '…'}»` : 'плитка «Сайт» → «Бесплатный фрагмент»', to: `/book/${b.id}` },
    { k: 'mail', ok: !!mail, text: 'Письмо подписчицам о старте', hint: mail ? (mail.at ? `уйдёт ${dm(String(mail.at).slice(0, 10))}` : 'отправлено') : 'Сайт → Почта → новое письмо (обещание: только о новых романах)', to: '/site/mail' },
    { k: 'tag', ok: !!lt && !lt.late, text: 'Метка Литнета на сайте и в рекламе', hint: lt ? (lt.late ? 'истекла — обновите' : `действует до ${dm(lt.until)}`) : 'Сайт → «Новая метка»', to: '/site' },
    { k: 'ads', ok: ad.length > 0, text: 'Реклама', hint: ad.length ? ad.map((k) => k.name).slice(0, 2).join(', ') : 'кампании на эту книгу пока нет — Директ или таргетолог', href: '../direct/' },
    { k: 'spoil', ok: (b.direct?.spoilers || []).length > 0, soft: true, text: 'Что нельзя раскрывать в рекламе', hint: (b.direct?.spoilers || []).length ? 'записано' : 'Маркетинг → книга → «Для таргета»: приложение будет предупреждать', to: `/mk/${b.id}` },
    { k: 'contest', ok: contests.length > 0, soft: true, text: 'Конкурсы', hint: contests.length ? `участвует: ${contests.length}` : 'подходящих конкурсов не выбрано', to: '/marketing/contests' },
    { k: 'pir', ok: !!settings.piracy?.at && !myPir.length, soft: true, text: 'Пираты', hint: myPir.length ? `найдено копий: ${myPir.length} — отправьте претензии` : settings.piracy?.at ? 'копий нет, поиск идёт' : 'поиск ещё не запускался', to: '/marketing/piracy' },
  ];
  const main = items.filter((x) => !x.soft && x.ok !== null);
  return { items, done: main.filter((x) => x.ok).length, total: main.length, next: items.find((x) => x.ok === false && !x.soft) || null };
}
