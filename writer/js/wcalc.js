// Расчёты писательского приложения: знаки, прогресс, конкурсы, прогнозы. Чистые функции, проверены тестами.
import { addDays, diffDays, r2 } from '../../js/calc.js';

// Знаки с пробелами, как на Литнете: все символы текста, кроме переносов строк/абзацев.
export function countChars(text) {
  return (text || '').replace(/[\r\n\u000b\u000c\u2028\u2029]/g, '').length;
}

// Какие вкладки считаются текстом книги: «Пролог», «Глава …», «Эпилог», «От автора». Синопсис, персонажи, заметки — нет.
export const isBookTab = (title) => /^\s*(пролог|глава|эпилог|от автора)/i.test(title || '');

// Google Документ (Docs API, includeTabsContent=true) → {total, tabs:[{title, chars, counted}]}.
// В сумму идут только вкладки книги (isBookTab); если таких нет — весь документ, как раньше.
export function charsFromDocsJson(doc) {
  const textOf = (content) => {
    let t = '';
    for (const el of content || []) {
      if (el.paragraph) for (const pe of el.paragraph.elements || []) t += pe.textRun?.content || '';
      if (el.table) for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) t += textOf(cell.content);
      if (el.tableOfContents) t += textOf(el.tableOfContents.content);
    }
    return t;
  };
  const tabs = [];
  const walk = (list) => {
    for (const tab of list || []) {
      tabs.push({ title: tab.tabProperties?.title || 'Без названия', chars: countChars(textOf(tab.documentTab?.body?.content)) });
      walk(tab.childTabs);
    }
  };
  if (doc.tabs?.length) walk(doc.tabs);
  else return { total: countChars(textOf(doc.body?.content)), tabs: [{ title: doc.title || 'Документ', chars: countChars(textOf(doc.body?.content)), counted: true }] };
  const any = tabs.some((t) => isBookTab(t.title));
  for (const t of tabs) t.counted = any ? isBookTab(t.title) : true;
  return { total: tabs.filter((t) => t.counted).reduce((a, t) => a + t.chars, 0), tabs };
}

// Word (.docx): word/document.xml → число знаков (текст в <w:t>, табуляция = 1 знак)
export function charsFromDocxXml(xml) {
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
  let n = 0;
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g;
  let m;
  while ((m = re.exec(xml))) n += m[1] !== undefined ? countChars(decode(m[1])) : 1;
  return n;
}

// История знаков книги: {'ГГГГ-ММ-ДД': знаков на конец дня}. Храним последние 400 дней.
export function recordProgress(history, date, chars) {
  const h = { ...(history || {}), [date]: chars };
  const keys = Object.keys(h).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete h[k];
  return h;
}
// Сколько знаков было на конец дня date (последняя запись не позже date)
export function charsAt(history, date) {
  let v = null;
  for (const k of Object.keys(history || {}).sort()) { if (k <= date) v = history[k]; else break; }
  return v;
}
// Прирост за последние `days` дней, считая сегодня: сейчас − на конец дня (today − days).
// «Сегодня» (days = 1) — только если есть запись за вчера: если знаки не обновлялись несколько дней,
// прирост за эти дни нельзя приписать сегодняшнему дню (он виден отдельно — lastGain).
export function written(history, today, days = 1) {
  const now = charsAt(history, today);
  if (now == null) return 0;
  if (days === 1) {
    const prev = Object.keys(history || {}).filter((k) => k < today).sort().pop();
    if (prev && prev < addDays(today, -1)) return 0;
  }
  const before = charsAt(history, addDays(today, -days));
  if (before == null) {
    const first = Object.keys(history || {}).sort()[0];
    // нет записи до периода: первая запись — точка отсчёта, а не «написано с нуля»
    return first > addDays(today, -days) ? now - history[first] : 0;
  }
  return now - before;
}
// Написано сегодня: знаков сейчас − знаков на начало сегодняшнего дня (dayStart считается по истории версий файла)
export function writtenToday(book, today) {
  if (book.dayStart && book.dayStart.date === today && book.chars != null) return Math.max(0, book.chars - book.dayStart.chars);
  return written(book.history, today, 1);
}
// Написано за 7 дней (сегодня и 6 дней до него): от начала недели по истории версий файла
export function writtenWeek(book, today) {
  if (book.weekStart && book.weekStart.date === today && book.weekStart.chars != null && book.chars != null) return Math.max(0, book.chars - book.weekStart.chars);
  return written(book.history, today, 7);
}
// Написано за текущий месяц: по истории знаков, а если история началась уже в этом месяце —
// по истории версий файла (monthStart, считается при обновлении); не меньше, чем написано сегодня
export function writtenMonth(book, today) {
  const h = book.history || {}, from = today.slice(0, 8) + '01', keys = Object.keys(h).sort();
  const now = book.chars ?? charsAt(h, today);
  if (now == null) return 0;
  if (keys.some((k) => k < from)) return Math.max(0, now - charsAt(h, addDays(from, -1)));
  if (book.monthStart && book.monthStart.date === today && book.monthStart.chars != null) return Math.max(0, now - book.monthStart.chars);
  const first = keys.find((k) => k >= from);
  return Math.max(first ? Math.max(0, now - h[first]) : 0, writtenToday(book, today));
}
// Прирост с прошлого обновления (если оно было раньше вчерашнего дня): {date, gain}
export function lastGain(history, today) {
  const now = charsAt(history, today);
  const prev = Object.keys(history || {}).filter((k) => k < today).sort().pop();
  if (now == null || !prev || prev >= addDays(today, -1)) return null;
  return { date: prev, gain: now - history[prev] };
}
// Темп: знаков в день за последние `window` дней (не меньше 0)
export function pace(history, today, window = 14) {
  const keys = Object.keys(history || {}).sort();
  if (keys.length < 2) return 0;
  const from = addDays(today, -window);
  const startKey = [...keys].reverse().find((k) => k <= from) || keys[0];
  const days = Math.max(1, diffDays(startKey, today));
  return Math.max(0, (charsAt(history, today) - history[startKey]) / days);
}
// Когда будет набран объём target при текущем темпе (или null)
export function forecastDate(history, today, target, window = 14) {
  const now = charsAt(history, today) ?? 0;
  if (now >= target) return today;
  const p = pace(history, today, window);
  if (p <= 0) return null;
  return addDays(today, Math.ceil((target - now) / p));
}

export const daysLeft = (today, end) => (end ? diffDays(today, end) : null);

// Конкурс: дни до конца, прогресс книги к минимальному объёму, сколько писать в день
export function contestStatus(contest, book, today) {
  const left = daysLeft(today, contest.end);
  const res = { daysLeft: left, ended: left != null && left < 0, chars: null, need: null, progress: null, perDay: null, forecast: null, onTrack: null };
  if (!book) return res;
  const hist = book.history || {};
  const chars = charsAt(hist, today) ?? book.chars ?? 0;
  res.chars = chars;
  const min = Number(contest.minChars) || 0;
  if (!min) return res;
  res.need = Math.max(0, min - chars);
  res.progress = Math.min(1, chars / min);
  res.perDay = left > 0 ? Math.ceil(res.need / left) : res.need;
  res.forecast = forecastDate(hist, today, min);
  res.onTrack = res.need === 0 || (res.forecast != null && contest.end != null && res.forecast <= contest.end);
  return res;
}

// «Жду ответа»: сколько дней жду, просрочено ли напоминание
export function waitingStatus(item, today) {
  const days = item.since ? diffDays(item.since, today) : 0;
  const remind = Number(item.remindDays) || 14;
  return { days, overdue: !item.done && days >= remind };
}

export { r2 };

// ---- выкладка глав по площадкам ----
// b.pub = { 'Глава 3': { 'Литнет': { date: '2026-10-07', planned: true } } }
// planned — отложенная публикация: до даты глава «запланирована», с этого дня считается выложенной сама.
// Старое поле b.published = { 'Глава 3': '2026-10-07' } — это выкладка на Литнете.
export const MAIN_PF = 'Литнет';
export function pubMap(b) {
  const m = {};
  for (const [ch, date] of Object.entries(b?.published || {})) if (date) m[ch] = { [MAIN_PF]: { date } };
  for (const [ch, pfs] of Object.entries(b?.pub || {})) {
    m[ch] = { ...(m[ch] || {}) };
    for (const [pf, v] of Object.entries(pfs || {})) { if (v && v.date) m[ch][pf] = v; else delete m[ch][pf]; }
    if (!Object.keys(m[ch]).length) delete m[ch];
  }
  return m;
}
// состояние одной отметки: done — выложена (в т. ч. отложенная, чей день настал), wait — запланирована
export const pubState = (v, today) => (!v || !v.date ? null : v.date <= today ? 'done' : 'wait');
// площадки книги для выкладки: сначала Литнет (если есть), затем остальные
export const pubPlatforms = (b) => { const p = (b?.platforms || []).length ? [...b.platforms] : [MAIN_PF]; return p.includes(MAIN_PF) ? [MAIN_PF, ...p.filter((x) => x !== MAIN_PF)] : p; };
// дата выкладки главы — первая дата, когда она вышла хоть на одной площадке (к сегодняшнему дню)
export function chapterOutDates(b, today) {
  const out = {};
  for (const [ch, pfs] of Object.entries(pubMap(b))) {
    const ds = Object.values(pfs).filter((v) => pubState(v, today) === 'done').map((v) => v.date).sort();
    if (ds.length) out[ch] = ds[0];
  }
  return out;
}
// запланированные отложенные публикации (ещё не вышли)
export function plannedPubs(b, today) {
  const r = [];
  for (const [ch, pfs] of Object.entries(pubMap(b))) for (const [pf, v] of Object.entries(pfs)) if (pubState(v, today) === 'wait') r.push({ ch, pf, date: v.date });
  return r.sort((x, y) => x.date.localeCompare(y.date));
}

// главы книги: вкладки документа, которые считаются, плюс главы, отмеченные вручную (книга без файла)
export function chapterList(b) {
  const tabs = (b.tabs || []).filter((t) => t.counted !== false).map((t) => ({ title: t.title, chars: t.chars }));
  const have = new Set(tabs.map((t) => t.title));
  return [...tabs, ...Object.keys(pubMap(b)).filter((t) => !have.has(t)).map((title) => ({ title, chars: null }))];
}
// написанные главы — вкладки «Пролог», «Глава …», «Эпилог» («От автора» главой не считаем)
export const writtenChapters = (b) => (b.tabs || []).filter((t) => t.counted !== false && /^\s*(пролог|глава|эпилог)/i.test(t.title)).length;

// ---- график выкладки: начало + дни недели (1 — пн … 7 — вс) ----
export const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const dowOf = (d) => ((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
// даты выкладки по графику с from (включительно), не больше n штук / не дальше 2 лет
export function scheduleDates(start, days, from, n) {
  const set = new Set((days || []).map(Number)), out = [];
  if (!start || !set.size) return out;
  let d = from > start ? from : start;
  for (let i = 0; i < 730 && out.length < n; i++, d = addDays(d, 1)) if (set.has(dowOf(d))) out.push(d);
  return out;
}
// План выкладки и написания книги — всё считается само, ручные даты (publishUntil, finishBy) имеют приоритет.
// slot «закрыт», если между прошлым днём графика и этим днём на основной площадке что-то вышло или стоит на таймере.
export function bookSchedule(b, today) {
  const pf = pubPlatforms(b)[0], pm = pubMap(b), chs = chapterList(b);
  const marks = Object.values(pm).map((x) => x[pf]?.date).filter(Boolean).sort();
  const planCh = Number(b.planChapters) || null, written = writtenChapters(b);
  const out = Object.keys(chapterOutDates(b, today)).length;
  const marked = Object.values(pm).filter((x) => x[pf]?.date).length; // выложены или на таймере на основной площадке
  const days = b.pubDays || [];
  // свободные дни графика начиная с сегодня
  const back = scheduleDates(b.publishStart, days, addDays(today, -8), 8).filter((d) => d < today).pop() || addDays(today, -1);
  const free = [];
  let prev = back;
  for (const d of scheduleDates(b.publishStart, days, today, 400)) {
    if (!marks.some((m) => m > prev && m <= d)) free.push(d);
    prev = d;
    if (free.length >= 300) break;
  }
  const remaining = planCh ? Math.max(0, planCh - marked) : null;
  const lastMark = marks[marks.length - 1] || null;
  let untilAuto = null;
  if (planCh && b.publishStart && days.length) {
    const last = remaining > 0 ? free[remaining - 1] : null;
    untilAuto = [last, lastMark].filter(Boolean).sort().pop() || null;
  }
  // дописать: средний размер главы × план глав, по темпу письма
  let finishAuto = null;
  if (planCh && written) {
    if (written >= planCh) finishAuto = null;
    else {
      const avg = (b.chars || 0) / written;
      finishAuto = forecastDate(b.history || {}, today, Math.round(avg * planCh));
    }
  }
  // следующая глава к выкладке: первая без отметки на основной площадке
  const nextCh = chs.find((t) => !pm[t.title]?.[pf]?.date)?.title || null;
  const next = (remaining == null || remaining > 0) && free[0] ? { date: free[0], ch: nextCh, pf } : null;
  return { pf, planCh, written, out, marked, remaining, untilAuto, until: b.publishUntil || untilAuto, finishAuto, finish: b.finishBy || finishAuto, next, doneWriting: !!planCh && written >= planCh };
}
