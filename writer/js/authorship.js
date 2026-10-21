// «Справка об авторстве» (Маркетинг → книга): откуда и как появился текст — Google Документ, история его версий
// по месяцам, главы с «отпечатками» (SHA-256 текста). Чистые функции; Word собирает publish.js (без «ё»).
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const grp = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const P = (t, x = {}) => ({ kind: 'p', runs: [{ t, ...x }] });

// отпечаток текста: SHA-256 → 64 шестнадцатеричных знака
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// по датам версий → [{ month: '2026-10', days: число дней с правками }]
export function revMonths(revs) {
  const days = {};
  for (const r of revs || []) { const d = String(r).slice(0, 10); if (d.length === 10) (days[d.slice(0, 7)] ||= new Set()).add(d); }
  return Object.keys(days).sort().map((m) => ({ month: m, days: days[m].size }));
}

// o: { title, author, file: { name, created, modified, link }, revs: [ISO], chapters: [{ title, chars, hash }], archive: { lastRun }, now: ISO }
export function authorshipParas(o) {
  const ch = o.chapters || [], total = ch.reduce((a, c) => a + (c.chars || 0), 0), revs = [...(o.revs || [])].sort();
  const out = [
    { kind: 'h', runs: [{ t: 'Справка об истории создания произведения' }] },
    P(`Произведение: «${o.title}»`),
    P(`Автор (псевдоним): ${o.author || '—'}`),
    P('Автор (ФИО): ______________________________'),
    P(`Справка сформирована: ${dmy(o.now)} в ${String(o.now || '').slice(11, 16)}`),
    P(''),
    P('Где хранится текст', { b: true }),
  ];
  if (o.file) {
    out.push(P(`Google Документ «${o.file.name}»${o.file.created ? `, создан ${dmy(o.file.created)}` : ''}${o.file.modified ? `, последнее изменение ${dmy(o.file.modified)}` : ''}.`));
    if (o.file.link) out.push(P(`Ссылка: ${o.file.link}`));
  }
  if (revs.length) out.push(P(`История версий Документа (её ведёт Google; открыть: Файл → История версий): ${revs.length} ${plural(revs.length, ['версия', 'версии', 'версий'])} с ${dmy(revs[0])} по ${dmy(revs[revs.length - 1])}.`));
  if (o.archive?.lastRun) out.push(P(`Ночные копии «Архива Мастерской» на Google Диске, последняя — ${dmy(o.archive.lastRun)}.`));
  const months = revMonths(revs);
  if (months.length) {
    out.push(P(''), P('Как шла работа над текстом — по месяцам', { b: true }));
    for (const m of months) out.push(P(`${MONTHS[+m.month.slice(5, 7) - 1]} ${m.month.slice(0, 4)} — правки в ${m.days} ${plural(m.days, ['день', 'дня', 'дней'])}`));
  }
  out.push(P(''), P('Главы на дату справки', { b: true }));
  for (const c of ch) out.push(P(`${c.title} — ${grp(c.chars)} зн.`), P(`отпечаток: ${c.hash}`, { z: 9 }));
  out.push(P(`Всего: ${ch.length} ${plural(ch.length, ['глава', 'главы', 'глав'])}, ${grp(total)} знаков с пробелами (${(total / 40000).toFixed(1).replace('.', ',')} а.л.).`));
  out.push(P(''), P('Что такое отпечаток', { b: true }),
    P('Отпечаток — контрольная сумма SHA-256 текста главы. Любое изменение текста, даже одна запятая, даёт другой отпечаток. Совпадение отпечатка показывает, что текст главы тот же, что на дату справки.'));
  return out;
}
