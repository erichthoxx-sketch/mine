import test from 'node:test';
import assert from 'node:assert/strict';
import { weekSummary, releaseTiming, discountEffects, cycleTail, finishPace } from '../js/insights.js';
import { addDays } from '../js/calc.js';

const today = '2026-11-08';
const sale = (d, bookId, royalty, book = bookId) => ({ id: d + bookId, date: d, book, bookId, kind: 'sale', qty: 1, price: royalty, royalty });

test('Сводка недели: доход против прошлой недели, главы, реклама, дела', () => {
  const sales = [];
  for (let i = 1; i <= 14; i++) sales.push(sale(addDays(today, -i), 'b1', i <= 7 ? 1200 : 1000, 'Альпийский развод. Он оставил меня умирать'));
  const data = { sales, books: [{ id: 'b1', title: 'Альпийский развод. Он оставил меня умирать' }], days: [], reports: [],
    w_books: [{ id: 'w1', title: 'Развод для черной вдовы', pub: { 'Глава 1': { 'Литнет': { date: addDays(today, -3) } } } }],
    campaigns: [{ id: 'k1', name: 'Зверин', channel: 'litnet', start: addDays(today, -3), end: addDays(today, 17), budget: 10000 }] };
  const w = weekSummary(data, {}, today);
  assert.equal(w.income, 8400); assert.equal(w.was, 7000);
  assert.ok(Math.abs(w.delta - 0.2) < 1e-9);
  assert.equal(w.chapters, 1);
  assert.ok(w.reasons.some((r) => r.includes('Зверин')));
});

test('Лучший день выкладки: вторник даёт больше, чем пятница', () => {
  const sales = [], pub = {};
  const start = '2026-08-03'; // понедельник
  for (let i = 0; i < 90; i++) sales.push(sale(addDays(start, i), 'b1', 1000, 'Книга'));
  let n = 0;
  for (let w = 0; w < 6; w++) {
    const tue = addDays(start, 1 + w * 14), fri = addDays(start, 4 + w * 14 + 7);
    pub['Глава ' + (++n)] = { 'Литнет': { date: tue } }; pub['Глава ' + (++n)] = { 'Литнет': { date: fri } };
    for (const s of sales) { if (s.date === tue || s.date === addDays(tue, 1)) s.royalty = 2000; if (s.date === fri || s.date === addDays(fri, 1)) s.royalty = 1100; }
  }
  const r = releaseTiming({ sales, books: [{ id: 'b1', title: 'Книга' }], days: [], w_books: [{ id: 'w', title: 'Книга', pub }] }, {}, '2026-11-08');
  assert.equal(r.tip.wd, 2);
  assert.ok(r.rows[2].avg > 0.9 && r.rows[5].avg < 0.2);
});

test('Скидка: доход в дни скидки против двух недель до неё', () => {
  const sales = [];
  for (let i = 1; i <= 20; i++) sales.push(sale(addDays(today, -i), 'b1', i <= 2 ? 3000 : 1000));
  const days = [{ date: addDays(today, -2), events: [{ type: 'discount', bookId: 'b1', text: '30 %' }] }, { date: addDays(today, -1), events: [{ type: 'discount', bookId: 'b1' }] }];
  const [d] = discountEffects({ sales, days, books: [{ id: 'b1', title: 'Альпийский' }] }, {}, today);
  assert.equal(d.days, 2); assert.equal(d.base, 1000); assert.equal(d.extra, 4000); assert.equal(d.book, 'Альпийский');
});

test('Хвост цикла: старая книга без своей рекламы продаётся лучше, пока выходит новая', () => {
  const sales = [], start = addDays(today, -20);
  for (let i = 1; i <= 50; i++) { const d = addDays(today, -i); sales.push(sale(d, 'old', d >= start ? 600 : 400, 'Старая')); }
  const r = cycleTail({ sales, books: [{ id: 'old', title: 'Старая' }, { id: 'new', title: 'Новая' }], days: [], campaigns: [], w_books: [{ id: 'w', title: 'Новая', status: 'progress', publishStart: start }] }, {}, today);
  assert.equal(r[0].rows[0].book, 'Старая'); assert.ok(Math.abs(r[0].rows[0].lift - 0.5) < 1e-9);
});

test('Успеть к конкурсу: сколько знаков в день нужно', () => {
  const history = {}; for (let i = 14; i >= 0; i--) history[addDays(today, -i)] = 60000 + (14 - i) * 2000;
  const book = { history, planChapters: 30, tabs: Array.from({ length: 10 }, (_, i) => ({ title: 'Глава ' + (i + 1), chars: 9000 })) };
  const p = finishPace(book, { end: '2027-01-31' }, today);
  assert.equal(p.written, 10); assert.equal(p.target, 264000); assert.equal(p.left, 176000);
  assert.ok(p.perDay > 2000 && p.perDay < 2500);
  assert.equal(finishPace(book, { end: '2026-10-31' }, today), null);
});

test('прогноз дохода новой книги — медиана первых 30 и 90 дней прежних книг', async () => {
  const { launchForecast } = await import('../js/insights.js');
  const mk = (bookId, start, per) => Array.from({ length: 100 }, (_, i) => ({ bookId, date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), royalty: per }));
  const data = { books: [{ id: 'a', title: 'Первая' }, { id: 'b', title: 'Вторая' }, { id: 'n', title: 'Новая книга' }], sales: [...mk('a', '2026-01-01', 100), ...mk('b', '2026-03-01', 300), { bookId: 'n', date: '2026-11-10', royalty: 500 }] };
  const f = launchForecast(data, { title: 'Новая книга' }, '2026-11-12');
  assert.equal(f.n, 2); assert.equal(f.r30, 6000); assert.equal(f.r90, 18000); assert.equal(f.best.title, 'Вторая'); assert.equal(f.now, 500); assert.equal(f.day, 3);
  assert.equal(launchForecast({ books: data.books, sales: mk('a', '2026-01-01', 100) }, { title: 'Новая книга' }, '2026-11-12'), null); // одной книги мало
});

test('путь читателя по циклу', async () => {
  const { cyclePath } = await import('../js/insights.js');
  const sales = [{ bookId: 'a', date: '2026-01-01', qty: 100 }, { bookId: 'b', date: '2026-03-01', qty: 50 }, { bookId: 'c', date: '2026-11-01', qty: 40 }];
  const P = cyclePath(sales, [{ bookId: 'c', no: 3 }, { bookId: 'a', no: 1 }, { bookId: 'b', no: 2 }], '2026-11-13');
  assert.equal(P.steps[0].ratio, 0.5); assert.ok(P.steps[1].young); assert.equal(P.worst.to.no, 2); assert.equal(P.through, 0.4);
});
