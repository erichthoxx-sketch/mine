import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPlan, AUTO_MAX } from '../direct/js/autorules.js';

const main = { campaigns: [{ id: 7, name: 'ЕПК', state: 'ON', negatives: ['фильм'] }, { id: 8, name: 'Стоит', state: 'OFF', negatives: [] }], groups: [{ cid: 7, negatives: ['аудиокнига'] }], ads: [], keywords: [] };
const stats = {
  queries: [{ query: 'развод роман скачать fb2', cid: 7, impr: 40, clicks: 4, cost: 3 }, { query: 'роман слушать аудиокнига', cid: 7, impr: 30, clicks: 5, cost: 2 }, { query: 'роман скачать', cid: 8, impr: 30, clicks: 5, cost: 2 }, { query: 'любовный роман фильм', cid: 7, impr: 9, clicks: 3, cost: 1 }],
  placements: [{ CampaignId: 7, Placement: 'game.app.com', AdNetworkType: 'AD_NETWORK', Impressions: 900, Clicks: 40, Cost: 5, BounceRate: 80 }, { CampaignId: 7, Placement: 'dzen.ru', AdNetworkType: 'AD_NETWORK', Impressions: 900, Clicks: 60, Cost: 9, BounceRate: 12 }],
};
const goal = { do: 'goal', campaign: 7, goal: 548467220, goalName: 'Покупка книги', why: 'началась подписка' };

test('автоправила: только включённые, только идущие кампании, без повторов', () => {
  assert.deepEqual(autoPlan({ main, stats, on: {}, today: '2026-11-12', goalActs: [goal] }), []);
  const all = autoPlan({ main, stats, on: { minus: true, places: true, fatigue: true, goal: true }, today: '2026-11-12', goalActs: [goal] });
  assert.equal(all[0].rule, 'goal');
  const minus = all.filter((x) => x.rule === 'minus');
  assert.ok(minus.length >= 1 && minus.every((x) => x.act.campaign === 7 && x.act.do === 'minus')); // остановленная кампания не трогается
  assert.ok(!minus.some((x) => ['фильм', 'аудиокнига'].includes(x.act.phrases[0]))); // уже в минус-словах кампании или группы
  const pl = all.find((x) => x.rule === 'places');
  assert.deepEqual(pl.places, ['game.app.com']); assert.equal(pl.cid, 7);
  // уже сделанное не повторяется
  const again = autoPlan({ main, stats, on: { minus: true, places: true, goal: true }, today: '2026-11-12', goalActs: [goal], done: [...all.map((x) => x.key), ...all.flatMap((x) => x.keys || [])] });
  assert.deepEqual(again, []);
  assert.ok(all.length <= AUTO_MAX);
});
