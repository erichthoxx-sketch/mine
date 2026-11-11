import test from 'node:test';
import assert from 'node:assert/strict';
import { goalsOf, bookOfCampaign, campaignState, campaignEcon, campaignAlerts, weekBudget, siteCampaigns } from '../direct/js/pult.js';
import { directMonths, siteAdRows, siteToLitnet } from '../direct/js/pult.js';

const M = { goals: [{ id: 548467215, name: 'Добавление книги в библиотеку' }, { id: 548467220, name: 'Покупка книги' }, { id: 548467217, name: 'Начало покупки книги' }], main: [] };
const camp = { id: 7, name: 'Единая перфоманс-кампания №18', state: 'ON', status: 'ACCEPTED', start: '2026-11-01', goal: 548467215, cpa: 8, budget: { kind: 'week', amount: 1700 } };
const day = (date, cost, impr = 500, clicks = 20) => ({ date, cid: 7, impr, clicks, cost });

test('цели: библиотека и покупка по названиям, цель стратегии — главная для «библиотеки»', () => {
  const g = goalsOf(M, camp);
  assert.equal(g.lib, '548467215');
  assert.deepEqual(g.buy, ['548467220']); // «Начало покупки» — не покупка
});

test('книга кампании — по ссылке объявления на Литнете, а не по названию кампании', () => {
  const ads = [{ cid: 7, href: 'https://litnet.com/ru/book/razvod-dlya-chernoi-vdovy-b639097' }];
  const b = bookOfCampaign(camp, ads, [{ id: 'w1', title: 'Альпийский развод' }, { id: 'w2', title: 'Развод для черной вдовы' }]);
  assert.equal(b.id, 'w2');
  assert.equal(bookOfCampaign(camp, ads, [{ id: 'w3', title: 'X', direct: { link: 'https://litnet.com/ru/book/any-b639097' } }]).id, 'w3');
});

test('состояние: модерация, старт, нет показов, упёрлась в недельный бюджет, идёт', () => {
  const T = '2026-11-12'; // четверг
  assert.equal(campaignState({ ...camp, status: 'MODERATION' }, { today: T }).key, 'moderation');
  assert.equal(campaignState({ ...camp, start: '2026-11-20' }, { today: T }).key, 'soon');
  assert.equal(campaignState(camp, { daily: [day('2026-11-10', 100)], today: T }).key, 'idle');
  assert.equal(campaignState(camp, { daily: [day('2026-11-10', 900), day('2026-11-11', 700), day('2026-11-12', 50)], today: T }).key, 'capped');
  assert.equal(campaignState(camp, { daily: [day('2026-11-11', 100), day('2026-11-12', 50)], today: T }).key, 'on');
  const wk = weekBudget(camp, [day('2026-11-08', 999), day('2026-11-10', 300)], T); // воскресенье — прошлая неделя
  assert.equal(wk.spent, 300);
});

test('экономика: цена добавления против цели, окупаемость покупками, ожидание на малых числах', () => {
  const T = '2026-11-20';
  const daily = Array.from({ length: 10 }, (_, i) => day(`2026-11-${String(11 + i).padStart(2, '0')}`, 100));
  const lib = (n) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${String(11 + (i % 10)).padStart(2, '0')}`, cid: 7, conv: { 548467215: 1 } }));
  const g = goalsOf(M, camp);
  // 1000 ₽, 100 добавлений → 10 ₽ при цели 8: в рамках (не дороже 1,5 раза)
  let e = campaignEcon(camp, { daily, conv: lib(100), today: T, goals: g });
  assert.equal(Math.round(e.cpaLib), 10); assert.equal(e.verdict.kind, 'good');
  // 1000 ₽, 50 добавлений → 20 ₽ при цели 8 — дорого
  e = campaignEcon(camp, { daily, conv: lib(50), today: T, goals: g });
  assert.equal(e.verdict.kind, 'bad');
  // покупки решают: 10 покупок × 150 ₽ = 1500 на 1000 ₽ → окупается
  const buys = Array.from({ length: 10 }, (_, i) => ({ date: '2026-11-15', cid: 7, conv: { 548467220: 1 } }));
  e = campaignEcon(camp, { daily, conv: [...lib(50), ...buys], today: T, goals: g, perSale: 150 });
  assert.equal(e.verdict.kind, 'good'); assert.equal(Math.round(e.verdict.ret * 10), 15);
  // два дня работы — учится
  e = campaignEcon({ ...camp, start: '2026-11-19' }, { daily: [day('2026-11-19', 50)], conv: [], today: T, goals: g });
  assert.equal(e.verdict.kind, 'wait');
});

test('тревоги: показы без добавлений и подорожавшее добавление', () => {
  const T = '2026-11-20', g = goalsOf(M, camp);
  const daily = Array.from({ length: 7 }, (_, i) => day(`2026-11-${14 + i}`, 100));
  const e = campaignEcon(camp, { daily, conv: [], today: T, goals: g });
  const al = campaignAlerts(camp, { key: 'on' }, e, { daily, conv: [], today: T, goals: g });
  assert.ok(al.some((x) => /добавлений нет/.test(x.title)));
  const conv = [{ date: '2026-11-19', cid: 7, conv: { 548467215: 3 } }];
  const al2 = campaignAlerts(camp, { key: 'on' }, campaignEcon(camp, { daily, conv, today: T, goals: g }), { daily, conv, today: T, goals: g });
  assert.ok(al2.some((x) => /подорожало до 100/.test(x.title))); // 300 ₽ за 3 дня / 3
});

test('Деньги: Директ по месяцам с отдачей рубля; Сайт: реклама на сайт и путь сайт → Литнет', () => {
  const rows = directMonths({ daily: [day('2026-10-05', 600), day('2026-11-05', 400)], conv: [{ date: '2026-11-05', cid: 7, conv: { 548467220: 4 } }], goals: goalsOf(M, camp), perSale: 150 });
  assert.equal(rows[0].month, '2026-11'); assert.equal(rows[0].buy, 4); assert.equal(rows[0].ret, 1.5);
  const site = { goalIds: { read: '1', subscribe: '2' }, direct: [{ key: 'N-7', name: 'X', visits: 40, bounce: 0.3, goals: { 1: 10, 2: 2 } }], utm: [{ dims: ['vk', 'test'], visits: 5, goals: {} }] };
  const r = siteAdRows({ site, daily: [day('2026-11-05', 200)], campaigns: [{ ...camp, name: 'На сайт' }], today: '2026-11-10' });
  assert.equal(r[0].name, 'На сайт'); assert.equal(r[0].perRead, 20); assert.equal(r[0].perSub, 100);
  assert.equal(r[1].name, 'vk · test');
  const ch = siteToLitnet([{ dims: ['lanafreitag.ru', 'site'], visits: 9, goals: { 548467215: 3, 548467220: 1 } }, { dims: ['vk'], visits: 50, goals: {} }], goalsOf(M));
  assert.deepEqual(ch, { visits: 9, lib: 3, buy: 1 });
  assert.equal(siteCampaigns([camp], [{ cid: 7, href: 'https://lanafreitag.ru/?kniga=x' }]).length, 1);
});

import { goalHints } from '../direct/js/dcalc.js';
test('«клики есть, конверсий нет» — по цели кампании (библиотека), не в первые 3 дня', () => {
  const daily = Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-1${i}`, cid: 7, impr: 1000, clicks: 100, cost: 10 }));
  const base = { id: 7, name: 'ЕПК', state: 'ON', type: 'UNIFIED_CAMPAIGN', counters: [108714441], goal: 548467215 };
  const m = { counterId: 108714441, main: ['548467220'] };
  const conv = [{ date: '2026-11-12', cid: 7, conv: { 548467215: 8 } }];
  assert.equal(goalHints({ campaigns: [{ ...base, start: '2026-11-01' }], daily, conv, m, today: '2026-11-14' }).filter((h) => h.kind === 'zero').length, 0);
  assert.equal(goalHints({ campaigns: [{ ...base, start: '2026-11-13' }], daily, conv: [], m, today: '2026-11-14' }).filter((h) => h.kind === 'zero').length, 0);
  assert.equal(goalHints({ campaigns: [{ ...base, start: '2026-11-01' }], daily, conv: [], m, today: '2026-11-14' }).filter((h) => h.kind === 'zero').length, 1);
});

test('как заработать больше: рычаги по кампании (её кампания на 3-й день)', async () => {
  const { campaignLevers } = await import('../direct/js/pult.js');
  const c = { ...camp, start: '2026-11-10' }, today = '2026-11-12', g = goalsOf(M, c);
  const daily = [day('2026-11-10', 78.08, 14170, 494), day('2026-11-11', 58.56, 5176, 105), day('2026-11-12', 10, 900, 20)];
  const conv = [{ date: '2026-11-10', cid: 7, conv: { 548467215: 8 } }, { date: '2026-11-11', cid: 7, conv: { 548467215: 6 } }];
  const ads = [{ cid: 7, state: 'ON', status: 'ACCEPTED' }];
  const st = campaignState(c, { daily, ads, today }), wk = weekBudget(c, daily, today);
  // ценность добавления 30 ₽ (роялти 100 ₽ × 30 %)
  const econ = campaignEcon(c, { daily, conv, today, goals: g, perSale: 100, libShare: 0.3 });
  const L = campaignLevers(c, st, econ, wk, { ads, daily, today });
  assert.deepEqual(L.levers.map((x) => x.k), ['ads', 'pace', 'page']);
  assert.match(L.levers[1].title, /на 28 %/);
  assert.match(L.levers[1].how, /После 17\.11 поднимите цену цели с 8 до 11 ₽/); // учится — менять после 7 дней, не больше трети
  assert.equal(Math.round(L.forecast.cost), 478); assert.ok(L.forecast.royalty > L.forecast.cost);
  // добавление приносит меньше, чем стоит, — совет снизить цену цели
  const poor = campaignLevers(c, st, campaignEcon(c, { daily, conv, today, goals: g, perSale: 100, libShare: 0.06 }), wk, { ads, daily, today });
  assert.ok(poor.levers.some((x) => x.k === 'cpaDown' && /до 4 ₽/.test(x.title)));
  assert.ok(!/поднимите цену/i.test(poor.levers.find((x) => x.k === 'pace').how));
  // остановленной кампании советов нет
  assert.deepEqual(campaignLevers({ ...c, state: 'OFF' }, { key: 'stopped' }, econ, wk, { ads, daily, today }).levers, []);
});

test('окупаемость с начала кампании: вернулось + ждёт в библиотеках', async () => {
  const { campaignPayback } = await import('../direct/js/pult.js');
  const c = { ...camp, start: '2026-11-10' }, g = goalsOf(M, c);
  const daily = [day('2026-11-10', 100), day('2026-11-11', 100)];
  const conv = [{ date: '2026-11-10', cid: 7, conv: { 548467215: 10, 548467220: 1 } }, { date: '2026-11-11', cid: 7, conv: { 548467215: 10 } }];
  const p = campaignPayback(c, { daily, conv, today: '2026-11-12', goals: g, perSale: 100, libValue: 30 });
  assert.deepEqual([p.cost, p.lib, p.buy, p.back, p.expected, p.total, p.ret, p.days], [200, 20, 1, 100, 500, 600, 3, 3]);
  assert.equal(campaignPayback(c, { daily: [], conv, today: '2026-11-12', goals: g }), null);
});

test('Директ → «Доходы»: кампания создаётся сама, с книгой по ссылке объявления', async () => {
  const { incomeCampaignFor } = await import('../direct/js/sync.js');
  const { bookIdFor } = await import('../js/calc.js');
  const wbooks = [{ id: 'w1', title: 'Развод для черной вдовы', direct: { link: 'https://litnet.com/ru/book/razvod-b639097' } }];
  const ads = [{ cid: 7, href: 'https://litnet.com/ru/book/razvod-b639097?utm_litref=x' }];
  const k = incomeCampaignFor(camp, ads, wbooks, [{ book: 'Развод для черной вдовы (подписка)' }]);
  assert.equal(k.name, 'Директ: «Развод для черной вдовы»');
  assert.equal(k.bookId, bookIdFor('Развод для черной вдовы (подписка)')); assert.equal(k.scope, 'book'); assert.equal(k.channel, 'own');
  const any = incomeCampaignFor(camp, [], [], []);
  assert.equal(any.name, 'Директ: ' + camp.name); assert.equal(any.scope, 'all');
});
