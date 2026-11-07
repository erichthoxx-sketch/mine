import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingSnapshot, incomeSnapshot, directSnapshot } from '../writer/js/ai-system.js';

test('marketing context contains book facts but excludes contact details and secrets', () => {
  const m = marketingSnapshot({
    w_books: [{ id: 'b1', title: 'Роман', genres: ['роман'], promo: { annotation: 'Аннотация', secret: 'PRIVATE' }, secret: 'PRIVATE' }],
    w_ideas: [{ bookId: 'b1', title: 'Новый сюжет', text: 'Идея', email: 'private@example.com' }],
    w_contests: []
  }, '2026-11-03T12:00:00Z');
  assert.equal(m.books[0].promo.annotation, 'Аннотация');
  assert.equal(m.ideas[0].text, 'Идея');
  assert.equal(JSON.stringify(m).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(m).includes('private@example.com'), false);
});
test('income context keeps exact dates, quantities and spend for commercial analysis', () => {
  const d = incomeSnapshot({
    sales: [
      { date: '2026-10-30', book: 'Роман', qty: 2, royalty: 240, email: 'do-not-copy' },
      { date: '2026-11-01', book: 'Роман', qty: 1, royalty: 150 }
    ],
    reports: [{ start: '2026-11-01', end: '2026-11-02', campaignId: 'c1', spend: 123, clicks: 17, token: 'do-not-copy' }]
  });
  assert.equal(d.totals.royalty, 390);
  assert.equal(d.months.length, 2);
  assert.equal(d.reports[0].spend, 123);
  assert.equal(JSON.stringify(d).includes('do-not-copy'), false);
});
test('Direct snapshot only exports explicitly safe fields from cached reports', () => {
  const d = directSnapshot({
    main: { campaigns: [{ id: 'a1', name: 'Реклама романа', budget: 200, oauthToken: 'secret123' }] },
    stats: { daily: [{ date: '2026-11-01', cid: 'a1', cost: 140, token: 'secret123' }] }
  });
  assert.equal(d.campaigns[0].name, 'Реклама романа');
  assert.equal(d.daily[0].cost, 140);
  assert.equal(JSON.stringify(d).includes('secret123'), false);
  const m = directSnapshot({ mk: { sources: [{ key: 'ad', name: 'Переходы по рекламе', visits: 5, goals: { 11: 2 } }] } },
    '2026-11-07', [{ id: 11, name: 'Покупка книги' }]);
  assert.equal(m.metrika.sources[0].name, 'Переходы по рекламе');
  assert.equal(m.metrika.goalNames['11'], 'Покупка книги');
});
