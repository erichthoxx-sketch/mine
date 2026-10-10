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
const isRegularDay = (g, d) => { const days = (g.days || []).map(Number); return !days.length || days.includes(dowOf(d)); };
// перенесённые дни: g.moved = { 'откуда': 'куда' } — в «откуда» цели нет, в «куда» — норма за оба дня
const isGoalDay = (g, d) => { const mv = g.moved || {}; return d in mv ? false : isRegularDay(g, d) || Object.values(mv).includes(d); };
export const goalMult = (g, d) => { const mv = g.moved || {}; return d in mv ? 0 : (isRegularDay(g, d) ? 1 : 0) + Object.values(mv).filter((x) => x === d).length; };
export const goalDayOn = isGoalDay;
// перенести день цели from → to: что уже было перенесено на from, переезжает вместе с ним; перенос обратно отменяет перенос
export function moveGoalDay(g, from, to) {
  const mv = { ...(g.moved || {}) };
  const incoming = Object.keys(mv).filter((k) => mv[k] === from);
  const back = Object.keys(mv).filter((k) => k === to && mv[k] === from);
  for (const k of back) delete mv[k];
  for (const k of incoming) if (!back.includes(k)) mv[k] = to;
  if (isRegularDay(g, from) && !(from in mv)) { if (mv[to] === from) delete mv[to]; else mv[from] = to; }
  for (const k of Object.keys(mv)) if (k === mv[k]) delete mv[k];
  return mv;
}
// сколько дней цели осталось с today по deadline включительно
export function goalDaysLeft(g, today) {
  if (!g.deadline) return null;
  let n = 0;
  for (let d = today, i = 0; d <= g.deadline && i < 1000; d = addDays(d, 1), i++) n += isGoalDay(g, d) ? Math.max(1, goalMult(g, d)) : 0; // перенесённый день — двойная порция
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
    r.perDayCh = (Number(g.perDay) || 1) * Math.max(1, goalMult(g, today));
    r.todayCh = byDay[today] || 0;
    r.left = planCh ? Math.max(0, planCh - marked) : null;
    r.progress = planCh ? Math.min(1, marked / planCh) : null;
    r.needToday = Math.max(0, r.perDayCh - r.todayCh);
    r.doneToday = r.todayCh >= r.perDayCh;
    if (r.left != null && r.daysLeft) r.needPerDay = r.left / r.daysLeft; // сколько нужно в день, чтобы успеть
    for (let d = r.doneToday ? today : addDays(today, -1), i = 0; i < 365; i++, d = addDays(d, -1)) {
      if (g.createdAt && d < g.createdAt.slice(0, 10)) break;
      if (!isGoalDay(g, d)) continue;
      if ((byDay[d] || 0) >= (Number(g.perDay) || 1) * Math.max(1, goalMult(g, d))) r.streak++; else break;
    }
    if (r.left === 0) { r.doneToday = true; r.active = false; r.finished = true; }
  } else if (g.type === 'daily') {
    r.perDay = Number(g.perDay) ? Number(g.perDay) * Math.max(1, goalMult(g, today)) : null;
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
        if (v.known && v.value >= Number(g.perDay) * Math.max(1, goalMult(g, d)) * 0.95) r.streak++; else break;
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
// месяцы полностью и сокращённо, как на Литнете: «31 июл. 2026», «до 30 нояб. 2026», «1 сент.»
const MON_RX = '(?:январ[ья]|янв|феврал[ья]|февр?|марта?|мар|апрел[ья]|апр|ма[йя]|июн[ья]|июн|июл[ья]|июл|августа?|авг|сентябр[ья]|сент?|октябр[ья]|окт|ноябр[ья]|нояб?|декабр[ья]|дек)\\.?(?![а-яё])';
const MON3 = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monIdx = (w) => { const x = w.toLowerCase(); return MON3.findIndex((m) => x.startsWith(m)) + 1; };
const pad2 = (n) => String(n).padStart(2, '0');
export function parseContest(text, url = '', today = new Date().toISOString().slice(0, 10)) {
  const t = String(text || '').replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ');
  const out = {};
  // площадка — по ссылке или по тексту
  const host = (/^https?:\/\/([^/]+)/i.exec(String(url || '').trim()) || [])[1] || '';
  const pf = /litnet/i.test(host + t) || /литнет/i.test(t) ? 'Литнет' : /author\.today|автор\.тудэй/i.test(host + t) ? 'Author.Today' : /litres|литрес/i.test(host + t) ? 'Литрес' : /litmarket|литмаркет/i.test(host + t) ? 'Литмаркет' : '';
  if (pf) out.platform = pf;
  // название: «…» рядом со словом «конкурс» («конкурс романов «Второе дыхание»»), иначе первые «…», но не название площадки
  const PLAT = /^(литнет|литрес|author\.today|автор\.тудэй|литмаркет|cherry books|time out)$/i;
  const nm = /конкурс[а-яё]*(?:\s+[а-яёa-z-]+){0,3}\s*[«"]([^»"\n]{3,90})[»"]/i.exec(t) || [...t.matchAll(/[«"]([^»"\n]{3,90})[»"]/g)].find((m) => !PLAT.test(m[1].trim()));
  // страница Литнета: «Название / Конкурс на лучший роман… / Срок приема работ» — название стоит над описанием
  const lines = t.split('\n').map((x) => x.trim()).filter(Boolean);
  const NAV = /^(правила(\s+конкурса)?|литнет|литрес|author\.today|литмаркет|книги|конкурсы|блоги|главная|правила|работы|участники|описание|войти|меню|поиск|\d+)$/i;
  const at = lines.findIndex((x) => /^срок\s+при[её]ма/i.test(x));
  let head = null;
  if (at > 0) { let k = at - 1; if (/^конкурс\s+(на|для|о|об|среди)\s/i.test(lines[k]) && k > 0) k--; if (!NAV.test(lines[k]) && lines[k].length <= 90) head = lines[k]; }
  if (head) out.name = head.replace(/^конкурс\s*/i, '').replace(/^[«"]|[»"]$/g, '').trim();
  else if (nm) out.name = nm[1].trim();
  else { const first = lines.find((x) => x.length <= 100 && !/^правила/i.test(x) && !NAV.test(x)); if (first) out.name = first.replace(/^конкурс\s*/i, '').trim(); }
  // даты: «1 октября [2026]» и «01.10.2026»
  const yearHint = Number((/\b(20\d\d)\b/.exec(t) || [])[1]) || Number(today.slice(0, 4));
  const dates = [];
  const fix = (d, m, y) => { let yy = y ? Number(String(y).length === 2 ? '20' + y : y) : yearHint; let iso = `${yy}-${pad2(m)}-${pad2(d)}`; if (!y && iso < today && today.slice(0, 4) == yy && Number(today.slice(5, 7)) - m > 6) iso = `${yy + 1}-${pad2(m)}-${pad2(d)}`; return iso; };
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s+(${MON_RX})(?:\\s*(\\d{4}))?`, 'gi'))) dates.push({ i: m.index, end: m.index + m[0].length, iso: fix(+m[1], monIdx(m[2]), m[3]) });
  for (const m of t.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g)) dates.push({ i: m.index, end: m.index + m[0].length, iso: fix(+m[1], +m[2], m[3]) });
  dates.sort((a, b) => a.i - b.i);
  const before = (d, n = 45) => t.slice(Math.max(0, d.i - n), d.i).toLowerCase();
  // итоги / оглашение результатов — отдельно, это не срок подачи
  const RES = /(оглашени|итог|результат|победител|объявлени)[^\n]{0,25}\n?[^\n]{0,10}$/i;
  const resD = dates.find((d) => RES.test(before(d, 50)));
  if (resD) out.results = resD.iso;
  const pool = dates.filter((d) => d !== resD);
  // диапазон: «с 1 октября по 30 ноября», «31.07.2026 - 31.10.2026» — срок приёма работ
  for (let k = 0; k + 1 < pool.length; k++) {
    const gap = t.slice(pool[k].end, pool[k + 1].i);
    if (/^\s*(?:по|до|—|–|-)\s*$/i.test(gap)) { out.start = pool[k].iso; out.end = pool[k + 1].iso; break; }
  }
  if (!out.end) { const e = pool.find((d) => /(при[её]м[^.]{0,40}(до|по)|окончани|заверш|дедлайн|последн|до|по)\s*$/i.test(before(d))); if (e) out.end = e.iso; }
  if (!out.start) { const st = pool.find((d) => /(старт|начал|открыт|с)\s*$/i.test(before(d)) && d.iso !== out.end); if (st) out.start = st.iso; }
  if (!out.end && pool.length) out.end = pool[pool.length - 1].iso;
  if (out.start && out.end && out.start > out.end) [out.start, out.end] = [out.end, out.start];
  // итоги не раньше конца приёма: «с 10 января по 10 марта, итоги 10 апреля» — всё в одном году
  const plusYear = (d) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  if (out.results && out.end && out.results < out.end && plusYear(out.results) >= out.end) out.results = plusYear(out.results);
  // жанры: строка после «Жанры» / «Жанр:»
  const gm = /жанр[а-яё]*\s*[:—-]?\s*\n?\s*([^\n]{2,120})/i.exec(t);
  if (gm) out.genres = gm[1].trim().replace(/[.;]$/, '');
  // куда отправлять: email-адреса из условий
  const emails = [...new Set((t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((e) => e.replace(/[.,;]+$/, '').toLowerCase()))];
  if (emails.length) out.emails = emails;
  // объём: «от 6 до 12 а.л.», «не менее 200 000 знаков», «до 15 авторских листов», «от 120 тыс. знаков».
  // Правила выкладки («глава — от 10 000 знаков», «не реже… по 30 000 знаков в неделю») — не объём книги, их пропускаем.
  // Если минимумов два («на момент подачи — от 30 000», «к окончанию приёма — от 100 000»), главный — к окончанию.
  const NUM = '(\\d[\\d ]*(?:[.,]\\d+)?)\\s*(тыс\\.?|тысяч\\S*)?';
  const UNIT = '(а\\.?\\s?л\\.?|авторск\\S*\\s+лист\\S*|знак\\S*|зн\\.|символ\\S*)';
  const num = (v, k) => { const n = Number(String(v).replace(/ /g, '').replace(',', '.')); return k ? n * 1000 : n; };
  const isAl = (u) => /^а|авторск/i.test(u);
  const SKIP_BEFORE = /(глав[аеыу]?|прод[аыу]?|обновлени\S*|выкладк\S*|выкладыва\S*|отрыв\S*|фрагмент\S*|комментари\S*|рецензи\S*|аннотаци\S*|синопсис\S*|отзыв\S*)[^.;\n]{0,40}$/i;
  const SKIP_AFTER = /^[^.;\n]{0,25}(в\s+(день|неделю|месяц|сутки)|ежедневн|еженедельн|кажд|за\s+раз|в\s+одной\s+глав)/i;
  const FINAL = /(к\s+(окончани|концу|завершени|финалу|дате)|на\s+момент\s+(окончани|завершени|подведени)|по\s+окончани|до\s+конца\s+при[её]ма|к\s+подведени)/i;
  const START = /(на\s+момент\s+(подачи|заявки|старта|регистрац)|при\s+подаче|для\s+подачи|на\s+старте|для\s+(участия|заявки)|в\s+момент\s+подачи)/i;
  const MAXW = /(не\s+более|не\s+больше|максимум|максимальн\S*(\s+объ[её]м\S*)?|не\s+должен\s+превышать|не\s+превыша\S*)[\s:—-]*$/i;
  const MINW = /(не\s+менее|не\s+меньше|минимум|минимальн\S*(\s+объ[её]м\S*)?|от)[\s:—-]*$/i;
  const found = [];
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*${UNIT}`, 'gi'))) {
    const pre = t.slice(Math.max(0, m.index - 140), m.index), post = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const clause = pre.split(/[.;!?\n]/).pop() + m[0], sent = (() => { const ls = pre.split('\n'), cur = ls.pop().split(/[.;!?](?=\s|$)/).pop(), prev = (ls.pop() || '').trim(); return ((cur.trim() === '' || /^\s*(от|до|не)/i.test(cur)) && prev && prev.length < 40 ? prev + ': ' : '') + (cur + m[0] + post.split(/[.;!?\n]/)[0]).trim(); })();
    if (SKIP_BEFORE.test(clause.slice(0, -m[0].length)) && !/объ[её]м\S*\s+(книги|произведени|романа|текста|работы)/i.test(clause)) continue;
    if (SKIP_AFTER.test(post)) continue;
    const v = num(m[1], m[2]), unit = isAl(m[3]) ? 'al' : 'chars', near = pre.slice(-30);
    // «от 30 000 до 100 000 знаков» — первое число без единиц
    const rg = new RegExp(`от\\s+${NUM}\\s*(?:${UNIT}\\s*)?(?:и\\s+)?до\\s*$`, 'i').exec(pre);
    if (rg) { found.push({ kind: 'min', v: num(rg[1], rg[2]), unit, when: FINAL.test(clause) ? 'final' : START.test(clause) ? 'start' : '', sent }); found.push({ kind: 'max', v, unit, sent }); continue; }
    if (MAXW.test(near) || /(объ[её]м|размер)\S*[^.\n]{0,30}\sдо\s*$/i.test(near) || /^\s*(и\s+)?не\s+более/i.test(post) || /^\s*максимум/i.test(post)) { found.push({ kind: 'max', v, unit, sent }); continue; }
    if (MINW.test(near) || /^\s*(и\s+)?(более|больше)/i.test(post) || /^\s*минимум/i.test(post) || /(объ[её]м|размер)\S*[^.\n]{0,40}$/i.test(near)) found.push({ kind: 'min', v, unit, when: FINAL.test(clause) ? 'final' : START.test(clause) ? 'start' : '', sent });
  }
  const mins = found.filter((f) => f.kind === 'min'), maxs = found.filter((f) => f.kind === 'max');
  const minF = mins.find((f) => f.when === 'final') || mins.find((f) => !f.when) || mins.find((f) => f.when === 'start');
  const minS = mins.find((f) => f.when === 'start' && f !== minF);
  const maxF = maxs[0];
  const base = minF || maxF;
  if (base) {
    const unit = base.unit, toChars = (f) => Math.round(f.unit === 'al' ? f.v * AL : f.v);
    out.unit = unit;
    if (minF) out.minChars = toChars(minF);
    if (maxF && (!minF || toChars(maxF) > toChars(minF))) out.maxChars = toChars(maxF);
    if (minS && minF && toChars(minS) < toChars(minF)) out.startChars = toChars(minS);
    out.volNote = [...new Set([minF, maxF, minS].filter(Boolean).map((f) => f.sent.replace(/\s+/g, ' ').slice(0, 160)))].join(' … ');
  }
  // только новые книги (в процессе): «принимаются новые произведения», «первая глава — не ранее 31 июля», «в процессе написания»
  const NEW = /(принима\S*\s+(только\s+)?нов\S*|нов(ые|ое|ых|ая)\s+(произведени|книг|роман|истори|текст)|в\s+процессе\s+(написания|выкладки)|начат\S*\s+(не\s+ранее|после)|перв\S*\s+глав\S*[^.\n]{0,60}(не\s+ранее|после|с\s+\d)|не\s+ранее[^.\n]{0,30}(публикац|выкладк|начал))/i.exec(t);
  if (NEW) {
    out.newOnly = true;
    const since = dates.find((d) => d.i >= NEW.index - 10 && d.i <= NEW.index + NEW[0].length + 60);
    if (since && /не\s+ранее|после|с\s+\d/i.test(t.slice(NEW.index, since.end))) out.newSince = since.iso;
  }
  // как назвать файл: «Файл назвать: ВторойШанс_Фамилия_Название»
  const fn = /(?:назов\S*\s+файл\S*|назв\S*\s+файл\S*|имя\s+файла|файл\S*[^.\n]{0,40}?(?:назва\S*|назов\S*|именова\S*|называ\S*)|переименуйте\S*[^.\n]{0,20})[^.\n]{0,60}?[:—–-]?\s*[«"“]?([A-Za-zА-Яа-яЁё0-9]+(?:[_ ]?[-_][_ ]?[A-Za-zА-Яа-яЁё0-9]+){1,6})/i.exec(t);
  if (fn) out.fileTpl = fn[1].replace(/\s*_\s*/g, '_');
  // «первые 3 главы», «первые пять глав» — что отправить
  const W = { одн: 1, перв: 1, дв: 2, тр: 3, четыр: 4, пят: 5, шест: 6, сем: 7, восем: 8, девят: 9, десят: 10 };
  const fc = /перв\S*\s+(\d{1,2}|[а-яё]+)\s+глав/i.exec(t);
  if (fc) { const n = /^\d/.test(fc[1]) ? Number(fc[1]) : Object.entries(W).find(([k]) => fc[1].toLowerCase().startsWith(k))?.[1]; if (n) out.chapters = n; }
  // формат файла
  const fmts = ['docx', 'doc', 'rtf', 'pdf', 'fb2', 'txt'].filter((f) => new RegExp(`(^|[^a-z])\\.?${f}([^a-z]|$)`, 'i').test(t));
  if (fmts.length) out.formats = fmts;
  return out;
}

// книги конкурса: можно несколько (раньше была одна — bookId)
export const contestBookIds = (x) => (Array.isArray(x?.bookIds) ? x.bookIds : x?.bookId ? [x.bookId] : []);
// какие книги уже отправлены на конкурс: { bookId: дата }; старое «отправлено» на весь конкурс — все книги
export const contestSent = (x) => (x?.sentBooks ? x.sentBooks : x?.status === 'sent' ? Object.fromEntries(contestBookIds(x).map((id) => [id, x.sentAt || ''])) : {});
export const contestUnsent = (x) => contestBookIds(x).filter((id) => !(id in contestSent(x)));
// знаки книги для конкурса — только текст: без «От автора», аннотации и синопсиса
export function contestChars(b) {
  const tabs = (b?.tabs || []).filter((t) => t.counted !== false && isBookTab(t.title) && !/^\s*от автора/i.test(t.title));
  return tabs.length ? tabs.reduce((a, t) => a + (t.chars || 0), 0) : null;
}
// имя файла по правилам конкурса: «ВторойШанс_Фамилия_Название» → «ВторойШанс_Фрейтаг_Звериная_тропа_для_двоих»
export function contestFileName(x, b, kind, author = '') {
  const tpl = String(x?.fileTpl || '').trim();
  if (!tpl) return null;
  const words = (v) => String(v || '').replace(/[\\/:*?"<>|«»„“”.,!?;]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const aw = words(author), title = words(String(b?.title || '').split(/[.!?]\s/)[0]);
  const KIND = kind === 'synopsis' ? 'Синопсис' : 'Текст';
  let hasKind = false;
  const parts = tpl.split(/[_-]+/).map((tk) => {
    const k = tk.toLowerCase();
    if (/^фамили/.test(k)) return aw.at(-1) || tk;
    if (/^(фио|автор|псевдоним)/.test(k)) return aw.join('_') || tk;
    if (/^им[яи]$/.test(k)) return aw[0] || tk;
    if (/^назв|^книг|^произвед|^роман/.test(k)) return title.join('_') || tk;
    if (/^(синопсис|текст|рукопис|работ)/.test(k)) { hasKind = true; return KIND; }
    return tk;
  });
  if (!hasKind && kind === 'synopsis') parts.push(KIND);
  return parts.join('_');
}
// подходит ли книга под условия конкурса по объёму: { ok, text } — в единицах конкурса
export function contestFit(x, b, today) {
  const s = contestStatus(x, b, today), v = contestVol(x), chars = contestChars(b) ?? s.chars ?? b?.chars ?? 0;
  const min = Number(x.minChars) || 0, max = Number(x.maxChars) || 0;
  // конкурс для новых книг в процессе: завершённая или начатая раньше — не подходит; минимум — чтобы подать
  if (x.newOnly) {
    if (b?.status === 'done') return { ok: false, out: true, chars, text: 'книга завершена — конкурс для новых книг в процессе' };
    if (x.newSince && b?.publishStart && b.publishStart < x.newSince) return { ok: false, out: true, chars, text: `выкладка начата раньше ${x.newSince.slice(8, 10)}.${x.newSince.slice(5, 7)} — конкурс для новых книг` };
    if (min && chars < min) return { ok: false, chars, need: min - chars, text: `до подачи ещё ${v(min - chars)} (${v(chars)} из ${v(min)})${s.perDay ? ` · ~${v(s.perDay)} в день` : ''}` };
    return { ok: true, ready: true, chars, text: min ? `можно подавать — ${v(chars)} из ${v(min)}` : 'можно подавать' };
  }
  if (!min && !max) return { ok: null, chars, text: `${v(chars)} · условий по объёму нет` };
  if (max && chars > max) return { ok: false, chars, text: `${v(chars)} — больше максимума (${v(max)})` };
  if (min && chars < min) return { ok: false, chars, need: min - chars, text: `${v(chars)} из ${v(min)} — не хватает ${v(min - chars)}${s.perDay ? ` (~${v(s.perDay)} в день)` : ''}` };
  return { ok: true, chars, text: `${v(chars)} — подходит по объёму` };
}

// ---- календарь конкурсов: из вставленного списка (например, пост «Календарь конкурсов Литнета») — много конкурсов сразу ----
// Каждый абзац (или строка с «Названием») — отдельный конкурс; если точных дат нет, а есть месяц — ставим весь месяц, примерно.
const MON_FULL = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
export function parseContestList(text, today = new Date().toISOString().slice(0, 10)) {
  const src = String(text || '').replace(/\r/g, '').trim();
  if (!src) return [];
  let chunks = src.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (chunks.length < 2) {
    // без пустых строк: новый конкурс — строка с «кавычками» или с маркером списка
    chunks = [];
    for (const line of src.split('\n')) {
      if (!chunks.length || /^\s*([-–—•*]|\d+[.)])\s+|[«"]/.test(line)) chunks.push(line); else chunks[chunks.length - 1] += '\n' + line;
    }
  }
  const out = [], seen = new Set();
  for (const ch of chunks) {
    const r = parseContest(ch, '', today);
    if (!r.name || r.name.length > 80) continue;
    if (!r.end && !r.start) {
      const m = new RegExp(`(${MON_FULL.join('|')})[а-яё]*(?:\\s+(20\\d\\d))?`, 'i').exec(ch);
      if (!m) continue;
      const mi = MON_FULL.findIndex((x) => new RegExp('^' + x, 'i').test(m[1])) + 1;
      let y = Number(m[2]) || Number(today.slice(0, 4));
      if (!m[2] && `${y}-${String(mi).padStart(2, '0')}` < today.slice(0, 7)) y++;
      const mm = String(mi).padStart(2, '0');
      r.start = `${y}-${mm}-01`; r.end = `${y}-${mm}-${String(new Date(Date.UTC(y, mi, 0)).getUTCDate()).padStart(2, '0')}`; r.approx = true;
    }
    const key = r.name.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, conditions: ch });
  }
  return out;
}
