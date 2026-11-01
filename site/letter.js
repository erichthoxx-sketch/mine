// Письмо подписчицам — вёрстка в стиле сайта (бумага и графит, тонкие линии), таблицами и встроенными стилями:
// так его одинаково показывают Яндекс Почта, Mail.ru, Gmail и телефоны. Шрифты сайта (Oranienbaum, Cormorant, Golos Text)
// подгружаются там, где почта это умеет (Apple Mail, iPhone), в остальных — похожие обычные (Georgia, Arial).
// {unsub} — ссылка «Отписаться», её подставляет сервис писем своей для каждой читательницы. {name} — имя читательницы.
//
// Что можно менять (админка → «Письма», или нейросетью — «Скопировать для нейросети»):
//   письмо (черновик): subject, preheader, eyebrow, title, text, quote, btn, url, sign, book
//   оформление (content.letter, общее для всех писем): LETTER_DEFAULTS ниже
// В тексте: *курсив*, **жирный**, [слова](https://ссылка); пустая строка — новый абзац.

export const LETTER_DEFAULTS = {
  bear: true, // медведь в кружке сверху (site/mail-bear.jpg)
  sign: '', // подпись в конце каждого письма (курсивом), например имя
  footer: 'Вы подписались на lanafreitag.ru — я пишу только когда выходит новый роман.',
  links: true, // внизу — ссылки на сайт и Telegram
  paper: '#f6f6f4', // фон письма
  ink: '#141517', // текст и кнопка
  tint: '', // подложка под обложкой; пусто — цвет акцента сайта
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s) => String(s ?? '').replace(/\*\*?/g, '').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)');
const paras = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : d);

const F_HEAD = "Oranienbaum,'Times New Roman',Times,serif";
const F_ACC = "Cormorant,'Cormorant Garamond',Georgia,'Times New Roman',serif";
const F_TEXT = "'Golos Text',Arial,Helvetica,sans-serif";

// *курсив* в заголовке — тонкий Cormorant, как на сайте; в тексте — обычный курсив, **жирный**, ссылки
const headIt = (s) => esc(s).replace(/\*([^*\n]+)\*/g, `<span style="font-family:${F_ACC};font-style:italic;font-weight:400;text-transform:none;letter-spacing:0">$1</span>`);
function rich(s, ink) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" style="color:${ink};text-decoration:underline">${t}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
}

// author — имя; title — заголовок; eyebrow — строка над заголовком; text — абзацы; quote — цитата из книги; sign — подпись
// book — { title, cover (адрес картинки), url, series, seriesNo }; btn — текст кнопки; url — куда ведёт кнопка
// design — оформление (LETTER_DEFAULTS); accent — цвет акцента сайта; tg — ссылка на Telegram
export function letterHtml(o = {}) {
  const { author = 'Лана Фрейтаг', title = '', eyebrow = '', text = '', quote = '', book = null, btn = 'Читать', preheader = '',
    site = 'https://lanafreitag.ru/', accent = '', tg = '', bearUrl = '' } = o;
  const D = { ...LETTER_DEFAULTS, ...(o.design || {}) };
  const sign = String(o.sign || D.sign || '').trim();
  const paper = hex(D.paper, LETTER_DEFAULTS.paper), ink = hex(D.ink, LETTER_DEFAULTS.ink);
  const tint = hex(D.tint, hex(accent, '#e4e4df'));
  const soft = '#5c6167', faint = '#979ca1', line = 'rgba(20,21,23,.12)';
  const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = o.url || book?.url || site;
  const series = book?.series ? `${plain(book.series)}${book.seriesNo ? ` · книга ${book.seriesNo}` : ''}` : '';
  const pad = 'padding-left:40px;padding-right:40px';
  const row = (inner, st = '') => `<tr><td class="px" style="${pad};${st}">${inner}</td></tr>`;

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(plain(title))}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,400;1,500&family=Golos+Text:wght@400;500&family=Oranienbaum&display=swap" rel="stylesheet">
<style>body{margin:0;padding:0}a{color:inherit}@media (max-width:520px){.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:28px!important}.cv{width:180px!important}}</style></head>
<body style="margin:0;padding:0;background:${paper};color:${ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(plain(preheader))}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:36px 0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
${D.bear ? row(`<img src="${esc(bearUrl || site + 'mail-bear.jpg?1')}" width="72" height="72" alt="" style="display:block;margin:0 auto;width:72px;height:72px;border:0;border-radius:50%">`, 'text-align:center;padding-bottom:16px') : ''}
${row(`<a href="${esc(site)}" style="color:${ink};text-decoration:none;font-family:${F_TEXT};font-size:12px;letter-spacing:.34em;text-transform:uppercase">${esc(author)}</a>`, 'text-align:center')}
${row(`<div style="width:40px;height:1px;background:${ink};margin:18px auto 0;line-height:1px;font-size:1px">&nbsp;</div>`)}
${book?.cover ? row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${tint};padding:36px 20px">
  <a href="${esc(url)}"><img class="cv" src="${esc(book.cover)}" width="210" alt="${esc(plain(book.title))}" style="display:block;width:210px;max-width:100%;height:auto;border:0;box-shadow:0 18px 34px -16px rgba(20,21,23,.55)"></a></td></tr></table>`, 'padding-top:30px') : ''}
${eyebrow ? row(`<span style="font-family:${F_TEXT};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${soft}">— ${esc(plain(eyebrow))} —</span>`, 'text-align:center;padding-top:34px') : ''}
${title ? row(`<div class="h1" style="font-family:${F_HEAD};font-size:34px;line-height:1.12;text-transform:uppercase;letter-spacing:.01em;color:${ink}">${headIt(title)}</div>`, `text-align:center;padding-top:${eyebrow ? 12 : 34}px`) : ''}
${series ? row(`<span style="font-family:${F_ACC};font-style:italic;font-size:19px;color:${soft}">${esc(series)}</span>`, 'text-align:center;padding-top:8px') : ''}
${paras(text).map((p, i) => row(`<div style="font-family:${F_TEXT};font-size:16px;line-height:1.7;color:#2a2c30">${rich(p, ink)}</div>`, `padding-top:${i ? 14 : 26}px`)).join('')}
${quote ? row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${line};border-bottom:1px solid ${line};padding:24px 8px;text-align:center;font-family:${F_ACC};font-style:italic;font-size:22px;line-height:1.45;color:${ink}">${rich(paras(quote).join('\n'), ink)}</td></tr></table>`, 'padding-top:30px') : ''}
${btn ? row(`<a href="${esc(url)}" style="display:inline-block;background:${ink};color:${paper};text-decoration:none;font-family:${F_TEXT};font-size:12px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;padding:17px 34px">${esc(btn)}</a>`, 'text-align:center;padding-top:32px') : ''}
${sign ? row(`<span style="font-family:${F_ACC};font-style:italic;font-size:24px;color:${ink}">${esc(sign)}</span>`, 'padding-top:34px') : ''}
${row(`<div style="height:1px;background:${line};line-height:1px;font-size:1px;margin-top:40px">&nbsp;</div>`)}
${D.links ? row(`<a href="${esc(site)}" style="color:${soft};text-decoration:none">${esc(host)}</a>${tg ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${esc(tg)}" style="color:${soft};text-decoration:none">Telegram</a>` : ''}`, `text-align:center;padding-top:22px;font-family:${F_TEXT};font-size:11px;letter-spacing:.18em;text-transform:uppercase`) : ''}
${row(`${D.footer ? `${esc(D.footer)}<br>` : ''}<a href="{unsub}" style="color:${faint}">Отписаться</a>`, `text-align:center;padding-top:14px;font-family:${F_TEXT};font-size:12px;line-height:1.6;color:${faint}`)}
</table></td></tr></table></body></html>`;
  const txt = [author.toUpperCase(), '', eyebrow ? plain(eyebrow) : '', plain(title), series, '', ...paras(text).map(plain), '',
    quote ? `«${plain(quote)}»` : '', '', btn ? `${btn}: ${url}` : '', '', sign, '', D.footer || '', `Отписаться: {unsub}`]
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html, text: txt };
}
