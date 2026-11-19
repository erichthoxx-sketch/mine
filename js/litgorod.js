// «Литгород» — подраздел Рынка Литнета (19.11.2026, её просьба: «какие книги дублировать на Литгород и когда, какие не дублировать — на основе аналитики»).
// Решение по каждой книге — из её же продаж на Литнете: пока книга на пике, выкладка в другом месте может отнять у Литнета покупателей;
// когда пик прошёл, Литгород даёт вторую волну. Эксклюзив Литнета — нельзя. После выкладки считаем, что случилось с Литнетом
// (28 дней до и после) и сколько принёс Литгород, — так совет с каждой книгой опирается на её собственную историю. Чистые функции; тест — tests/litgorod.test.js.
import { addDays } from './calc.js';

const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const isLitnet = (s) => !s.platform || low(s.platform) === 'литнет';
const isLitgorod = (s) => low(s.platform) === 'литгород';
const sum = (rows, from, to) => rows.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + (Number(s.royalty) || 0), 0);

// Продажи книги: по названию (в выгрузке после названия бывает добавка — «Книга. Часть 1»)
export const salesOfBook = (sales, title) => { const t = low(title); return t ? (sales || []).filter((s) => { const b = low(s.book); return b === t || b.startsWith(t + ' ') || b.startsWith(t + '.') || b.startsWith(t + ':'); }) : []; };

// Пик и сейчас: лучшие 14 дней подряд против последних 14 (по роялти Литнета)
export function salesPhase(rows, today) {
  const lit = rows.filter(isLitnet);
  if (!lit.length) return null;
  const first = lit.map((s) => s.date).sort()[0];
  let peak = 0, peakTo = first;
  for (let d = addDays(first, 13); d <= today; d = addDays(d, 1)) { const v = sum(lit, addDays(d, -13), d); if (v > peak) { peak = v; peakTo = d; } }
  if (!peak) peak = sum(lit, first, today);
  const now = sum(lit, addDays(today, -13), today);
  return { first, age: Math.round((Date.parse(today) - Date.parse(first)) / 864e5), peak, peakTo, now, ratio: peak ? now / peak : null };
}

// Что случилось после выкладки: Литнет в неделю до и после (по 28 дней), Литгород в неделю — если продажи Литгорода есть в выгрузке
export function dupEffect(rows, at, today) {
  const after = Math.round((Date.parse(today) - Date.parse(at)) / 864e5);
  if (after < 14) return { at, after, ready: false };
  const span = Math.min(28, after), lit = rows.filter(isLitnet), lg = rows.filter(isLitgorod);
  const before = sum(lit, addDays(at, -span), addDays(at, -1)) / span * 7, then = sum(lit, at, addDays(at, span - 1)) / span * 7;
  const lgWeek = lg.length ? sum(lg, at, today) / (after + 1) * 7 : null;
  return { at, after, ready: true, span, before, then, change: before ? then / before - 1 : null, lgWeek };
}

// Совет по каждой книге: no — нельзя (эксклюзив), done — уже там, later — ещё выходит, wait — на пике, go — пора
export function litgorodPlan({ wbooks = [], sales = [], today, excl = [], dup = {}, priceOf = () => 0 } = {}) {
  const ex = new Set(excl.map(low));
  return wbooks.filter((b) => b.status === 'progress' || b.status === 'done').map((b) => {
    const rows = salesOfBook(sales, b.title), ph = salesPhase(rows, today), at = dup[b.id] || null, already = !!at || (b.platforms || []).includes('Литгород');
    const price = priceOf(b.title), minPrice = price ? Math.ceil(price / 1.05) : null, pc = (v) => Math.round(v * 100) + ' %';
    let k, text;
    if (ex.has(low(b.title))) { k = 'no'; text = 'На Литнете у книги эксклюзив: пока он действует, выкладывать её на других площадках нельзя. Проверьте срок в договоре эксклюзива.'; }
    else if (already) { k = 'done'; text = at ? 'Выложена на Литгороде.' : 'Отмечена как выложенная на Литгороде (в «Мастерской»), дата неизвестна — отметьте её здесь, и я посчитаю, что это дало.'; }
    else if (b.status === 'progress') { k = 'later'; text = ph ? `Книга ещё выходит. Сейчас продажи за 2 недели — ${pc(ph.ratio)} от лучших. Пока идут главы, читатели и реклама работают на подписку Литнета — решать про Литгород лучше после завершения, когда пройдёт пик.` : 'Книга ещё выходит, продаж пока нет — решать про Литгород лучше после завершения, когда пройдёт пик продаж на Литнете.'; }
    else if (!ph) { k = 'go'; text = 'Завершена, продаж на Литнете за всё время в выгрузке нет — Литнету она сейчас ничего не приносит, на Литгороде терять нечего.'; }
    else if (ph.age < 21 || ph.ratio >= 0.5) { k = 'wait'; text = `Ещё на пике: последние 2 недели — ${pc(ph.ratio)} от лучших двух недель (${ph.peakTo.slice(8, 10)}.${ph.peakTo.slice(5, 7)}). Подождите, пока продажи опустятся до трети от пика: тогда вторая площадка почти не отнимет у Литнета.`; }
    else if (ph.ratio > 0.35 && ph.age < 90) { k = 'soon'; text = `Пик прошёл: сейчас ${pc(ph.ratio)} от лучших двух недель. Ещё немного — и пора; можно уже готовить страницу на Литгороде.`; }
    else { k = 'go'; text = `Продажи на Литнете — ${pc(ph.ratio)} от лучших двух недель${ph.age >= 90 ? `, книге ${ph.age} ${ph.age % 10 === 1 && ph.age % 100 !== 11 ? 'день' : [2, 3, 4].includes(ph.age % 10) && ![12, 13, 14].includes(ph.age % 100) ? 'дня' : 'дней'}` : ''}. Литгород даст вторую волну и меньше всего отнимет у Литнета именно сейчас.`; }
    return { id: b.id, title: b.title, status: b.status, k, text, phase: ph, at, effect: at ? dupEffect(rows, at, today) : null, price, minPrice, order: { go: 0, soon: 1, done: 2, wait: 3, later: 4, no: 5 }[k] };
  }).sort((a, b) => a.order - b.order || (b.phase?.peak || 0) - (a.phase?.peak || 0));
}

// Сводка по уже выложенным: в среднем что стало с Литнетом и сколько дал Литгород — растёт вместе с её историей
export function dupSummary(plan) {
  const ready = plan.filter((x) => x.effect?.ready && x.effect.change != null);
  if (!ready.length) return null;
  const avg = ready.reduce((a, x) => a + x.effect.change, 0) / ready.length, lg = ready.filter((x) => x.effect.lgWeek != null);
  return { n: ready.length, change: avg, lgWeek: lg.length ? lg.reduce((a, x) => a + x.effect.lgWeek, 0) / lg.length : null };
}
