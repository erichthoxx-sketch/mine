// «Защита от пиратов» (11.11.2026, владелица: «автоматический и бесплатный поиск сливов, сразу почта пиратов, досудебка»).
// Чистые функции: что искать, как разобрать выдачу поисковика, что считать пиратской копией, чьи почты брать,
// тексты писем (сайту → хостингу → поисковикам) и какое действие следующее. Сеть — в piracyscan.js.
// Юридические ссылки в письмах — ГК РФ ст. 1229, 1252, 1253.1, 1270, 1301 и ст. 15.7 закона 149-ФЗ. Это шаблон, а не консультация юриста.
import { addDays } from '../../js/calc.js';

// свои и нейтральные сайты: магазины, соцсети, каталоги, сами поисковики — не пираты
export const LEGIT = ['litnet.com', 'litres.ru', 'litgorod.ru', 'litmarket.ru', 'lanafreitag.ru', 'author.today', 'bookriver.ru', 'prodaman.ru', 'neobook.org', 'ridero.ru', 'mybook.ru',
  'bookmate.ru', 'bookmate.com', 'livelib.ru', 'fantlab.ru', 'goodreads.com', 'labirint.ru', 'ozon.ru', 'wildberries.ru', 'chitai-gorod.ru', 'book24.ru', 'storytel.com', 'zvukislov.ru',
  't.me', 'telegram.org', 'vk.com', 'vk.ru', 'ok.ru', 'dzen.ru', 'youtube.com', 'youtu.be', 'pinterest.com', 'pinterest.ru', 'instagram.com', 'facebook.com', 'tiktok.com', 'x.com', 'twitter.com',
  'yandex.ru', 'ya.ru', 'google.com', 'google.ru', 'bing.com', 'microsoft.com', 'duckduckgo.com', 'mojeek.com', 'startpage.com', 'brave.com', 'jina.ai', 'wikipedia.org', 'github.io', 'github.com', 'apple.com', 'amazon.com', 'w3.org'];
// известные пиратские библиотеки — подсказка (совпадение по началу имени сайта)
export const PIRATE_HINT = /flibusta|coollib|litmir|readli|libking|topliba|knigogo|bookscafe|rulit|libcat|loveread|librebook|mir-?knig|litportal|royallib|ladylib|avidreaders|4italka|knizhnik|bookzip|e-reading|booksee|fb2|epub|litlife|aldebaran|bookfor|ruslib|libfox|libs\.ru|knigi-?online|romanbook|bookinbook|iknigi|kniga-?online|profilib|lit-?era|mybrary|chitat|read-?book|online-?knigi|booksonline|knigavuhe|akniga/i;
export const PIRATE_WORDS = /скачать|fb2|epub|бесплатно|читать\s+(?:книгу|онлайн|полностью)|полностью|без регистрации|торрент|полная версия/i;

export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
export const plainTitle = (t) => String(t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
export function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
export const isLegit = (host, extra = []) => [...LEGIT, ...extra].some((d) => host === d || host.endsWith('.' + d));

// два запроса на книгу: «читать онлайн бесплатно» и «скачать fb2» — так находятся и читалки, и файлы
export function searchQueries(title, author = '') {
  const t = plainTitle(title), a = String(author || '').trim().split(/\s+/).pop() || '';
  return [`"${t}" ${a} читать онлайн бесплатно`, `"${t}" ${a} скачать fb2`].map((q) => q.replace(/\s+/g, ' ').trim());
}
// поисковики (бесплатно, без ключей) — по очереди, пока один не ответит
export const ENGINES = [
  ['Startpage', (q) => 'https://www.startpage.com/do/search?q=' + encodeURIComponent(q)],
  ['DuckDuckGo', (q) => 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q)],
  ['Brave', (q) => 'https://search.brave.com/search?q=' + encodeURIComponent(q)],
];

// ссылка из выдачи: поисковики заворачивают адрес (duckduckgo.com/l/?uddg=…, bing.com/ck/a?…&u=a1<base64>) — разворачиваем
export function unwrap(url) {
  let u = String(url || '').replace(/&amp;/g, '&').trim();
  if (u.startsWith('//')) u = 'https:' + u;
  try {
    const x = new URL(u), h = x.hostname;
    if (/duckduckgo\.com$/.test(h) && x.searchParams.get('uddg')) return x.searchParams.get('uddg');
    if (/bing\.com$/.test(h) && x.searchParams.get('u')) {
      const b = x.searchParams.get('u').replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/');
      try { const d = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary'); if (/^https?:\/\//.test(d)) return d; } catch { /* не base64 */ }
    }
    return /^https?:$/.test(x.protocol) ? x.href : '';
  } catch { return ''; }
}
// Выдача → [{ url, host, title, snip }]: понимает и разметку «[заголовок](ссылка)», и HTML (<a href>)
export function parseResults(text) {
  const src = String(text || ''), out = [], seen = new Set();
  const push = (raw, title, at) => {
    const url = unwrap(raw), host = hostOf(url);
    if (!host) return;
    const t0 = String(title || '').replace(/<[^>]+>/g, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(url)) { const o = out.find((x) => x.url === url); if (o && t0.length > o.title.length && !/^!\[|^https?:/.test(t0)) o.title = t0; return; }
    seen.add(url);
    const near = src.slice(Math.max(0, at - 120), at + 500).replace(/<[^>]+>/g, ' ').replace(/\]\([^)]*\)/g, ' ').replace(/[[\]*_#>]/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ url, host, title: String(title || '').replace(/<[^>]+>/g, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200), snip: near.slice(0, 500) });
  };
  for (const m of src.matchAll(/\[([^\]]{0,300})\]\(\s*<?((?:https?:)?\/\/[^)\s>]+)>?[^)]*\)/g)) push(m[2], m[1], m.index);
  for (const m of src.matchAll(/<a\b[^>]*\bhref="((?:https?:)?\/\/[^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) push(m[1], m[2], m.index);
  return out;
}
// Пиратская ли это копия именно этой книги: чужой сайт + название книги в заголовке или рядом
export function judge(r, title, author = '', ignore = []) {
  if (!r?.host || isLegit(r.host, ignore)) return null;
  const t = norm(plainTitle(title)), hay = norm(r.title + ' ' + r.snip + ' ' + decodeURIComponentSafe(r.url));
  if (!t || !hay.includes(t)) return null;
  const a = norm(String(author).split(/\s+/).pop() || '');
  const known = PIRATE_HINT.test(r.host), words = PIRATE_WORDS.test(r.title + ' ' + r.snip), byAuthor = !!a && hay.includes(a);
  // название есть, а ни фамилии, ни «читать/скачать бесплатно» — это не копия книги (обзор, упоминание)
  if (!byAuthor && !words) return null;
  // sure — уверенно пират; без фамилии автора может оказаться одноимённая чужая книга — «проверьте»
  return { ...r, sure: byAuthor || known, why: [known ? 'известная пиратская библиотека' : '', words ? 'предлагает читать или скачать бесплатно' : '', byAuthor ? 'автор указан' : 'автор не указан — проверьте, ваша ли книга'].filter(Boolean).join(' · ') };
}
function decodeURIComponentSafe(u) { try { return decodeURIComponent(u); } catch { return u; } }
export const findId = (url) => 'p' + [...String(url)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7).toString(36).replace('-', 'm');

// ---------- чьи почты ----------
const BAD_MAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|example\.|wixpress|@\dx|noreply|no-reply|domain\.com|email\.com/i;
export function emailsIn(text) {
  const s = String(text || '').replace(/\s*(?:\[at\]|\(at\)|\(собака\)|\[собака\])\s*/gi, '@').replace(/\s*(?:\[dot\]|\(dot\)|\(точка\))\s*/gi, '.');
  return [...new Set((s.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) || []).map((x) => x.toLowerCase().replace(/\.$/, '')).filter((x) => !BAD_MAIL.test(x) && x.length < 80))];
}
// RDAP (открытые сведения о домене или адресе сервера): название, почта для жалоб
export function rdapInfo(j) {
  const out = { name: '', emails: [], abuse: [] };
  const walk = (ents = [], depth = 0) => {
    for (const e of ents) {
      const v = e.vcardArray?.[1] || [], roles = e.roles || [];
      const fn = v.find((x) => x[0] === 'fn')?.[3] || '', mails = v.filter((x) => x[0] === 'email').map((x) => String(x[3] || '').toLowerCase()).filter(Boolean);
      if (roles.includes('registrar') && fn && !out.name) out.name = fn;
      if (roles.includes('abuse')) out.abuse.push(...mails); else out.emails.push(...mails);
      if (e.entities && depth < 3) walk(e.entities, depth + 1);
    }
  };
  walk(j?.entities);
  if (!out.name) out.name = j?.name || '';
  out.abuse = [...new Set(out.abuse)]; out.emails = [...new Set(out.emails.filter((m) => !out.abuse.includes(m)))];
  return out;
}
// Cloudflare прячет настоящий хостинг и почту не читает — у него только форма жалобы
export const CF_FORM = 'https://abuse.cloudflare.com/';
export const isCloudflare = (name = '', mails = []) => /cloudflare/i.test(name) || mails.some((m) => /cloudflare/i.test(m));
// страницы сайта, где обычно лежит почта для правообладателей
export const CONTACT_PATHS = ['', '/abuse', '/dmca', '/copyright', '/pravoobladatelyam', '/contacts', '/contact', '/feedback'];

// ---------- письма ----------
const me = (m = {}) => ({ name: String(m.name || '').trim() || '[ФИО по паспорту]', email: String(m.email || '').trim() || '[ваша почта]', pen: String(m.pen || '').trim() });
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const proof = (book) => (book?.link ? `Произведение опубликовано мной на портале Литнет: ${book.link}` : 'Произведение опубликовано мной на портале Литнет.');
// 1. Сайту — сразу досудебная претензия (11.11.2026, владелица: «намного жёстче — сразу досудебную претензию и без моих ФИО»).
// Подпись — псевдоним: автор вправе выступать под вымышленным именем (ст. 1265 ГК РФ), а автором считается тот, кто указан на произведении (ст. 1257 ГК РФ).
const pen = (m = {}) => String(m.pen || '').trim() || 'Автор';
const mail = (m = {}) => String(m.email || '').trim();
export function letterSite(f, book, m, today) {
  const w = pen(m), t = plainTitle(book?.title || f.title), e = mail(m);
  return { subject: `ДОСУДЕБНАЯ ПРЕТЕНЗИЯ: незаконное размещение произведения «${t}» на ${f.host}`, body: `Владельцу и администрации сайта ${f.host}

ДОСУДЕБНАЯ ПРЕТЕНЗИЯ
о нарушении исключительного права на произведение

Я, ${w}, — автор и правообладатель литературного произведения «${t}». Произведение обнародовано под этим именем (ст. 1257, 1265 ГК РФ).
${proof(book)}

${dmy(today)} зафиксировано, что на вашем сайте произведение размещено и доводится до всеобщего сведения без моего согласия:
${f.url}
Страница сохранена как доказательство.

Разрешения на использование произведения я не давала никому. Ваши действия нарушают моё исключительное право (ст. 1229, 1270 ГК РФ) и влекут гражданскую, административную (ст. 7.12 КоАП РФ) и уголовную (ст. 146 УК РФ) ответственность.

ТРЕБУЮ:
1. В течение 24 часов с момента получения претензии удалить произведение и все его копии, включая файлы для скачивания (ст. 15.7 Федерального закона № 149-ФЗ, ст. 1253.1 ГК РФ).
2. Не размещать произведение впредь.
3. Сообщить об исполнении ответом на это письмо.

Если требования не будут исполнены в срок, без дополнительного предупреждения:
— направляю жалобы хостинг-провайдеру, регистратору домена и в поисковые системы об удалении сайта из выдачи;
— обращаюсь в суд с требованием о блокировке сайта (ст. 15.2 Федерального закона № 149-ФЗ; при повторном нарушении блокировка постоянная — ст. 15.6) и о взыскании компенсации от 10 000 до 5 000 000 рублей за каждое нарушение (ст. 1301 ГК РФ), а также судебных расходов;
— подаю заявление в правоохранительные органы.

Претензия является соблюдением досудебного порядка. Удаление после обращения в суд от ответственности не освобождает.

${w}, автор и правообладатель${e ? '\n' + e : ''}` };
}
// 2. Хостингу / регистратору: сайт не исполнил претензию. Для зарубежных — часть по-английски
export function letterHost(f, book, m, today) {
  const w = pen(m), t = plainTitle(book?.title || f.title), e = mail(m);
  return { subject: `Abuse / copyright infringement: ${f.host}`, body: `Здравствуйте.

Сайт ${f.host}, размещённый на ваших мощностях, нарушает авторские права: на нём без согласия правообладателя размещено литературное произведение «${t}» (автор — ${w}).
Страница с нарушением: ${f.url}
${proof(book)}

${f.sentAt ? `${dmy(f.sentAt)} владельцу сайта направлена досудебная претензия — она не исполнена, произведение не удалено.` : 'Работающих контактов владельца на сайте нет.'}

Как информационный посредник вы обязаны принять меры по заявлению правообладателя (ст. 1253.1 ГК РФ). Прошу в течение 3 рабочих дней удалить страницу или ограничить доступ к ней. Иначе требования о прекращении нарушения и компенсации (ст. 1301 ГК РФ) будут заявлены в суде и к вам.

—
Hello. The website ${f.host} hosted on your network distributes the copyrighted book "${t}" by ${w} without the author's permission.
Infringing URL: ${f.url}
${book?.link ? `Original (authorised) publication: ${book.link}\n` : ''}I am the author and the sole copyright holder. I have a good faith belief that this use is not authorised by the copyright owner, its agent, or the law. The information in this notice is accurate. Please remove or disable access to the infringing material.

${w}, author and copyright holder${e ? '\n' + e : ''}
${dmy(today)}` };
}
// 3. Официальное заявление по ст. 15.7 закона 149-ФЗ (закон требует паспортные данные — владелица вписывает их сама перед отправкой)
export function letterFormal(f, book, m, today) {
  const w = me(m), t = plainTitle(book?.title || f.title);
  return { subject: `Заявление правообладателя о нарушении авторских прав (ст. 15.7 закона № 149-ФЗ) — ${f.host}`, body: `Владельцу сайта ${f.host}

ЗАЯВЛЕНИЕ
о нарушении авторских прав (ст. 15.7 Федерального закона от 27.07.2006 № 149-ФЗ)

1. Правообладатель: ${w.name}, паспорт [серия, номер, кем и когда выдан], почта: ${w.email}, телефон: [телефон].
2. Объект авторских прав: литературное произведение «${t}»${w.pen ? `, опубликовано под псевдонимом ${w.pen}` : ''}. ${proof(book)}
3. Адрес страницы, где произведение размещено без моего разрешения: ${f.url}
4. Исключительное право на произведение принадлежит мне как автору (ст. 1228, 1229, 1255 ГК РФ).
5. Разрешения на размещение произведения на сайте ${f.host} я не давала.
6. Даю согласие на обработку моих персональных данных для рассмотрения этого заявления.

Требую в течение 24 часов с момента получения заявления удалить произведение с сайта.

${dmy(today)}
${w.name}` };
}
export const mailto = (to, l) => `mailto:${encodeURIComponent([].concat(to).join(','))}?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
// куда жаловаться, чтобы страницу убрали из поиска
export const SEARCH_FORMS = [['Google — убрать из поиска', 'https://reportcontent.google.com/forms/dmca_search'], ['Яндекс — сообщить о нарушении', 'https://yandex.ru/support/abuse/ru/troubleshooting/copyright']];
export const archiveUrl = (url) => 'https://web.archive.org/save/' + url;

// ---------- что делать дальше ----------
export const WAIT_SITE = 3, WAIT_HOST = 5; // дней ждём ответа сайта и хостинга
// status: new → sent (написала сайту) → host (написала хостингу) → search (подала в поисковики) | gone (удалено) | skip (не пират)
export function nextStep(f, today) {
  if (f.status === 'gone' || f.status === 'skip') return null;
  if (f.goneMaybe && f.status !== 'new') return { k: 'confirm', text: 'Похоже, удалили — проверьте и отметьте', due: today };
  if (!f.status || f.status === 'new') return { k: 'site', text: 'Написать сайту', due: (f.foundAt || today).slice(0, 10) };
  if (f.status === 'sent') { const d = addDays((f.sentAt || today).slice(0, 10), WAIT_SITE); return { k: 'host', text: d <= today ? 'Сайт не ответил — написать хостингу' : `Ждём ответа сайта до ${dmy(d).slice(0, 5)}`, due: d, wait: d > today }; }
  if (f.status === 'host') { const d = addDays((f.hostAt || today).slice(0, 10), WAIT_HOST); return { k: 'search', text: d <= today ? 'Хостинг не ответил — убрать из поиска' : `Ждём хостинг до ${dmy(d).slice(0, 5)}`, due: d, wait: d > today }; }
  return { k: 'done', text: 'Жалобы поданы — ждём', due: '', wait: true };
}
// Дела в Планер: одно на «новые копии», по одному на «сайт не ответил»
export function piracyTodos(finds = [], today) {
  const live = finds.filter((f) => f.status !== 'gone' && f.status !== 'skip'), out = [];
  const fresh = live.filter((f) => !f.status || f.status === 'new');
  if (fresh.length) out.push({ id: 'piracy-new', date: today, text: `Пираты: ${fresh.length} ${fresh.length === 1 ? 'новая копия' : fresh.length < 5 ? 'новые копии' : 'новых копий'} — отправить письма`, sub: [...new Set(fresh.map((f) => f.host))].slice(0, 4).join(', ') });
  for (const f of live) {
    const s = nextStep(f, today);
    if (s && !s.wait && (s.k === 'host' || s.k === 'search' || s.k === 'confirm')) out.push({ id: 'piracy-' + f.id + '-' + s.k, date: today, text: `Пираты, ${f.host}: ${s.text.charAt(0).toLowerCase() + s.text.slice(1)}`, sub: plainTitle(f.title || '') });
  }
  return out.slice(0, 6);
}
export function piracySummary(finds = []) {
  const n = (k) => finds.filter((f) => (f.status || 'new') === k).length;
  return { fresh: n('new'), work: n('sent') + n('host') + n('search'), gone: n('gone'), all: finds.filter((f) => f.status !== 'skip').length };
}
