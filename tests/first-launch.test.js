import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_LAUNCH, firstLaunchOf, purchaseGoal, launchReadiness, launchMetrics } from '../direct/js/launchcalc.js';

const metrika = { goals: [{ id: 100, name: 'Начало покупки' }, { id: 101, name: 'Покупка книги' }], main: [101] };
const complete = {
  ...FIRST_LAUNCH, subscriptionOpen: true, subscriptionDate: '2026-11-20',
  goalVerified: true, hypothesis: 'Гипотеза первой кампании', creativeReady: true,
  limitVerified: true, campaignId: '123', budget: 10000, royalty: 90,
};
const campaigns = [{ id: 123, name: 'Черная вдова — первая', state: 'ON' }];

test('Первый запуск не начинается 1 ноября и не наследует дату старых кампаний', () => {
  const fl = firstLaunchOf({ direct: { testFrom: '2026-11-01', testBudget: 50000 } });
  assert.equal(fl.prepDate, '2026-11-01');
  assert.equal(fl.publicationDate, '2026-11-09');
  assert.equal(fl.actualStart, '');
  assert.equal(fl.budget, 10000);
  assert.equal(launchMetrics(fl, { today: '2026-11-15' }).spent, 0);
});

test('Конверсии начала покупки не считаются подтвержденными покупками', () => {
  assert.equal(purchaseGoal(metrika).id, 101);
  assert.equal(purchaseGoal({ ...metrika, main: [100] }), null);
  assert.equal(purchaseGoal({ ...metrika, main: [100, 101] }), null);
  assert.equal(purchaseGoal({ ...metrika, main: [] }), null);
});

test('До подписки и проверки условий запуск не готов', () => {
  const before = launchReadiness({ ...complete, subscriptionOpen: false }, { today: '2026-11-21', metrika, campaigns });
  assert.equal(before.ready, false);
  const future = launchReadiness(complete, { today: '2026-11-15', metrika, campaigns });
  assert.equal(future.ready, false);
  const paused = launchReadiness(complete, { today: '2026-11-21', metrika, campaigns: [{ ...campaigns[0], state: 'SUSPENDED' }] });
  assert.equal(paused.ready, false);
  const ready = launchReadiness(complete, { today: '2026-11-21', metrika, campaigns });
  assert.equal(ready.ready, true);
  assert.equal(ready.checks.length, 5);
});

test('Статистика первого теста учитывает только выбранную кампанию и дату запуска', () => {
  const cfg = { ...complete, actualStart: '2026-11-21' };
  const daily = [
    { date: '2026-11-20', cid: 123, cost: 999, clicks: 99, impr: 1000 },
    { date: '2026-11-21', cid: 123, cost: 300, clicks: 15, impr: 300 },
    { date: '2026-11-21', cid: 456, cost: 1000, clicks: 75, impr: 2000 },
    { date: '2026-11-22', cid: 123, cost: 150, clicks: 10, impr: 100 },
  ];
  const conv = [
    { date: '2026-11-20', cid: 123, conv: { 101: 8 } },
    { date: '2026-11-21', cid: 123, conv: { 100: 3, 101: 2 } },
    { date: '2026-11-21', cid: 456, conv: { 101: 12 } },
    { date: '2026-11-22', cid: 123, conv: { 101: 1 } },
  ];
  const r = launchMetrics(cfg, { daily, conv, today: '2026-11-22', goalId: 101 });
  assert.equal(r.spent, 450);
  assert.equal(r.balance, 9550);
  assert.equal(r.clicks, 25);
  assert.equal(r.conversions, 3);
  assert.equal(r.cpa, 150);
  assert.equal(r.estimate, 270);
  assert.equal(r.estimatedProfit, -180);
});

test('Без подтвержденной цели или роялти нет ложного расчета прибыли', () => {
  const cfg = { ...complete, actualStart: '2026-11-21', royalty: '' };
  const daily = [{ date: '2026-11-21', cid: 123, cost: 90, clicks: 6, impr: 99 }];
  const conv = [{ date: '2026-11-21', cid: 123, conv: { 101: 2 } }];
  const noGoal = launchMetrics(cfg, { daily, conv, today: '2026-11-21' });
  assert.equal(noGoal.conversions, null);
  assert.equal(noGoal.estimate, null);
  const goal = launchMetrics(cfg, { daily, conv, today: '2026-11-21', goalId: 101 });
  assert.equal(goal.conversions, 2);
  assert.equal(goal.estimate, null);
  assert.equal(goal.estimatedProfit, null);
});

test('План запуска: даты из Мастерской и сайта, фазы, цели, ценность библиотеки, напоминания', async () => {
  const L = await import('../direct/js/launchcalc.js');
  const m = { goals: [{ id: 1, name: 'Добавление в библиотеку' }, { id: 2, name: 'Начало покупки книги' }, { id: 3, name: 'Покупка книги' }], main: [3] };
  const cfg = L.firstLaunchOf({});
  const wbooks = [{ title: 'Развод для чёрной вдовы', publishStart: '2026-11-09' }];
  const siteBooks = [{ title: 'Развод для черной вдовы', startDate: '2026-11-23', litnet: 'https://litnet.com/ru/book/razvod-b1' }];
  const p0 = L.launchPlan(cfg, { today: '2026-11-01', wbooks, siteBooks, metrika: m, royalty: 120, mkTotals: { lib: 400, buy: 60 } });
  assert.equal(p0.phase, 'prep'); assert.equal(p0.pubDate, '2026-11-09'); assert.equal(p0.subDate, '2026-11-23'); assert.equal(p0.src.sub, 'site');
  assert.equal(p0.bookUrl, 'https://litnet.com/ru/book/razvod-b1');
  assert.equal(p0.lib.id, 1); assert.equal(p0.buy.id, 3); // «Начало покупки» — не покупка
  assert.equal(p0.libValue.value, 18); assert.ok(p0.libValue.measured); // 60/400 = 15 % × 120 ₽
  assert.equal(p0.money.freeBudget + p0.money.paidBudget, 10000); assert.equal(p0.money.freeDays, 14);
  assert.ok(p0.steps.prep.find((s) => s.id === 'goals').ok); assert.ok(p0.steps.prep.find((s) => s.id === 'url').ok);
  assert.equal(L.launchPlan(cfg, { today: '2026-11-10', wbooks, siteBooks, metrika: m }).phase, 'free');
  assert.equal(L.launchPlan(cfg, { today: '2026-11-23', wbooks, siteBooks, metrika: m }).phase, 'paid');
  // своё в плане главнее; без даты подписки — бесплатные главы идут дальше
  const own = L.launchPlan({ ...cfg, subscriptionDate: '2026-11-30', publicationDate: '2026-11-10', pubManual: true }, { today: '2026-11-25', wbooks, siteBooks, metrika: m });
  assert.equal(own.subDate, '2026-11-30'); assert.equal(own.pubDate, '2026-11-10'); assert.equal(own.phase, 'free');
  assert.equal(L.launchPlan(cfg, { today: '2026-12-20', wbooks, siteBooks: [], metrika: m }).phase, 'free');
  // мало данных в Метрике — осторожные 15 %
  assert.equal(L.libraryValue({ libN: 5, buyN: 1, royalty: 100 }).measured, false);
  const ms = L.launchMilestones(p0).map((x) => x.date);
  assert.deepEqual(ms, ['2026-11-06', '2026-11-09', '2026-11-23', '2026-12-07']);
});
