import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionEvidence, missingConversionsDuringSpend } from '../direct/js/evidence.js';
import { placementRows, autoPlacementCandidates } from '../direct/js/qualitycalc.js';
import { autoPlan, approvalQueue } from '../direct/js/autorules.js';
import { campaignEcon, campaignPayback } from '../direct/js/pult.js';
import { marketInsights } from '../js/market.js';

test('Свежесть конверсий — нельзя выдавать старые или ошибочные цели за актуальные', () => {
  const now = Date.parse('2026-11-14T22:00:00Z');
  assert.equal(conversionEvidence({ mAt: '2026-11-14T12:00:00Z' }, '2026-11-14', { now }).ready, true);
  assert.equal(conversionEvidence({ mAt: '2026-11-10T12:00:00Z' }, '2026-11-14', { now }).ready, false);
  assert.equal(conversionEvidence({ mAt: '2026-11-14T12:00:00Z', mErr: '500 Яндекс' }, '2026-11-14', { now }).ready, false);
  assert.equal(conversionEvidence({}, '2026-11-14', { now }).ready, false);
  assert.equal(missingConversionsDuringSpend([{ date: '2026-10-21', cid: 7, cost: 100 }], '2026-10-01', '2026-10-31', new Set(['2026-10-21']), 7), true);
});

const placement = (overrides = {}) => ({
  CampaignId: 7, Placement: 'game.example.ru', AdNetworkType: 'AD_NETWORK',
  Impressions: 3500, Clicks: 200, Cost: 700, BounceRate: 90,
  Conversions_548467215_LSCCD: 0, Conversions_548467220_LSCCD: 0, ...overrides,
});

test('Площадка с 90 % отказов, но хотя бы одной покупкой или библиотекой — не блокировать', () => {
  const campaigns = [{ id: 7, state: 'ON' }], at = '2026-11-14T10:00:00Z', today = '2026-11-14';
  const withBuy = placementRows([placement({ Conversions_548467220_LSCCD: 1 })], campaigns);
  assert.equal(withBuy[0].conv, 1);
  assert.deepEqual(autoPlacementCandidates(withBuy, { reportAt: at, today }), []);

  const missing = placement({}); delete missing.Conversions_548467215_LSCCD; delete missing.Conversions_548467220_LSCCD;
  assert.deepEqual(autoPlacementCandidates(placementRows([missing], campaigns), { reportAt: at, today }), []);

  const bad = placementRows([placement()], campaigns);
  assert.equal(autoPlacementCandidates(bad, { reportAt: at, today }).length, 1);
  assert.equal(autoPlacementCandidates(bad, { reportAt: '2026-11-11T10:00:00Z', today }).length, 0);
  assert.equal(autoPlacementCandidates(placementRows([placement({ Clicks: 75 })], campaigns), { reportAt: at, today }).length, 0);
});

test('Минус-слова требуют подтверждённого отчёта и не блокируют конвертирующие запросы', () => {
  const main = { campaigns: [{ id: 7, state: 'ON', negatives: [] }], groups: [], ads: [] };
  const query = (text, conv) => ({ cid: 7, query: text, impr: 70, clicks: 5, cost: 14, ...(conv ? { conv } : {}) });
  const today = new Date().toISOString().slice(0, 10);
  const stats = { mAt: new Date().toISOString(), queryGoalsReady: true, queries: [
    query('скачать книгу бесплатно', { '548467220': 1 }),
    query('скачать книгу полностью'),
    query('слушать аудиокнигу бесплатно'),
    query('фильм по роману'),
  ] };
  const plan = autoPlan({ main, stats, on: { minus: true }, today });
  assert.equal(plan.some((p) => p.rule === 'minus' && p.act.phrases.includes('скачать')), false);
  assert.ok(!plan.some((p) => p.act.phrases.includes('бесплатно')));
  assert.ok(plan.some((p) => p.act.phrases.includes('фильм')));
  assert.deepEqual(autoPlan({ main, stats: { ...stats, queryGoalsReady: false }, on: { minus: true }, today }), []);
});

test('Смена цели — только в очереди ручного подтверждения', () => {
  const goal = { do: 'goal', campaign: 7, goal: 548467220, goalName: 'Покупка книги' };
  const main = { campaigns: [{ id: 7, state: 'ON' }] };
  assert.equal(autoPlan({ main, stats: {}, on: { goal: true }, today: '2026-11-14', goalActs: [goal] }).length, 0);
  assert.equal(approvalQueue({ main, stats: {}, on: { goal: true }, today: '2026-11-14', goalActs: [goal] })[0].rule, 'goal');
});

test('Нельзя считать 0 покупок или окупаемость на устаревших целях и сбое с расходом', () => {
  const camp = { id: 7, start: '2026-10-20' }, today = '2026-11-14';
  const goals = { lib: '1', buy: ['2'] }, daily = [
    { cid: 7, date: '2026-10-21', cost: 100, clicks: 20, impr: 1000 },
    { cid: 7, date: '2026-11-13', cost: 100, clicks: 20, impr: 1000 },
  ], conv = [{ cid: 7, date: '2026-11-13', conv: { 1: 3, 2: 1 } }];
  const old = campaignEcon(camp, { daily, conv, today, goals, perSale: 90, convVerified: false });
  assert.equal(old.verdict.kind, 'wait'); assert.equal(old.cpaBuy, null);
  const duringOutage = campaignEcon(camp, { daily, conv, today, goals, perSale: 90, skip: new Set(['2026-10-21']) });
  assert.equal(duringOutage.verdict.kind, 'wait');
  const pay = campaignPayback(camp, { daily, conv, today, goals, perSale: 90, skip: new Set(['2026-10-21']) });
  assert.equal(pay.total, null);
});

test('Рынок: несопоставимые источники не создают ложный рост тропов', () => {
  const b = { '1': { t: 'Книга 1', a: 'А', tr: ['Развод'] }, '2': { t: 'Книга 2', a: 'Б', tr: ['Босс'] } };
  const row = (id) => ({ id, l: 500, v: 10000, p: 139, g: 200 });
  const m = marketInsights({ books: b, days: {
    '2026-11-07': { romance: [row('1')] },
    '2026-11-14': { romance: [row('1')], best: [row('2')] },
  } });
  assert.equal(m.prevDate, null);
  assert.equal(m.movers.length, 0);
});

test('Исправление отчёта на ноль удаляет старую покупку в обновлённом периоде', async () => {
  const { convRows, mergeDaily } = await import('../direct/js/dcalc.js');
  const old = [
    { date: '2026-10-01', cid: 7, conv: { 21: 2 } },
    { date: '2026-11-08', cid: 7, conv: { 21: 5 } },
  ];
  const fresh = convRows([{ Date: '2026-11-08', CampaignId: 7, Conversions_21_LSCCD: 0 }]);
  assert.deepEqual(mergeDaily(old, fresh, 400, '2026-11-10', '2026-11-01'), [old[0]]);
});
