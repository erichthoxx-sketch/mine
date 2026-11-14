// Быстрое дело строкой (13.11.2026, её просьба: «идеальный планер — минималистичный, максимально удобный»):
// дата берётся из слов в начале или конце строки и убирается из текста. Чистая функция; тест — tests/quickadd.test.js.
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DOWS = [['вс', 'воскрес'], ['пн', 'понедел'], ['вт', 'вторн'], ['ср', 'сред'], ['чт', 'четверг'], ['пт', 'пятниц'], ['сб', 'суббот']];
const MON = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
export function parseQuick(raw, today) {
  let text = String(raw || '').replace(/\s+/g, ' ').trim(), date = null;
  const take = (re, fn) => { if (date) return; const m = text.match(re); if (!m) return; const d = fn(m); if (!d) return; date = d; text = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,.;—-]+|[\s,.;—-]+$/g, '').trim(); };
  const edge = (core) => [new RegExp('^(?:на\\s+)?' + core + '(?![а-яё])[\\s,.:—-]*', 'i'), new RegExp('[\\s,]+(?:на\\s+)?' + core + '\\.?$', 'i')];
  const both = (core, fn) => { for (const re of edge(core)) take(re, fn); };
  both('сегодня', () => today);
  both('послезавтра', () => add(today, 2));
  both('завтра', () => add(today, 1));
  both('через\\s+(\\d{1,2})\\s+(?:дн[яейь]|день)', (m) => add(today, +m[1]));
  both('через\\s+неделю', () => add(today, 7));
  // дни недели: «в пятницу», «пт» — ближайший впереди (сегодняшний — через неделю)
  both('(?:в\\s+|во\\s+)?(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)', (m) => {
    const w = m[1].toLowerCase(), i = DOWS.findIndex(([s, l]) => w === s || w.startsWith(l)); if (i < 0) return null;
    const cur = new Date(today + 'T00:00:00Z').getUTCDay(); return add(today, ((i - cur + 7) % 7) || 7); });
  // «20.11», «20.11.2026», «20 ноября»
  const ymd = (dd, mm, yy) => { let y = yy ? (+yy < 100 ? 2000 + +yy : +yy) : +today.slice(0, 4); let s = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(s)) || +mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null; if (!yy && s < today) s = `${y + 1}${s.slice(4)}`; return s; };
  both('(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?', (m) => ymd(m[1], m[2], m[3]));
  both('(\\d{1,2})\\s+([а-яё]+)', (m) => { const i = MON.findIndex((p) => m[2].toLowerCase().startsWith(p) && (p !== 'ма' || /^ма[яй]/i.test(m[2]))); return i < 0 ? null : ymd(m[1], i + 1); });
  return { text, date };
}
