// Итог месяца: чистые расчёты и текст письма (отправка — monthmail.js). Тест — tests/monthmail.test.js
const R = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const prevMonth = (today) => { const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Чистая сводка за месяц «ГГГГ-ММ»
export function monthSummary(data = {}, month) {
  const inM = (d) => String(d || '').slice(0, 7) === month, before = prevMonth(month + '-01');
  const roy = (m) => (data.sales || []).reduce((a, x) => (String(x.date || '').slice(0, 7) === m ? a + (x.royalty || 0) : a), 0);
  const income = roy(month), incomePrev = roy(before);
  let chars = 0, chapters = 0;
  for (const b of data.w_books || []) {
    const h = Object.entries(b.history || {}).sort(([a], [c]) => a.localeCompare(c));
    const at = (lim) => { let v = null; for (const [d, n] of h) if (d <= lim) v = n; return v; };
    const end = at(month + '-31'), start = at(before + '-31');
    if (end != null) chars += Math.max(0, end - (start ?? (h.length && h[0][0] < month ? h[0][1] : end)));
    for (const ch of Object.values(b.pub || {})) { const ds = Object.values(ch || {}).filter((p) => p?.date && !p.planned).map((p) => p.date).sort(); if (ds.length && inM(ds[0])) chapters++; }
  }
  const spend = (data.reports || []).reduce((a, r) => (inM(r.start) ? a + (r.spend || 0) : a), 0);
  const found = (data.w_piracy || []).filter((f) => inM(f.foundAt) && f.status !== 'skip').length, gone = (data.w_piracy || []).filter((f) => inM(f.goneAt)).length;
  return { month, income, incomePrev, chars, chapters, spend, found, gone };
}
export function monthLetter(s) {
  const name = MONTHS[Number(s.month.slice(5, 7)) - 1], ch = s.incomePrev ? ` (${s.income >= s.incomePrev ? '+' : '−'}${Math.round(Math.abs(s.income - s.incomePrev) / s.incomePrev * 100)} % к прошлому месяцу)` : '';
  const lines = [
    `Написано: ${R(s.chars)} знаков (${(s.chars / 40000).toFixed(1).replace('.', ',')} а.л.)`,
    `Вышло глав: ${s.chapters}`,
    `Роялти: ${R(s.income)} ₽${ch}`,
    s.spend ? `Реклама: ${R(s.spend)} ₽${s.income ? ` — ${Math.round(s.spend / s.income * 100)} % от роялти` : ''}` : '',
    s.found || s.gone ? `Пираты: найдено копий ${s.found}, удалено ${s.gone}` : '',
  ].filter(Boolean);
  return { subject: `Итог месяца: ${name} ${s.month.slice(0, 4)}`, text: `Ваш ${name} в цифрах:\n\n${lines.map((l) => '• ' + l).join('\n')}\n\nПодробности — в Мастерской и Доходах.` };
}

