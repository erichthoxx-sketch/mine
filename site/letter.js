// Письмо подписчицам — вёрстка в стиле сайта (бумага и графит), таблицами и встроенными стилями: так его одинаково
// показывают Яндекс Почта, Mail.ru, Gmail и телефоны. {unsub} — ссылка «Отписаться», её подставляет сервис писем
// своей для каждой читательницы. Общий для админки (предпросмотр, отправка) и тестов.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const it = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
const plain = (s) => String(s ?? '').replace(/\*/g, '');
const paras = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

// title — заголовок письма; text — абзацы (пустая строка между ними); book — { title, cover (адрес картинки), url }; btn — текст кнопки
export function letterHtml({ author = 'Лана Фрейтаг', title = '', text = '', book = null, btn = 'Читать', site = 'https://lanafreitag.ru/' } = {}) {
  const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = book?.url || site;
  const F = "font-family:Georgia,'Times New Roman',serif", A = 'font-family:Arial,Helvetica,sans-serif';
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(plain(title))}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4;color:#141517">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e0">
<tr><td style="padding:30px 36px 0;text-align:center;${A};font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#5c6167">${esc(author)}</td></tr>
${book?.cover ? `<tr><td align="center" style="padding:28px 36px 0"><a href="${esc(url)}"><img src="${esc(book.cover)}" width="220" alt="${esc(plain(book.title))}" style="display:block;width:220px;max-width:100%;height:auto;border:0;box-shadow:0 12px 28px -14px rgba(20,21,23,.5)"></a></td></tr>` : ''}
${title ? `<tr><td style="padding:28px 36px 0;text-align:center;${F};font-size:28px;line-height:1.2;text-transform:uppercase;letter-spacing:.02em">${it(title)}</td></tr>` : ''}
${paras(text).map((p, i) => `<tr><td style="padding:${i ? 14 : 22}px 36px 0;${A};font-size:16px;line-height:1.65;color:#2a2c30">${it(p).replace(/\n/g, '<br>')}</td></tr>`).join('')}
${btn ? `<tr><td align="center" style="padding:30px 36px 6px"><a href="${esc(url)}" style="display:inline-block;background:#141517;color:#ffffff;text-decoration:none;${A};font-size:12px;letter-spacing:.18em;text-transform:uppercase;padding:16px 30px">${esc(btn)}</a></td></tr>` : ''}
<tr><td style="padding:30px 36px 32px;text-align:center;${A};font-size:12px;line-height:1.6;color:#979ca1">Вы подписались на ${esc(host)} — я пишу только когда выходит новый роман.<br><a href="{unsub}" style="color:#979ca1">Отписаться</a></td></tr>
</table></td></tr></table></body></html>`;
  const txt = [plain(title), '', ...paras(text).map(plain), '', btn ? `${btn}: ${url}` : '', '', `Отписаться: {unsub}`].join('\n');
  return { html, text: txt };
}
