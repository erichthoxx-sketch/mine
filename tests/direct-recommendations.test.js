import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignRecommendations } from '../direct/js/recommendations.js';
import { applyRecommendation } from '../direct/js/recommendation-actions.js';

const today = '2026-11-24', at = today + 'T09:00:00Z';
const row = { camp: { id: 8, state: 'ON', start: '2026-11-01' }, goals: { lib: '1', buy: ['2'] }, convReady: true };
const query = (query, conv = {}) => ({ cid: 8, query, clicks: 40, cost: 200, conv });
const place = (Placement, conv) => ({ Placement, CampaignId: 8, AdNetworkType: 'AD_NETWORK',
  Clicks: 175, Cost: 500, BounceRate: 90, Conversions_1_LSCCD: conv });
const main = { ads: [10, 11, 12].map((id) => ({ id, cid: 8, gid: 1, state: 'ON', status: 'ACCEPTED' })) };
const stats = { mAt: at, adGoalsAt: at, placementAt: at, queryGoalsReady: true, goalIds: ['1', '2'],
  placements: [place('keep.example', 1), place('exclude.example', 0)],
  queries: [query('драконы скачать epub'), query('роман бесплатно'), query('скачать роман'), query('роман скачать', { 1: 1 })],
  adDaily: [10, 11, 12].map((aid) => ({ aid, cid: 8, net: 's', date: '2026-11-15',
    clicks: 150, impr: 2000, cost: 800, goalMeasured: true, goals: { 1: aid === 12 ? 0 : 20, 2: 0 } })) };
const plan = (overrides = {}) => campaignRecommendations({ row, main, stats, today, now: Date.parse(at), ...overrides });

test('Предложения одной кампании защищают рабочие запросы и площадки, требуют отчёта по цели', () => {
  const { items } = plan();
  assert.deepEqual(items.map((x) => x.key), ['pause:12', 'place:exclude.example', 'minus:драконы скачать epub']);
  assert.equal(items.at(-1).target, '"драконы скачать epub"');
  assert.ok(items.every((x) => x.reviewDate === '2026-12-02' && x.goal === '1'));
  assert.equal(plan({ stats: { ...stats, mErr: 'Сбой' } }).items.length, 0);
  assert.equal(plan({ row: { ...row, subStart: '2026-11-22' } }).next, '2026-11-29');
  assert.ok(!plan({ stats: { ...stats, adGoalsAt: null } }).items.some((x) => x.type === 'pause'));
});

test('Одобренное исключение дописывается к живому списку, проверяется и записывается в журнал', async (t) => {
  let places = ['existing.example'], writes = 0;
  const logs = [], settings = { directToken: 'test', direct: { proxy: 'https://example.invalid' } };
  const app = { ctx: () => ({ settings }), store: { user: { uid: 'demo-test' }, put: async (coll, log) => logs.push(log) } };
  t.mock.method(globalThis, 'fetch', async (_, req) => {
    const { method, params } = JSON.parse(req.body);
    if (method === 'get') return Response.json({ result: { Campaigns: [{ Id: 8, State: 'ON', ExcludedSites: { Items: places } }] } });
    writes++;
    places = params.Campaigns[0].ExcludedSites.Items;
    return Response.json({ result: { UpdateResults: [{ Id: 8 }] } });
  });
  const item = plan().items.find((x) => x.type === 'place');
  assert.match((await applyRecommendation(app, item)).status, /Применено и проверено/);
  assert.deepEqual(places, ['existing.example', 'exclude.example']);
  assert.equal(logs[0].reviewGoal, '1');
  assert.match((await applyRecommendation(app, item)).status, /Уже действует/);
  assert.equal(writes, 1);
  assert.equal(logs.length, 1);
});

test('Последнее активное объявление остаётся включённым, отказ виден в журнале', async (t) => {
  const logs = [], settings = { directToken: 'test', direct: { proxy: 'https://example.invalid' } };
  const app = { ctx: () => ({ settings }), store: { put: async (coll, log) => logs.push(log) } };
  t.mock.method(globalThis, 'fetch', async (url, req) => {
    assert.equal(JSON.parse(req.body).method, 'get');
    return Response.json({ result: url.endsWith('/campaigns')
      ? { Campaigns: [{ Id: 8, State: 'ON' }] }
      : { Ads: [{ Id: 12, CampaignId: 8, AdGroupId: 1, State: 'ON', Status: 'ACCEPTED' }] } });
  });
  assert.match((await applyRecommendation(app, plan().items[0])).status, /ещё один работающий/);
  assert.equal(logs[0].ok, false);
});
