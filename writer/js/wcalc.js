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
  const tabs = [], svc = {};
  // текст аннотации и синопсиса — чтобы показывать их в карточке книги без загрузки документа
  const svcText = (t) => t.replace(/\u000b/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean).filter((x, i) => !(i === 0 && /^(синопсис|аннотация)\.?$/i.test(x))).join('\n').slice(0, 30000);
  const walk = (list) => {
    for (const tab of list || []) {
      const title = tab.tabProperties?.title || 'Без названия', text = textOf(tab.documentTab?.body?.content);
      // первая строка главы (без названия) — чтобы таблица глав читалась как содержание книги
      const lines = text.replace(/\u000b/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean);
      if (lines[0] && lines[0].length <= 80 && (/^(пролог|эпилог|глава|часть)(?=[\s.,:;!?\d]|$)/i.test(lines[0]) || lines[0].replace(/[.\s]+$/, '') === title.trim())) lines.shift();
      tabs.push({ title, chars: countChars(text), lead: (lines[0] || '').slice(0, 160) });
      if (/^\s*синопсис/i.test(title) && svc.synopsis == null) svc.synopsis = svcText(text);
      if (/^\s*аннотац/i.test(title) && svc.annotation == null) svc.annotation = svcText(text);
      walk(tab.childTabs);
    }
  };
  if (doc.tabs?.length) walk(doc.tabs);
  else return { total: countChars(textOf(doc.body?.content)), tabs: [{ title: doc.title || 'Документ', chars: countChars(textOf(doc.body?.content)), counted: true }] };
  const any = tabs.some((t) => isBookTab(t.title));
  for (const t of tabs) t.counted = any ? isBookTab(t.title) : true;
  return { total: tabs.filter((t) => t.counted).reduce((a, t) => a + t.chars, 0), tabs, svc };
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
export function writtenToday(book, today) { return Math.max(0, writtenTodayRaw(book, today)); }
function writtenTodayRaw(book, today) {
  if (book.dayStart && book.dayStart.date === today && book.chars != null) return Math.max(0, book.chars - book.dayStart.chars);
  return written(book.history, today, 1);
}
// Написано за 7 дней (сегодня и 6 дней до него): от начала недели по истории версий файла
export function writtenWeek(book, today) { return Math.max(0, writtenWeekRaw(book, today)); }
function writtenWeekRaw(book, today) {
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
  const tabs = (b.tabs || []).filter((t) => t.counted !== false).map((t) => ({ title: t.title, chars: t.chars, lead: t.lead || '' }));
  const have = new Set(tabs.map((t) => t.title));
  // синопсис, аннотация и прочие служебные вкладки главами не показываем
  return [...tabs, ...Object.keys(pubMap(b)).filter((t) => !have.has(t) && !/^\s*(синопсис|аннотац)/i.test(t)).map((title) => ({ title, chars: null }))];
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
// Отложить несколько глав по графику: каждой — свой день выкладки начиная с from;
// дни, где на этой площадке уже стоит другая глава, пропускаем
export function planBySchedule(b, list, from, pf) {
  const pm = pubMap(b), mine = new Set(list);
  const busy = new Set(Object.entries(pm).filter(([ch]) => !mine.has(ch)).map(([, x]) => x[pf]?.date).filter(Boolean));
  const order = chapterList(b).map((t) => t.title);
  const sorted = [...list].sort((x, y) => (order.indexOf(x) + 1 || 1e9) - (order.indexOf(y) + 1 || 1e9));
  const dates = scheduleDates(b.publishStart, b.pubDays, from, sorted.length + busy.size + 1).filter((d) => !busy.has(d));
  return dates.length < sorted.length ? null : sorted.map((ch, i) => ({ ch, date: dates[i] }));
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
  // свободные дни графика (с сегодня) и главы без отметки на основной площадке — по порядку
  const queue = chs.filter((t) => !pm[t.title]?.[pf]?.date).map((t) => t.title);
  return { pf, planCh, written, out, marked, remaining, free: remaining == null ? free : free.slice(0, remaining), queue, untilAuto, until: b.publishUntil || untilAuto, finishAuto, finish: b.finishBy || finishAuto, next, doneWriting: !!planCh && written >= planCh };
}

// ---- знаки по дням: прирост за каждый день (по истории; сегодня — по началу дня) ----
// known=false — в этот день записи не было (прирост мог «уехать» в следующий день с записью)
export function dailyWritten(book, from, to, today) {
  const h = book.history || {}, out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d === today) { out.push({ date: d, value: writtenToday(book, today), known: true }); continue; }
    const now = h[d], prev = charsAt(h, addDays(d, -1));
    out.push(now != null && prev != null ? { date: d, value: Math.max(0, now - prev), known: true } : { date: d, value: 0, known: false });
  }
  return out;
}
// сумма по нескольким книгам
export function dailyWrittenAll(books, from, to, today) {
  const rows = books.map((b) => dailyWritten(b, from, to, today));
  return rows.length ? rows[0].map((r, i) => ({ date: r.date, value: rows.reduce((s, x) => s + x[i].value, 0), known: rows.some((x) => x[i].known) })) : [];
}

// ---- цели ----
// g = { type: 'finish' | 'daily' | 'custom', bookId, title, deadline, days:[1..7], perDay (знаков, для daily), checks:{date:true}, done }
export const GOAL_TYPES = { finish: 'Главы к сроку (по главе в день)', daily: 'Писать N а.л. в день', custom: 'Своя цель' };
const isGoalDay = (g, d) => { const days = (g.days || []).map(Number); return !days.length || days.includes(dowOf(d)); };
// сколько дней цели осталось с today по deadline включительно
export function goalDaysLeft(g, today) {
  if (!g.deadline) return null;
  let n = 0;
  for (let d = today; d <= g.deadline && n < 1000; d = addDays(d, 1)) if (isGoalDay(g, d)) n++;
  return n;
}
export function goalStatus(g, book, today) {
  const r = { active: !g.done && !(g.deadline && g.deadline < today), todayDay: isGoalDay(g, today), daysLeft: goalDaysLeft(g, today), progress: null, needToday: null, doneToday: false, perDay: null, perDayCh: null, left: null, streak: 0 };
  const wt = book ? writtenToday(book, today) : 0;
  if (g.type === 'finish' && book) {
    // «главы к сроку»: глава засчитывается, когда отмечена выложенной или поставлена на таймер (на основной площадке)
    const pf = pubPlatforms(book)[0], pm = pubMap(book);
    const planCh = Number(g.chapters || book.planChapters) || null;
    const marks = Object.values(pm).map((x) => x[pf]).filter((v) => v && v.date);
    const marked = marks.length;
    // в какой день отмечена: at (когда нажала), иначе дата выкладки (не для таймера и не для «уже выложено раньше»)
    const dayOf = (v) => v.at || (v.planned || v.past ? null : v.date);
    const byDay = {};
    for (const v of marks) { const d = dayOf(v); if (d) byDay[d] = (byDay[d] || 0) + 1; }
    r.unit = 'ch';
    r.perDayCh = Number(g.perDay) || 1;
    r.todayCh = byDay[today] || 0;
    r.left = planCh ? Math.max(0, planCh - marked) : null;
    r.progress = planCh ? Math.min(1, marked / planCh) : null;
    r.needToday = Math.max(0, r.perDayCh - r.todayCh);
    r.doneToday = r.todayCh >= r.perDayCh;
    if (r.left != null && r.daysLeft) r.needPerDay = r.left / r.daysLeft; // сколько нужно в день, чтобы успеть
    for (let d = r.doneToday ? today : addDays(today, -1), i = 0; i < 365; i++, d = addDays(d, -1)) {
      if (g.createdAt && d < g.createdAt.slice(0, 10)) break;
      if (!isGoalDay(g, d)) continue;
      if ((byDay[d] || 0) >= r.perDayCh) r.streak++; else break;
    }
    if (r.left === 0) { r.doneToday = true; r.active = false; r.finished = true; }
  } else if (g.type === 'daily') {
    r.perDay = Number(g.perDay) || null;
  }
  if (g.type === 'custom') r.doneToday = !!(g.checks || {})[today];
  else if (g.type === 'daily' && r.perDay) {
    // сегодня: начало дня приходится на прирост, знаки до начала цели не считаем
    r.needToday = Math.max(0, r.perDay - wt);
    r.doneToday = r.doneToday || wt >= r.perDay * 0.95;
    // серия: дни цели подряд, когда норма выполнена (сегодня — если уже выполнена)
    if (book) {
      for (let d = r.doneToday ? today : addDays(today, -1), i = 0; i < 365; i++, d = addDays(d, -1)) {
        if (g.createdAt && d < g.createdAt.slice(0, 10)) break;
        if (!isGoalDay(g, d)) continue;
        const v = dailyWritten(book, d, d, today)[0];
        if (v.known && v.value >= r.perDay * 0.95) r.streak++; else break;
      }
    }
  }
  if (g.type === 'custom' && g.deadline && g.createdAt) {
    const all = goalDaysLeft({ ...g }, g.createdAt.slice(0, 10)) || 1;
    r.progress = Math.min(1, Object.keys(g.checks || {}).length / all);
  }
  return r;
}

// ---- авторские листы: 1 а.л. = 40 000 знаков с пробелами. Везде показываем объём в а.л., не в знаках ----
export const AL = 40000;
// 7,5 · 0,97 · 12 — без лишних нулей; совсем мало — «< 0,01»
export function alNum(chars) {
  const v = (Number(chars) || 0) / AL;
  if (v > 0 && v < 0.005) return '< 0,01';
  const d = v >= 10 ? 1 : v >= 1 ? 1 : 2;
  return v.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
}
export const al = (chars) => `${alNum(chars)} а.л.`;
// ввод: «7,5» а.л. → знаки
export const fromAl = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return String(v ?? '').trim() === '' || Number.isNaN(n) ? null : Math.round(n * AL); };

// ---- конкурс: объём в тех единицах, в которых он задан в условиях (x.unit: 'al' — а.л., 'chars' — знаки) ----
const grp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const contestVol = (x) => (n) => (x?.unit === 'chars' ? `${grp(n)} зн.` : al(n));
// ввод объёма конкурса: в знаках или в а.л.
export const contestIn = (unit, v) => {
  if (unit !== 'chars') return fromAl(v);
  const n = Number(String(v ?? '').replace(/[\s ]/g, '').replace(',', '.'));
  return String(v ?? '').trim() === '' || Number.isNaN(n) ? null : Math.round(n);
};
export const contestOut = (unit, chars) => (chars == null ? '' : unit === 'chars' ? String(chars) : alNum(chars));

// ---- конкурс из текста условий (скопированного со страницы): название, даты, объём, площадка ----
const MON_RX = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const MON_I = MON_RX.split('|');
const pad2 = (n) => String(n).padStart(2, '0');
export function parseContest(text, url = '', today = new Date().toISOString().slice(0, 10)) {
  const t = String(text || '').replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ');
  const out = {};
  // площадка — по ссылке или по тексту
  const host = (/^https?:\/\/([^/]+)/i.exec(String(url || '').trim()) || [])[1] || '';
  const pf = /litnet/i.test(host + t) || /литнет/i.test(t) ? 'Литнет' : /author\.today|автор\.тудэй/i.test(host + t) ? 'Author.Today' : /litres|литрес/i.test(host + t) ? 'Литрес' : /litmarket|литмаркет/i.test(host + t) ? 'Литмаркет' : '';
  if (pf) out.platform = pf;
  // название: «…» после слова «конкурс», иначе первые «…», иначе первая короткая строка
  const nm = /конкурс\w*\s*[«"]([^»"\n]{3,90})[»"]/i.exec(t) || /[«"]([^»"\n]{3,90})[»"]/.exec(t);
  if (nm) out.name = nm[1].trim();
  else { const first = t.split('\n').map((x) => x.trim()).find((x) => x && x.length <= 100); if (first) out.name = first.replace(/^конкурс\s*/i, '').trim(); }
  // даты: «1 октября [2026]» и «01.10.2026»
  const yearHint = Number((/\b(20\d\d)\b/.exec(t) || [])[1]) || Number(today.slice(0, 4));
  const dates = [];
  const fix = (d, m, y) => { let yy = y ? Number(String(y).length === 2 ? '20' + y : y) : yearHint; let iso = `${yy}-${pad2(m)}-${pad2(d)}`; if (!y && iso < today && today.slice(0, 4) == yy && Number(today.slice(5, 7)) - m > 6) iso = `${yy + 1}-${pad2(m)}-${pad2(d)}`; return iso; };
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s+(${MON_RX})(?:\\s+(\\d{4}))?`, 'gi'))) dates.push({ i: m.index, end: m.index + m[0].length, iso: fix(+m[1], MON_I.indexOf(m[2].toLowerCase()) + 1, m[3]) });
  for (const m of t.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g)) dates.push({ i: m.index, end: m.index + m[0].length, iso: fix(+m[1], +m[2], m[3]) });
  dates.sort((a, b) => a.i - b.i);
  const before = (d, n = 45) => t.slice(Math.max(0, d.i - n), d.i).toLowerCase();
  // «с 1 октября по 30 ноября» — самое надёжное
  for (let k = 0; k + 1 < dates.length; k++) {
    const gap = t.slice(dates[k].end, dates[k + 1].i);
    if (/^\s*(?:по|до|—|–|-)\s*$/i.test(gap) && /(^|\s)с\s*$/i.test(before(dates[k], 4))) { out.start = dates[k].iso; out.end = dates[k + 1].iso; break; }
  }
  if (!out.end) { const e = dates.find((d) => /(при[её]м[^.]{0,40}(до|по)|окончани|заверш|дедлайн|последн|до|по)\s*$/i.test(before(d))); if (e) out.end = e.iso; }
  if (!out.start) { const s = dates.find((d) => /(старт|начал|открыт|с)\s*$/i.test(before(d)) && d.iso !== out.end); if (s) out.start = s.iso; }
  if (!out.end && dates.length) out.end = dates[dates.length - 1].iso;
  if (out.start && out.end && out.start > out.end) [out.start, out.end] = [out.end, out.start];
  // объём: «от 6 до 12 а.л.», «не менее 200 000 знаков», «до 15 авторских листов», «от 120 тыс. знаков»
  const NUM = '(\\d[\\d ]*(?:[.,]\\d+)?)\\s*(тыс\\.?|тысяч\\w*)?';
  const UNIT = '(а\\.?\\s?л\\.?|авторск\\w*\\s+лист\\w*|знак\\w*|зн\\.|символ\\w*)';
  const num = (s, k) => { const v = Number(String(s).replace(/ /g, '').replace(',', '.')); return k ? v * 1000 : v; };
  const isAl = (u) => /^а|авторск/i.test(u);
  let unit = null, min = null, max = null;
  const range = new RegExp(`от\\s+${NUM}\\s*(?:${UNIT}\\s*)?(?:и\\s+)?до\\s+${NUM}\\s*${UNIT}`, 'i').exec(t);
  if (range) { unit = isAl(range[6]) ? 'al' : 'chars'; min = num(range[1], range[2]); max = num(range[4], range[5]); }
  else {
    const mn = new RegExp(`(?:не\\s+менее|минимум|минимальн\\w*\\s+объ[её]м\\w*[:\\s—-]*|от)\\s*${NUM}\\s*${UNIT}`, 'i').exec(t);
    const mx = new RegExp(`(?:не\\s+более|максимум|максимальн\\w*\\s+объ[её]м\\w*[:\\s—-]*|до)\\s*${NUM}\\s*${UNIT}`, 'i').exec(t);
    if (mn) { unit = isAl(mn[3]) ? 'al' : 'chars'; min = num(mn[1], mn[2]); }
    if (mx) { unit = unit || (isAl(mx[3]) ? 'al' : 'chars'); max = num(mx[1], mx[2]); }
  }
  if (unit) {
    out.unit = unit;
    const toChars = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(unit === 'al' ? v * AL : v));
    if (min != null) out.minChars = toChars(min);
    if (max != null) out.maxChars = toChars(max);
  }
  return out;
}
