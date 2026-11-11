import test from 'node:test';
import assert from 'node:assert/strict';
import { weekReview, reviewPeriod, weekKeyOf } from '../direct/js/weekreview.js';

const camp = { id: 7, name: 'ЕПК', state: 'ON', status: 'ACCEPTED', start: '2026-11-01', cpa: 8, negatives: [], strategy: { search: 'PAY_FOR_CONVERSION', network: 'NETWORK_DEFAULT' } };
const goals = { lib: '548467215', buy: ['548467220'] };
const day = (date, cost, impr, clicks) => ({ date, cid: 7, impr, clicks, cost });

test('разбор недели: период — 7 полных дней по вчера, у молодой кампании — со старта и без «прошлой недели»', () => {
  assert.deepEqual(reviewPeriod(camp, '2026-11-16'), { from: '2026-11-09', to: '2026-11-15', days: 7, prevFrom: '2026-11-02', prevTo: '2026-11-08', hasPrev: true });
  const y = reviewPeriod({ ...camp, start: '2026-11-10' }, '2026-11-12');
  assert.equal(y.days, 2); assert.equal(y.hasPrev, false);
  assert.equal(reviewPeriod({ ...camp, start: '2026-11-12' }, '2026-11-12'), null);
  assert.equal(weekKeyOf('2026-11-12'), '2026-11-09');
});

test('разбор недели: цифры, сравнение, выводы и дела', () => {
  const daily = [], conv = [], adDaily = [];
  for (let i = 2; i <= 15; i++) {
    const d = `2026-11-${String(i).padStart(2, '0')}`, late = i >= 9;
    daily.push(day(d, late ? 100 : 60, 5000, late ? 100 : 200));
    conv.push({ date: d, cid: 7, conv: { 548467215: late ? 10 : 10 } });
    adDaily.push({ date: d, cid: 7, aid: 1, net: 'n', impr: 3000, clicks: late ? 80 : 150, cost: 50 }, { date: d, cid: 7, aid: 2, net: 'n', impr: 1900, clicks: 18, cost: 40 }, { date: d, cid: 7, aid: 1, net: 's', impr: 100, clicks: 2, cost: 10 });
  }
  const ads = [{ id: 1, cid: 7, state: 'ON', status: 'ACCEPTED', title: 'Крючок А' }, { id: 2, cid: 7, state: 'ON', status: 'ACCEPTED', title: 'Крючок Б' }];
  const queries = [{ query: 'любовный роман скачать fb2', cid: 7, impr: 50, clicks: 5, cost: 3 }, { query: 'любовные романы про развод', cid: 7, impr: 90, clicks: 9, cost: 9 }];
  const places = [{ cid: 7, place: 'game.app', clicks: 40, bounce: 70, cost: 5, impr: 900 }, { cid: 7, place: 'dzen.ru', clicks: 60, bounce: 15, cost: 9, impr: 2000 }];
  const R = weekReview({ camp, daily, conv, adDaily, ads, queries, places, goals, today: '2026-11-16', libValue: 30, perSale: 100 });
  assert.equal(R.now.cost, 700); assert.equal(R.now.lib, 70); assert.equal(R.now.cpaLib, 10);
  assert.ok(Math.abs(R.delta.cpaLib - (10 - 6) / 6) < 1e-9); assert.equal(R.delta.clicks, -0.5);
  assert.deepEqual(R.nets.map((x) => x.k), ['n', 's']);
  assert.equal(R.best.title, 'Крючок А'); assert.equal(R.worst.title, 'Крючок Б');
  const notes = R.notes.map((x) => x.text).join(' | ');
  assert.match(notes, /Из 100 кликов в библиотеку добавляют 10,0/);
  assert.match(notes, /стоит 10 ₽, а приносит в среднем ≈ 30 ₽ роялти — реклама в плюсе/);
  assert.match(notes, /подорожало на 67 %/); assert.match(notes, /CTR упал на 50 %/);
  assert.deepEqual(R.todo.map((x) => x.k), ['fresh', 'ads', 'weak-2', 'minus', 'places']);
  assert.match(R.todo.at(-1).text, /game\.app/);
  // добавление дороже ценности — совет снизить цену цели
  assert.ok(weekReview({ camp, daily, conv, adDaily, ads, queries: [], places: [], goals, today: '2026-11-16', libValue: 6 }).todo.some((x) => x.k === 'cpaDown' && /до 4 ₽/.test(x.text)));
});

test('что если: экономика при своей цене цели и объёме; честный тест объявлений', async () => {
  const { whatIf, weekReview } = await import('../direct/js/weekreview.js');
  const w = whatIf({ cpa: 10, perWeek: 100, libValue: 30, weekLimit: 1000 });
  assert.equal(Math.round(w.cost), 1220); assert.equal(w.royalty, 3000); assert.equal(Math.round(w.profit), 1780);
  assert.equal(w.maxCpa, 24); assert.equal(w.over, true); assert.equal(w.fits, 81);
  assert.equal(whatIf({ cpa: 10, perWeek: 5 }).profit, null);
  const mk = (c1, c2, impr) => { const adDaily = []; for (let i = 9; i <= 15; i++) { const d = `2026-11-${String(i).padStart(2, '0')}`; adDaily.push({ date: d, cid: 7, aid: 1, net: 'n', impr, clicks: c1, cost: 1 }, { date: d, cid: 7, aid: 2, net: 'n', impr, clicks: c2, cost: 1 }); }
    return weekReview({ camp, daily: [], conv: [], adDaily, ads: [{ id: 1, cid: 7, state: 'ON', title: 'А' }, { id: 2, cid: 7, state: 'ON', title: 'Б' }], goals, today: '2026-11-16' }).adTest; };
  const win = mk(80, 30, 2000); assert.equal(win.status, 'win'); assert.equal(win.best.title, 'А'); assert.equal(win.loser.title, 'Б');
  const wait = mk(3, 2, 60); assert.equal(wait.status, 'wait'); assert.ok(wait.need > 0); // мало показов — победителя не объявляем
});
