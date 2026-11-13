// «Статистика по частям» из кабинета автора Литнета (вставка таблицы — API у Литнета нет, кабинет не скачиваем):
// строки — части (Пролог, Глава 1…), столбцы — дни «11.11», «10.11»…, «-» — нет данных. Чистые функции, тест — tests/partreads.test.js.

const DM = /^(\d{1,2})\.(\d{1,2})$/;
// «11.11» → «2026-11-11»: год — текущий, а если такая дата ещё впереди — прошлый (таблица за последние 30 дней)
export function dayOf(dm, today) {
  const m = DM.exec(String(dm).trim());
  if (!m) return null;
  const y = Number(today.slice(0, 4)), d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return d > today ? `${y - 1}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : d;
}
const cells = (line) => (line.includes('\t') ? line.split('\t') : line.trim().replace(/(\d+(?:[.,]\d+)?)\s+\((\d+)\)/g, '$1\u00a0($2)').split(/\s{2,}|\s(?=[\d.,-]+(\s|$))/)).map((x) => x.replace(/\u00a0/g, ' ').trim());

// Текст таблицы → { days: { дата: { часть: прочтения } }, ratings: { часть: { avg, n } }, parts: [порядок частей] }
export function parsePartReads(text, today) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ')).filter((l) => l.trim());
  // заголовок может растянуться на несколько строк при копировании — ищем строку с датами «дд.мм»
  const hi = lines.findIndex((l) => cells(l).filter((x) => DM.test(x)).length >= 2);
  if (hi < 0) throw Error('Не нашла строку с датами (11.11, 10.11…). Скопируйте таблицу целиком, вместе с заголовком.');
  const dates = cells(lines[hi]).filter((x) => DM.test(x)).map((x) => dayOf(x, today));
  const days = {}, ratings = {}, parts = [];
  // При копировании со страницы название части часто уезжает на отдельную строку (оно ссылкой), а оценка и числа — на следующую:
  //   «Глава 1» ⏎ «5 (2)  30  12 …». Строка, которая начинается с оценки или числа, — данные части из строки выше.
  const RATE = /^(\d+(?:[.,]\d+)?)\s*\((\d+)\)$/, NUM = /^(\d+|-|—)$/;
  const isData = (l) => { const c = cells(l); return RATE.test(c[0] || '') || (NUM.test(c[0] || '') && c.length > 1); };
  const body = lines.slice(hi + 1);
  let pending = '';
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    let c;
    if (isData(l)) { if (!pending) continue; c = [pending, ...cells(l)]; pending = ''; }
    else if (!l.includes('\t') && body[i + 1] != null && isData(body[i + 1])) { pending = l.trim(); continue; }
    else { c = cells(l); pending = ''; }
    const name = c[0];
    if (!name || !/^(пролог|глава|эпилог|часть|от автора|бонус|\S)/i.test(name) || DM.test(name) || RATE.test(name)) continue;
    const rm = RATE.exec(c[1] || '');
    let vals = c.slice(rm ? 2 : 1).filter((x) => x !== '');
    if (!rm && vals.length === dates.length + 1 && /^(-|—)$/.test(vals[0])) vals = vals.slice(1); // прочерк на месте оценки
    if (!vals.length || !vals.every((x) => NUM.test(x))) continue; // не строка таблицы
    parts.push(name);
    if (rm) ratings[name] = { avg: Number(rm[1].replace(',', '.')), n: Number(rm[2]) };
    // значения стоят под датами по порядку; если в строке столбцов меньше — последние дни не скопировались
    vals.slice(0, dates.length).forEach((v, k) => { if (/^\d+$/.test(v)) (days[dates[k]] ||= {})[name] = Number(v); });
  }
  if (!parts.length) throw Error('Не нашла строк с частями книги.');
  return { days, ratings, parts, dates };
}

// Слить с уже сохранённым: свежие дни заменяют старые (Литнет пересчитывает последние дни), порядок частей — из новой таблицы
export function mergePartReads(old = {}, fresh) {
  return { days: { ...(old.days || {}), ...fresh.days }, ratings: { ...(old.ratings || {}), ...fresh.ratings },
    parts: fresh.parts.length >= (old.parts || []).length ? fresh.parts : old.parts, at: new Date().toISOString() };
}

// Сохранённое прежним разбором, где вместо названий частей оказались оценки («4.43 (7)»), — негодно: просим вставить заново
export const readsBroken = (r) => (r?.parts || []).some((p) => /^\d+(?:[.,]\d+)?\s*\(\d+\)$/.test(p) || /^(глава|часть)$/i.test(p));

// Удержание: прочтения каждой части за период ÷ прочтения первой части
export function partRetention(r = {}, from = '', to = '9999') {
  const parts = r.parts || [], sum = Object.fromEntries(parts.map((p) => [p, 0]));
  for (const [d, row] of Object.entries(r.days || {})) if (d >= from && d <= to) for (const [p, n] of Object.entries(row)) if (p in sum) sum[p] += n;
  const first = sum[parts[0]] || 0;
  return parts.map((p, i) => ({ part: p, reads: sum[p], retention: first ? Math.round(sum[p] / first * 1000) / 10 : null, drop: i && sum[parts[i - 1]] ? Math.round((1 - sum[p] / sum[parts[i - 1]]) * 1000) / 10 : null }));
}

// Где уходят читатели (13.11.2026, её «да»): части, после которых уходит заметно больше обычного.
// Ключ части — «пролог» / «эпилог» / «глава N», чтобы совпасть с главами Документа, как бы их ни назвали на Литнете.
export const partKey = (name) => { const s = String(name || '').toLowerCase().replace(/ё/g, 'е'); if (/пролог/.test(s)) return 'пролог'; if (/эпилог/.test(s)) return 'эпилог'; const m = s.match(/глава\s*(\d+)/) || s.match(/^\s*(\d+)/); return m ? 'глава ' + Number(m[1]) : s.trim(); };
export function leakParts(r = {}, { minReads = 30, top = 3 } = {}) {
  const rows = partRetention(r), drops = rows.map((x) => x.drop).filter((x) => x != null && x > 0).sort((a, b) => a - b);
  if (drops.length < 3) return {};
  const med = drops[Math.floor(drops.length / 2)], prev = (i) => rows[i - 1]?.reads || 0;
  const out = rows.map((x, i) => ({ ...x, i })).filter((x) => x.drop != null && prev(x.i) >= minReads && x.drop >= Math.max(10, med * 2)).sort((a, b) => b.drop - a.drop).slice(0, top);
  return Object.fromEntries(out.map((x) => [partKey(x.part), { drop: x.drop, retention: x.retention, med, after: rows[x.i - 1].part }]));
}
