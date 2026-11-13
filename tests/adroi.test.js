import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignBook, campaignLink, campaignVerdict, reportDue, adBoard, linkSpend, titleMatch } from '../js/adroi.js';
import { promoChannel } from '../writer/js/promolinks.js';
import { addDays } from '../js/calc.js';

const books = [{ id: 'b1', title: 'Альпийский развод. Он оставил меня умирать' }, { id: 'b2', title: 'Звериная тропа для двоих' }];
const wbooks = [{ id: 'w1', title: 'Альпийский развод' }, { id: 'w2', title: 'Звериная тропа для двоих' }];
const links = [
  { id: 'l1', bookId: 'w1', campaign: 'Альпийский - Литнет Платит', url: 'https://litnet.com/ref/abc', createdAt: '2026-10-22T10:00:00Z' },
  { id: 'l2', bookId: 'w1', campaign: 'Альпийский - Тредс', url: 'https://litnet.com/ref/def', createdAt: '2026-10-23T10:00:00Z' },
];

test('Короткое и полное название книги — одна книга', () => {
  assert.ok(titleMatch('Альпийский развод', 'Альпийский развод. Он оставил меня умирать'));
  assert.ok(!titleMatch('Альпийский', 'Альпийская сказка'));
});

test('Старая ссылка «… Литнет Платит» относится к каналу «Литнет платит»', () => {
  assert.equal(promoChannel(links[0]), 'litnet');
  assert.equal(promoChannel(links[1]), 'social');
});

test('Книга кампании угадывается по названию, если в «Доходах» не выбрана', () => {
  const r = campaignBook({ name: 'Альпийский развод. Он оставил меня умирать', bookId: '' }, books);
  assert.equal(r.book.id, 'b1'); assert.equal(r.guessed, true);
  assert.equal(campaignBook({ name: 'тестовый', bookId: '' }, books).book, null);
});

test('Ссылка кампании «Литнет платит» — своя книга и канал', () => {
  const c = { id: 'k1', name: 'Таргет Альпийский', bookId: 'b1', channel: 'litnet', start: '2026-10-05', end: '2026-11-07' };
  assert.equal(campaignLink(c, links, wbooks, books).id, 'l1');
  assert.equal(campaignLink({ ...c, promoId: 'l2' }, links, wbooks, books).id, 'l2');
  assert.equal(campaignLink({ ...c, bookId: 'b2' }, links, wbooks, books), null);
});

test('Вывод по окупаемости: мало дней, окупается, в ноль, не окупается', () => {
  assert.equal(campaignVerdict({ status: 'active', days: 3, baseline: 100, spendSource: 'budget' }, {}).kind, 'wait');
  const m = { status: 'active', days: 10, baseline: 100, spendSource: 'reports' };
  assert.equal(campaignVerdict(m, { returnShare: 1.73 }).kind, 'good');
  assert.equal(campaignVerdict(m, { returnShare: 1.0 }).kind, 'even');
  assert.equal(campaignVerdict(m, { returnShare: 0.5 }).kind, 'bad');
  assert.equal(campaignVerdict({ ...m, spendSource: 'budget' }, { returnShare: 1.5 }).est, true);
});

test('Отчёт о расходе: просим, если последние 7 дней не закрыты', () => {
  const c = { id: 'k1', start: '2026-11-01', end: '2026-11-25' };
  assert.equal(reportDue(c, [], '2026-11-05'), false); // идёт меньше недели
  assert.equal(reportDue(c, [], '2026-11-09'), true);
  assert.equal(reportDue(c, [{ campaignId: 'k1', start: '2026-11-01', end: '2026-11-07' }], '2026-11-09'), false);
  assert.equal(reportDue(c, [{ campaignId: 'k1', start: '2026-11-01', end: '2026-11-07' }], '2026-11-16'), true);
  assert.equal(reportDue({ ...c, end: '2026-10-01', start: '2026-09-01' }, [], '2026-11-16'), false); // давно закончилась
});

test('Сводка и расход ссылки считаются из тех же данных, что в «Доходах»', () => {
  const today = '2026-11-08', sales = [];
  for (let i = 40; i >= 1; i--) {
    const d = addDays(today, -i);
    sales.push({ id: 's' + i, date: d, book: books[0].title, bookId: 'b1', kind: 'sale', qty: i <= 20 ? 6 : 2, royalty: i <= 20 ? 600 : 200, price: 100 });
  }
  const data = { sales, books, w_books: wbooks, w_promolinks: links, days: [], reports: [],
    campaigns: [{ id: 'k1', name: 'Таргет Альпийский', bookId: 'b1', channel: 'litnet', start: addDays(today, -20), end: addDays(today, 5), budget: 6000 }] };
  const [row] = adBoard(data, {}, today);
  assert.equal(row.link.id, 'l1');
  assert.equal(row.v.kind, 'good'); // +400 ₽ в день против ~230 ₽ расхода
  assert.equal(row.v.est, true);    // отчётов нет — расход оценкой
  assert.equal(row.reportDue, true);
  const ls = linkSpend('l1', data, {}, today);
  assert.ok(ls.cost > 4000 && ls.cost < 5000, String(ls.cost));
  assert.deepEqual(ls.names, ['Таргет Альпийский']);
});

test('Сравнение каналов: Литнет платит со ссылкой и Директ по покупкам', async () => {
  const { channelCompare, channelVerdict } = await import('../js/adroi.js');
  const today = '2026-11-08', sales = [];
  for (let i = 40; i >= 1; i--) sales.push({ id: 's' + i, date: addDays(today, -i), book: books[0].title, bookId: 'b1', kind: 'sale', qty: 2, royalty: i <= 20 ? 600 : 200, price: 100 });
  const data = { sales, books, w_books: wbooks, w_promolinks: links, days: [], reports: [],
    campaigns: [{ id: 'k1', name: 'Таргет Альпийский', bookId: 'b1', channel: 'litnet', start: addDays(today, -20), end: addDays(today, 5), budget: 6000 }] };
  const rows = channelCompare(data, {}, today, { refs: { abc: { visits: 120, conv: 6 }, def: { visits: 40, conv: 1 } }, direct: { cost: 3000, clicks: 300, conv: 3 }, perSale: 150 });
  const lit = rows.find((r) => r.key === 'litnet'), dir = rows.find((r) => r.key === 'direct'), soc = rows.find((r) => r.key === 'social');
  assert.equal(lit.readers, 120); assert.equal(lit.buys, 6); assert.ok(lit.ret > 1.2);
  assert.equal(dir.perReader, 10); assert.equal(dir.ret, 0.15);
  assert.equal(soc.spend, 0); assert.equal(soc.readers, 40);
  const v = channelVerdict(rows);
  assert.equal(v.best, 'litnet');
});

test('Метка Литнета — тот же код, что в ссылке', async () => {
  const { exactTag } = await import('../direct/js/litnetcalc.js');
  assert.equal(exactTag('https://litnet.com/ref/PZSWjdD9ctDTys9A'), 'utm_litref=PZSWjdD9ctDTys9A');
  assert.equal(exactTag({ url: 'https://litnet.com/ref/vkZDPLyk6BJ1S_JZ' }), 'utm_litref=vkZDPLyk6BJ1S_JZ');
});

test('таргетологи под контролем: кто ведёт кампанию, сводка и советы', async () => {
  const { partnerOf, partnerBoard } = await import('../js/adroi.js');
  const partners = [{ id: 'p1', kind: 'target', name: 'Ирина Смирнова' }, { id: 'p2', kind: 'target', name: 'Олег' }];
  assert.equal(partnerOf({ name: 'Таргет ВК — Ирина, ноябрь' }, partners).id, 'p1');
  assert.equal(partnerOf({ name: 'Таргет ВК — Ирина', partnerId: 'p2' }, partners).id, 'p2'); // выбранный вручную главнее
  assert.equal(partnerOf({ name: 'Директ: «Книга»', src: 'direct' }, partners), null);
  assert.equal(partnerOf({ name: 'Просто реклама' }, partners), null);
  const B = partnerBoard({ w_links: partners, campaigns: [], reports: [], sales: [], days: [] }, {}, '2026-11-12');
  assert.equal(B.partners.length, 2); assert.equal(B.partners[0].n, 0); assert.match(B.partners[0].text, /кампаний нет/); assert.equal(B.verdict, '');
});

test('сравнение каналов: Директ «на библиотеку» — с ожидаемым доходом от добавивших', async () => {
  const { channelCompare } = await import('../js/adroi.js');
  const rows = channelCompare({}, {}, '2026-11-13', { direct: { cost: 1000, clicks: 100, conv: 0, exp: 1200 }, perSale: 100 });
  const d = rows.find((r) => r.key === 'direct');
  assert.equal(d.ret, 1.2); assert.equal(d.retExp, true);
  const d0 = channelCompare({}, {}, '2026-11-13', { direct: { cost: 1000, clicks: 100, conv: 0, exp: 0 }, perSale: 100 }).find((r) => r.key === 'direct');
  assert.equal(d0.ret, 0); assert.equal(d0.retExp, false);
});
