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

test('когорты: сводка «когда покупают» — доли только по созревшим, Директ отдельно', async () => {
  const { cohortSummary } = await import('../js/cohorts.js');
  const sources = [{ t: 'ad', e: 'ya_direct', d: '715' }, { t: 'organic', e: '', d: '' }];
  const people = [];
  for (let i = 0; i < 30; i++) people.push([0, 0, 0, i < 15 ? 1 : null, null, i < 6 ? (i < 3 ? 2 : 20) : null, i < 2 ? 1 : 0, null]); // пришли 40 дней назад с Директа
  for (let i = 0; i < 10; i++) people.push([38, 0, 0, null, null, null, 0, null]); // свежие — в «за 7/30 дней» не входят
  people.push([0, 1, 0, null, null, 0, 0, null]);
  const s = cohortSummary({ from: '2026-10-01', to: '2026-11-09', sources, people }, '2026-11-10');
  const d = s.groups.direct;
  assert.equal(d.n, 40); assert.equal(d.lib, 15); assert.equal(d.buy, 6);
  assert.equal(d.by[7], 3 / 30); assert.equal(d.by[30], 6 / 30); assert.equal(d.by[60], null);
  assert.equal(d.median, 20); assert.equal(d.lateShare, 2 / 6);
  assert.equal(s.camps['715'].n, 40); assert.equal(s.groups.other.n, 1);
});

test('Директ по месяцам: месяц «на библиотеку» — с ожидаемым доходом от добавивших', async () => {
  const { directMonths } = await import('../direct/js/pult.js');
  const daily = [{ date: '2026-11-10', cid: 1, cost: 1000, clicks: 100 }], conv = [{ date: '2026-11-10', cid: 1, conv: { 5: 40 } }];
  const [m] = directMonths({ daily, conv, goals: { lib: '5', buy: ['6'] }, perSale: 100, libValue: 30 });
  assert.equal(m.lib, 40); assert.equal(m.buy, 0); assert.equal(m.ret, 0); assert.equal(m.exp, 1200); assert.equal(m.retExp, 1.2);
  assert.equal(directMonths({ daily, conv, goals: { lib: '5', buy: ['6'] }, perSale: 100 })[0].exp, null);
});

test('этап кампании: обучение → библиотека → «пора менять цель» только при 10 покупках за неделю → покупки', async () => {
  const { campaignStage } = await import('../direct/js/pult.js');
  const today = '2026-11-20', st = { key: 'on' }, goals = { lib: '1', buy: ['2'] };
  const econ = (o = {}) => ({ ran: 20, lib7: 14, lib30: 60, buy30: 0, cpaLib: 30, libValue: 45, d30: { cost: 1800 }, ...o });
  const convN = (n) => (n ? [{ date: '2026-11-18', cid: 7, conv: { 2: n } }] : []);
  let g = campaignStage({ id: 7, goal: 1, start: '2026-11-16' }, { econ: econ({ ran: 5 }), st, goals, today });
  assert.equal(g.key, 'learn'); assert.match(g.next.what, /Не трогать стратегию до 23\.11/);
  g = campaignStage({ id: 7, goal: 1, start: '2026-11-01' }, { econ: econ(), st, goals, today, subStart: '2026-11-27' });
  assert.equal(g.key, 'collect'); assert.match(g.text, /Подписка откроется 27\.11/); assert.ok(g.checks[0].ok && g.checks[1].ok); assert.match(g.second, /Пока не нужна/);
  g = campaignStage({ id: 7, goal: 1, start: '2026-11-01' }, { econ: econ(), st, goals, conv: convN(4), today, subStart: '2026-11-15' });
  assert.equal(g.key, 'switch'); assert.equal(g.buy7, 4); assert.equal(g.next.act, undefined); assert.match(g.next.what, /Оставить цель «библиотека»/);
  g = campaignStage({ id: 7, goal: 1, start: '2026-11-01' }, { econ: econ({ lib30: 320 }), st, goals, conv: convN(12), today, subStart: '2026-11-15' });
  assert.equal(g.next.act, 'goal'); assert.match(g.title, /Пора переключить цель/); assert.match(g.second, /Имеет смысл: за 30 дней 320 добавлений/);
  g = campaignStage({ id: 7, goal: 2, start: '2026-10-01' }, { econ: econ({ ran: 50, buy30: 40 }), st, goals, conv: convN(11), today, subStart: '2026-11-01', perSale: 90 });
  assert.equal(g.key, 'buy'); assert.match(g.text, /на 1 ₽ рекламы — 2,00 ₽/);
  g = campaignStage({ id: 7, goal: 2, start: '2026-10-01' }, { econ: econ({ ran: 50, buy30: 6 }), st, goals, conv: convN(2), today, subStart: '2026-11-01', perSale: 90 });
  assert.match(g.next.what, /верните цель «добавление в библиотеку»/);
  assert.equal(campaignStage({ id: 7 }, { econ: econ(), st: { key: 'draft' }, goals, today }), null);
});

test('страницы книг сайта: заходы, «Читать», Литнет по метке', async () => {
  const { siteBookFunnel } = await import('../direct/js/pult.js');
  const books = [{ title: 'Вдова', url: 'vdova' }, { title: 'Медведь', url: 'medved' }];
  const pages = [{ name: 'https://lanafreitag.ru/kniga/vdova/', visits: 100, goals: { 9: 30 } }, { name: 'https://lanafreitag.ru/?chitat=vdova', visits: 20, goals: { 9: 10 } }, { name: 'https://lanafreitag.ru/', visits: 500, goals: {} }];
  const mkUtm = [{ dims: ['lanafreitag.ru', 'site', 'vdova', null], visits: 35, goals: { 7: 12, 8: 3 } }];
  const r = siteBookFunnel({ pages, goalIds: { read: 9 }, mkUtm, goals: { lib: '7', buy: ['8'] }, books });
  assert.equal(r.length, 1); assert.equal(r[0].visits, 120); assert.equal(r[0].reader, 20); assert.equal(r[0].read, 40); assert.equal(r[0].lit, 35);
});
