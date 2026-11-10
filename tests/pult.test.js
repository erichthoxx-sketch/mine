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
