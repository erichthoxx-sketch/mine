import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experimentPeriods, bookSales, compareExperiment, EXPERIMENT_TYPES } from '../direct/js/experimentcalc.js';

const campaign = { id: 123, name: 'Черная вдова — поиск', state: 'ON' };
const experiment = { appliedAt: '2026-11-20', campaignId: '123', book: 'Развод для черной вдовы' };
const daily = [
  { date: '2026-11-13', cid: 123, impr: 200, clicks: 20, cost: 250 },
  { date: '2026-11-20', cid: 123, impr: 1000, clicks: 500, cost: 6000 }, // день правки исключается
  { date: '2026-11-21', cid: 123, impr: 300, clicks: 25, cost: 300 },
  { date: '2026-11-21', cid: 456, impr: 5000, clicks: 999, cost: 8000 },
];
const conv = [
  { date: '2026-11-13', cid: 123, conv: { 991: 2 } },
  { date: '2026-11-21', cid: 123, conv: { 991: 3 } },
  { date: '2026-11-21', cid: 456, conv: { 991: 80 } },
];
const sales = [
  { date: '2026-11-13', book: 'Развод для черной вдовы', bookId: 'b123', qty: 2, kind: 'sub', royalty: 130 },
  { date: '2026-11-21', book: 'Развод для черной вдовы', bookId: 'b123', qty: 3, kind: 'sub', royalty: 195 },
  { date: '2026-11-21', book: 'Альпийский развод', bookId: 'b456', qty: 40, kind: 'sale', royalty: 2800 },
  { date: '2026-11-28', book: 'Звериная тропа', bookId: 'b789', qty: 1, kind: 'sale', royalty: 99 },
];
test('Даты эксперимента: 7 дней до и после, сам день правки не учитываем', () => {
  assert.deepEqual(experimentPeriods('2026-11-20'), {
    beforeFrom: '2026-11-13', beforeTo: '2026-11-19',
    afterFrom: '2026-11-21', afterTo: '2026-11-27',
  });
});
test('План без фактической правки не имеет фиктивных результатов', () => {
  assert.equal(compareExperiment({ book: experiment.book, appliedAt: '' }, { today: '2026-11-27' }).state, 'planned');
  assert.equal(compareExperiment(experiment, { today: '2026-11-27' }).state, 'no-campaign');
});
test('Пока прошло мало времени, сравнение нельзя считать завершенным', () => {
  const x = compareExperiment(experiment, { today: '2026-11-23', campaigns: [campaign], daily });
  assert.equal(x.state, 'early');
  assert.equal(x.daysLeft, 5);
});
test('Полную неделю не считаем завершенной до полуночи следующего дня', () => {
  const x = compareExperiment(experiment, { today: '2026-11-27', campaigns: [campaign], daily });
  assert.equal(x.state, 'early');
  assert.equal(x.daysLeft, 1);
});
test('Эксперимент не присваивает расходы и цели другого кабинета / кампании', () => {
  const x = compareExperiment(experiment, {
    today: '2026-11-29', campaigns: [campaign], daily, conversions: conv, goalId: 991, sales,
    directUpdatedAt: '2026-11-28T15:00:00Z', goalsUpdatedAt: '2026-11-28T15:00:00Z',
  });
  assert.equal(x.state, 'comparison');
  assert.equal(x.before.cost, 250);
  assert.equal(x.after.cost, 300);
  assert.equal(x.before.clicks, 20);
  assert.equal(x.after.clicks, 25);
  assert.equal(x.before.conv, 2);
  assert.equal(x.after.conv, 3);
  assert.equal(x.salesBefore.royalty, 130);
  assert.equal(x.salesAfter.royalty, 195);
  assert.equal(x.salesAfter.qty, 3);
  assert.equal(x.salesComplete, true);
  assert.equal(x.hasBaseline, true);
  assert.equal(x.directFresh, true);
  assert.equal(x.goalFresh, true);
});
test('Роялти именно книги: исключаем соседние книги, учитываем черную / чёрную', () => {
  const x = bookSales(sales, 'Развод для чёрной вдовы', '2026-11-20', '2026-11-27');
  assert.equal(x.royalty, 195);
  assert.equal(x.qty, 3);
  assert.equal(x.paidQty, 3);
});
test('Без загруженного конца периода не обещаем полноту доходов', () => {
  const x = compareExperiment(experiment, { today: '2026-11-29', campaigns: [campaign], daily, sales: sales.slice(0,2) });
  assert.equal(x.salesComplete, false);
  assert.equal(x.goalFresh, false);
});
test('Варианты рекламных изменений для начинающей', () => {
  assert.ok(EXPERIMENT_TYPES.some(([id]) => id === 'creative'));
  assert.ok(EXPERIMENT_TYPES.some(([id]) => id === 'budget'));
});
