import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placementRows, qualityAlerts, qualitySummary } from '../direct/js/qualitycalc.js';

const campaigns = [{ id: 111, name: 'Черная вдова', state: 'ON' }, { id: 222, name: 'Другая книга', state: 'ON' }];
const raw = [
  { CampaignId: 111, Placement: 'example-app.ru', AdNetworkType: 'AD_NETWORK', Clicks: 20, Cost: 300, Impressions: 1200, BounceRate: '85' },
  { CampaignId: 111, Placement: 'example-app.ru', AdNetworkType: 'AD_NETWORK', Clicks: 15, Cost: 150, Impressions: 800, BounceRate: '90' },
  { CampaignId: 111, Placement: 'ya.ru', AdNetworkType: 'SEARCH', Clicks: 40, Cost: 450, Impressions: 1000, BounceRate: '30' },
  { CampaignId: 222, Placement: 'other.ru', AdNetworkType: 'AD_NETWORK', Clicks: 60, Cost: 900, Impressions: 2000, BounceRate: '95' },
];

test('Площадки: объединяет строки одной кампании и сохраняет проценты отказов', () => {
  const rows = placementRows(raw, [campaigns[0]]);
  assert.equal(rows.length, 2);
  const network = rows.find(x => x.network === 'network');
  assert.equal(network.place, 'example-app.ru');
  assert.equal(network.clicks, 35);
  assert.equal(network.cost, 450);
  assert.equal(network.bounce, 87.14);
  assert.equal(network.cpc, 12.86);
  assert.equal(rows.find(x => x.network === 'search').bounce, 30);
  assert.equal(qualityAlerts(rows).length, 1);
});

test('Отказы без достаточного числа кликов не считаются сигналом и не объявляются ботами', () => {
  const rows = placementRows([
    { CampaignId: 111, Placement: 'small', AdNetworkType: 'AD_NETWORK', Clicks: 3, Cost: 80, BounceRate: 100, Impressions: 120 },
    { CampaignId: 111, Placement: 'unknown', AdNetworkType: 'AD_NETWORK', Clicks: 99, Cost: 100, BounceRate: '--', Impressions: 1200 },
  ], [campaigns[0]]);
  assert.equal(rows[1].bounce, null);
  assert.deepEqual(qualityAlerts(rows), []);
});

test('Трафик и покупки считаются только по выбранной кампании', () => {
  const daily = [
    { date: '2026-11-21', cid: 111, impr: 2000, clicks: 75, cost: 900 },
    { date: '2026-11-21', cid: 222, impr: 3000, clicks: 200, cost: 1800 },
    { date: '2026-10-10', cid: 111, impr: 100, clicks: 50, cost: 500 },
  ];
  const conv = [
    { date: '2026-11-21', cid: 111, conv: { 123: 3 } },
    { date: '2026-11-21', cid: 222, conv: { 123: 18 } },
  ];
  const s = qualitySummary({ campaigns: [campaigns[0]], daily, conv, placeRows: raw, goalId: 123, from: '2026-11-01', to: '2026-11-30' });
  assert.equal(s.cost, 900);
  assert.equal(s.clicks, 75);
  assert.equal(s.purchases, 3);
  assert.equal(s.paidActionCost, 300);
  assert.equal(s.byNetwork.network.cost, 450);
  assert.equal(s.byNetwork.search.cost, 450);
  assert.equal(s.flags.length, 1);
});

test('Без проверки цели покупки не придумываются', () => {
  const r = qualitySummary({ campaigns: [campaigns[0]], daily: [{ date: '2026-11-21', cid: 111, impr: 100, clicks: 10, cost: 100 }], from: '2026-11-01', to: '2026-11-30' });
  assert.equal(r.purchases, null);
  assert.equal(r.paidActionCost, null);
});

test('Неизвестные площадки других кампаний не загрязняют аудит', () => {
  const rows = placementRows(raw, []);
  assert.deepEqual(rows, []);
});
