// Выводы для заработка (чистые функции, общие для приложений): сводка недели, лучший день выкладки глав,
// отдача скидок, «хвост» старых книг при выходе новой, успеваете ли дописать книгу к концу конкурса.
// Все цифры — из тех же данных, что «Доходы» (financialLedger через adCtx) и «Мастерская» (w_books).
import { incomeSeries, addDays, countDays } from './calc.js';
import { adCtx, adBoard, titleMatch } from './adroi.js';
import { chapterOutDates, charsAt, forecastDate } from '../writer/js/wcalc.js';

const sum = (xs, k = 'royalty') => xs.reduce((a, x) => a + (x[k] || 0), 0);
const avg = (xs, k = 'royalty') => (xs.length ? sum(xs, k) / xs.length : null);
const known = (xs) => xs.filter((x) => x.known !== false);
export const WD_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const wdOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

// книга «Доходов» для книги Мастерской (названия бывают короче/длиннее: «Альпийский развод» / «… Он оставил меня умирать»)
export const incomeBookOf = (wb, books = []) => books.find((b) => titleMatch(b.title, wb?.title)) || null;

// ---------- 1. Сводка недели ----------
// Неделя — 7 последних дней с данными продаж (по dataEnd), против 7 дней перед ними.
export function weekSummary(data = {}, settings = {}, today) {
  const ctx = adCtx(data, settings, today), end = ctx.dataEnd, from = addDays(end, -6);
  const pFrom = addDays(from, -7), pTo = addDays(from, -1);
  const cur = known(incomeSeries(ctx.sales, ctx.legacyDays, from, end)), prev = known(incomeSeries(ctx.sales, ctx.legacyDays, pFrom, pTo));
  const income = Math.round(sum(cur)), was = Math.round(sum(prev));
  const reasons = [];
  // главы, вышедшие за неделю
  const ch = [];
  for (const b of data.w_books || []) for (const [c, d] of Object.entries(chapterOutDates(b, today))) if (d >= from && d <= end) ch.push({ book: b.title, ch: c });
  if (ch.length) reasons.push(`вышло глав: ${ch.length}${[...new Set(ch.map((x) => x.book))].length === 1 ? ` («${ch[0].book}»)` : ''}`);
  const ads = (data.campaigns || []).filter((k) => !k.oneOff && k.start && k.start <= end && (!k.end || k.end >= from));
  if (ads.length) reasons.push(`шла реклама: ${ads.map((k) => `«${k.name}»`).join(', ')}`);
  const outs = [...ctx.outages].filter((d) => d >= from && d <= end).length;
  if (outs) reasons.push(`дней сбоя: ${outs}`);
  const board = adBoard(data, settings, today).filter((x) => x.v.kind !== 'wait');
  const todo = [];
  if (end < addDays(today, -3)) todo.push({ k: 'upload', text: `Загрузить выгрузку Литнета — данные только по ${end.slice(8, 10)}.${end.slice(5, 7)}` });
  for (const x of adBoard(data, settings, today)) if (x.reportDue) todo.push({ k: 'report:' + x.c.id, text: `Попросить у таргетолога расход: «${x.c.name}»` });
  const d25 = today.slice(0, 8) + '25';
  if (today <= d25 && countDays(today, d25) <= 7) todo.push({ k: 'budget', text: 'Решить бюджет рекламы на следующий месяц (до 25-го)' });
  return { from, to: end, income, was, delta: was ? income / was - 1 : null, chapters: ch.length, reasons, ads: board.map((x) => ({ name: x.c.name, kind: x.v.kind, text: x.v.text, est: x.v.est })), todo };
}

// ---------- 2. Лучший день выкладки ----------
// Для каждой вышедшей главы: доход книги в день выхода и на следующий — против обычного дня книги (медиана ±14 дней без дней выхода).
// По дням недели — средний прирост. Совет — только если у дня 3+ выхода и он заметно лучше остальных.
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function releaseTiming(data = {}, settings = {}, today) {
  const ctx = adCtx(data, settings, today), books = data.books || [];
  const by = Array.from({ length: 7 }, (_, wd) => ({ wd, n: 0, lift: 0 }));
  let total = 0;
  for (const wb of data.w_books || []) {
    const ib = incomeBookOf(wb, books);
    if (!ib) continue;
    const outs = [...new Set(Object.values(chapterOutDates(wb, today)))].filter((d) => d <= ctx.dataEnd).sort();
    const outSet = new Set(outs.flatMap((d) => [d, addDays(d, 1)]));
    for (const d of outs) {
      const ser = known(incomeSeries(ctx.sales, [], addDays(d, -14), addDays(d, 14), ib.id));
      const base = median(ser.filter((x) => !outSet.has(x.date) && !ctx.outages.has(x.date)).map((x) => x.royalty));
      if (!base || base <= 0) continue;
      const two = ser.filter((x) => x.date === d || x.date === addDays(d, 1));
      if (two.length < 2) continue;
      const lift = (sum(two) / 2) / base - 1;
      by[wdOf(d)].n++; by[wdOf(d)].lift += lift; total++;
    }
  }
  const rows = by.map((x) => ({ ...x, avg: x.n ? x.lift / x.n : null }));
  const ok = rows.filter((x) => x.n >= 3).sort((a, b) => b.avg - a.avg);
  let tip = null;
  if (ok.length >= 2 && ok[0].avg - ok[ok.length - 1].avg >= 0.2) tip = { wd: ok[0].wd, text: `Главы, вышедшие в ${WD_NAMES[ok[0].wd].replace(/а$/, 'у')}, дают продажам больше всего: +${Math.round(ok[0].avg * 100)} % в день выхода и на следующий (по ${ok[0].n} выходам). Хуже всего — ${WD_NAMES[ok[ok.length - 1].wd]}: ${ok[ok.length - 1].avg >= 0 ? '+' : ''}${Math.round(ok[ok.length - 1].avg * 100)} %.` };
  return { rows, total, tip };
}

// ---------- 3. Отдача скидок ----------
// Дни со скидкой — события «Доходов» (type: discount). Подряд идущие дни одной книги — одна скидка.
// Эффект: доход в дни скидки против обычного дня за 14 дней до неё (без дней сбоя и других скидок).
export function discountEffects(data = {}, settings = {}, today) {
  const ctx = adCtx(data, settings, today), dd = [];
  for (const day of data.days || []) for (const e of day.events || []) if (e.type === 'discount' && day.date <= ctx.dataEnd) dd.push({ date: day.date, bookId: e.bookId || null, text: e.text || '' });
  dd.sort((a, b) => a.date.localeCompare(b.date));
  const runs = [];
  for (const x of dd) { const r = runs.find((y) => y.bookId === x.bookId && addDays(y.to, 1) >= x.date && y.to <= x.date); if (r) { r.to = x.date > r.to ? x.date : r.to; } else runs.push({ bookId: x.bookId, from: x.date, to: x.date, text: x.text }); }
  const discDays = new Set(dd.map((x) => x.date));
  return runs.map((r) => {
    const during = known(incomeSeries(ctx.sales, ctx.legacyDays, r.from, r.to, r.bookId));
    const before = known(incomeSeries(ctx.sales, ctx.legacyDays, addDays(r.from, -14), addDays(r.from, -1), r.bookId)).filter((x) => !discDays.has(x.date) && !ctx.outages.has(x.date));
    const a = avg(during), b = avg(before);
    const extra = a != null && b != null ? Math.round((a - b) * during.length) : null;
    return { ...r, book: (data.books || []).find((x) => x.id === r.bookId)?.title || 'все книги', days: during.length, perDay: a == null ? null : Math.round(a), base: b == null ? null : Math.round(b), extra, lift: b ? a / b - 1 : null, enough: before.length >= 5 };
  }).reverse();
}

// ---------- 4. «Хвост» старых книг при выходе новой ----------
// Пока выходит новая книга (от первой главы до сегодня), сколько в день приносят остальные — против 30 дней до её старта.
// Дни, когда у старой книги шла своя реклама, не считаются: иначе прирост был бы от рекламы. По-читательски (кто перешёл) Литнет не отдаёт.
export function cycleTail(data = {}, settings = {}, today) {
  const ctx = adCtx(data, settings, today), books = data.books || [];
  const out = [];
  for (const nw of (data.w_books || []).filter((b) => (b.status || 'progress') === 'progress' && b.publishStart && b.publishStart < ctx.dataEnd)) {
    const start = nw.publishStart, nb = incomeBookOf(nw, books);
    const rows = [];
    for (const ob of books.filter((b) => b.id !== nb?.id && b.status !== 'removed')) {
      const adDay = (d) => (data.campaigns || []).some((k) => !k.oneOff && k.bookId === ob.id && k.start && d >= k.start && d <= (k.end || '9999-12-31'));
      const clean = (xs) => known(xs).filter((x) => !adDay(x.date) && !ctx.outages.has(x.date));
      const before = clean(incomeSeries(ctx.sales, [], addDays(start, -30), addDays(start, -1), ob.id)), after = clean(incomeSeries(ctx.sales, [], start, ctx.dataEnd, ob.id));
      if (before.length < 7 || after.length < 7) continue;
      const a = avg(after), b = avg(before);
      if (!b) continue;
      rows.push({ book: ob.title, before: Math.round(b), after: Math.round(a), lift: a / b - 1, days: after.length });
    }
    if (rows.length) out.push({ book: nw.title, start, rows: rows.sort((x, y) => y.lift - x.lift) });
  }
  return out;
}

// ---------- 6. Успеть дописать к концу конкурса ----------
// Объём книги — план глав (каркас Легенды или «глав по плану») × средняя глава; темп — история знаков за 14 дней.
export function finishPace(book, contest, today) {
  if (!book || !contest?.end || contest.end < today) return null;
  const tabs = (book.tabs || []).filter((t) => t.counted !== false && /^(глава|пролог|эпилог)/i.test(t.title || ''));
  const written = tabs.length, chars = charsAt(book.history || {}, today) ?? book.chars ?? tabs.reduce((a, t) => a + (t.chars || 0), 0);
  const plan = Number(book.planChapters) || (book.legend?.plan || []).filter((p) => p.st !== 'rejected').length || null;
  if (!plan || !written || plan <= written) return plan && written >= plan ? { done: true } : null;
  const target = Math.round(chars / written * plan), left = Math.max(0, target - chars), daysLeft = countDays(today, contest.end) - 1;
  const perDay = daysLeft > 0 ? Math.ceil(left / daysLeft) : left;
  const forecast = forecastDate(book.history || {}, today, target);
  return { plan, written, chars, target, left, daysLeft, perDay, forecast, onTrack: forecast != null && forecast <= contest.end };
}
