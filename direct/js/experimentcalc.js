// Журнал рекламных решений: наблюдаемые изменения, но не доказанная причинность.
import { addDays, bookIdFor } from '../../js/calc.js';
import { goalTotals } from './dcalc.js';

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const normalizeTitle = (text) => String(text || '').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');

export const EXPERIMENT_TYPES = [
  ['creative', 'Объявление или обложка'],
  ['keywords', 'Поисковые фразы / минус-фразы'],
  ['audience', 'Аудитория или география'],
  ['strategy', 'Стратегия или площадка показа'],
  ['budget', 'Бюджет или ограничение'],
  ['other', 'Другое изменение'],
];
export const EXPERIMENT_DAYS = 7;

export function bookSales(sales = [], bookTitle, from, to) {
  const needle = normalizeTitle(bookTitle);
  let royalty = 0, qty = 0, paidQty = 0, rows = 0;
  for (const x of sales) {
    if (!x.date || x.date < from || x.date > to) continue;
    if (!needle || (normalizeTitle(x.book) !== needle && x.bookId !== bookIdFor(bookTitle))) continue;
    royalty += Number(x.royalty) || 0;
    qty += Number(x.qty) || 0;
    if (x.kind === 'sub') paidQty += Number(x.qty) || 0;
    rows++;
  }
  return { royalty: round(royalty), qty, paidQty, rows };
}

export function experimentPeriods(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return {
    beforeFrom: addDays(date, -EXPERIMENT_DAYS), beforeTo: addDays(date, -1),
    afterFrom: addDays(date, 1), afterTo: addDays(date, EXPERIMENT_DAYS),
  };
}
export function compareExperiment(experiment, {
  today, campaigns = [], daily = [], conversions = [], goalId = null, sales = [],
  directUpdatedAt = null, goalsUpdatedAt = null,
} = {}) {
  if (!experiment?.appliedAt) return { state: 'planned' };
  const p = experimentPeriods(experiment.appliedAt);
  if (!p || !today || !experiment.campaignId) return { state: 'no-campaign' };
  const isKnown = campaigns.some(x => String(x.id) === String(experiment.campaignId));
  if (!isKnown) return { state: 'no-campaign', periods: p };
  const cid = Number(experiment.campaignId);
  const main = { cid, goals: goalId ? [goalId] : [] };
  const before = goalTotals(daily, goalId ? conversions : [], p.beforeFrom, p.beforeTo, main);
  const after = goalTotals(daily, goalId ? conversions : [], p.afterFrom, p.afterTo, main);
  const lastImportedSale = sales.reduce((m, x) => x.date && x.date > m ? x.date : m, '');
  const firstImportedSale = sales.reduce((m, x) => x.date && (!m || x.date < m) ? x.date : m, '');
  const salesBefore = bookSales(sales, experiment.book, p.beforeFrom, p.beforeTo);
  const salesAfter = bookSales(sales, experiment.book, p.afterFrom, p.afterTo);
  // Полная неделя заканчивается в полночь дня, следующего за последним днем периода.
  const completeFrom = addDays(p.afterTo, 1);
  const fullWindow = today >= completeFrom;
  const directFresh = !!directUpdatedAt && Date.parse(directUpdatedAt) >= Date.parse(completeFrom + 'T00:00:00Z');
  const goalFresh = !!goalId && !!goalsUpdatedAt && Date.parse(goalsUpdatedAt) >= Date.parse(completeFrom + 'T00:00:00Z');
  const salesComplete = !!lastImportedSale && lastImportedSale >= p.afterTo;
  const hasBaseline = before.clicks >= 20 && after.clicks >= 20;
  return {
    state: fullWindow ? 'comparison' : 'early',
    periods: p, before, after,
    salesBefore, salesAfter,
    daysLeft: fullWindow ? 0 : Math.max(1, Math.round((Date.parse(completeFrom + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)),
    lastImportedSale, firstImportedSale,
    directFresh, goalFresh, salesComplete, hasBaseline,
    costDelta: round(after.cost - before.cost),
    clicksDelta: after.clicks - before.clicks,
    // Не называем эти разницы инкрементальной прибылью от рекламы.
    salesDelta: round(salesAfter.royalty - salesBefore.royalty),
  };
}
