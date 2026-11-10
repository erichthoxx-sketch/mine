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
const cells = (line) => (line.includes('\t') ? line.split('\t') : line.trim().split(/\s{2,}|\s(?=[\d-]+(\s|$))/)).map((x) => x.trim());

// Текст таблицы → { days: { дата: { часть: прочтения } }, ratings: { часть: { avg, n } }, parts: [порядок частей] }
export function parsePartReads(text, today) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ')).filter((l) => l.trim());
  // заголовок может растянуться на несколько строк при копировании — ищем строку с датами «дд.мм»
  const hi = lines.findIndex((l) => cells(l).filter((x) => DM.test(x)).length >= 2);
  if (hi < 0) throw Error('Не нашла строку с датами (11.11, 10.11…). Скопируйте таблицу целиком, вместе с заголовком.');
  const dates = cells(lines[hi]).filter((x) => DM.test(x)).map((x) => dayOf(x, today));
  const days = {}, ratings = {}, parts = [];
  for (const l of lines.slice(hi + 1)) {
    const c = cells(l);
    const name = c[0];
    if (!name || !/^(пролог|глава|эпилог|часть|от автора|бонус|\S)/i.test(name) || DM.test(name)) continue;
    const rm = /^(\d+[.,]\d+)\s*\((\d+)\)$/.exec(c[1] || '');
    const vals = c.slice(rm ? 2 : 1).filter((x) => x !== '');
    if (!vals.length || !vals.every((x) => /^(\d+|-|—)$/.test(x))) continue; // не строка таблицы
    parts.push(name);
    if (rm) ratings[name] = { avg: Number(rm[1].replace(',', '.')), n: Number(rm[2]) };
    // значения стоят под датами по порядку; если в строке столбцов меньше — последние дни не скопировались
    vals.slice(0, dates.length).forEach((v, i) => { if (/^\d+$/.test(v)) (days[dates[i]] ||= {})[name] = Number(v); });
  }
  if (!parts.length) throw Error('Не нашла строк с частями книги.');
  return { days, ratings, parts, dates };
}

// Слить с уже сохранённым: свежие дни заменяют старые (Литнет пересчитывает последние дни), порядок частей — из новой таблицы
export function mergePartReads(old = {}, fresh) {
  return { days: { ...(old.days || {}), ...fresh.days }, ratings: { ...(old.ratings || {}), ...fresh.ratings },
    parts: fresh.parts.length >= (old.parts || []).length ? fresh.parts : old.parts, at: new Date().toISOString() };
}

// Удержание: прочтения каждой части за период ÷ прочтения первой части
export function partRetention(r = {}, from = '', to = '9999') {
  const parts = r.parts || [], sum = Object.fromEntries(parts.map((p) => [p, 0]));
  for (const [d, row] of Object.entries(r.days || {})) if (d >= from && d <= to) for (const [p, n] of Object.entries(row)) if (p in sum) sum[p] += n;
  const first = sum[parts[0]] || 0;
  return parts.map((p, i) => ({ part: p, reads: sum[p], retention: first ? Math.round(sum[p] / first * 1000) / 10 : null, drop: i && sum[parts[i - 1]] ? Math.round((1 - sum[p] / sum[parts[i - 1]]) * 1000) / 10 : null }));
}
