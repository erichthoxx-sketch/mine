import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketingReport } from '../js/report.js';
import { bookIdFor, spendByMonthChannel, litnetDiscounts } from '../js/calc.js';
import { DEFAULT_SETTINGS } from '../js/store.js';

test('маркетинговый отчёт: все разделы и ключевые цифры', () => {
  const b = bookIdFor('Альпийский развод');
  const sales = [];
  for (let i = 1; i <= 20; i++) sales.push({ id: 's' + i, date: `2026-09-${String(i).padStart(2, '0')}`, book: 'Альпийский развод', bookId: b, kind: i % 4 ? 'sale' : 'sub', price: 169, qty: i > 10 ? 3 : 1, royalty: i > 10 ? 354.9 : 118.3 });
  const campaigns = [{ id: 'k1', name: 'Таргет Альпийский', channel: 'litnet', bookId: b, scope: 'book', start: '2026-09-11', end: '2026-09-20', budget: 2000 }];
  const reports = [{ id: 'r1', campaignId: 'k1', start: '2026-09-11', end: '2026-09-17', spend: 1400, impressions: 10000, clicks: 150 }];
  const spend = spendByMonthChannel(campaigns, reports, {}, '2026-09-20');
  const d = {
    sales, legacyDays: [], books: [{ id: b, title: 'Альпийский развод', status: 'progress', priceHistory: [{ from: '2026-09-01', price: 169 }] }],
    campaigns, reports, days: [{ id: '2026-09-11', date: '2026-09-11', events: [{ type: 'chapter', text: 'глава 5' }], note: 'старт рекламы' }],
    monthsMap: {}, spend, discounts: litnetDiscounts({ '2026-09': spend['2026-09'].litnet }), settings: { ...DEFAULT_SETTINGS, goalStart: '2026-09', goalAmount: 10000 },
    today: '2026-09-21', dataEnd: '2026-09-20',
  };
  const md = buildMarketingReport(d, '2026-09-01', '2026-09-20');
  for (const h of ['## Контекст', '## Итоги периода', '## По месяцам', '## По неделям', '## Книги', '## Рекламные кампании', '### Таргет Альпийский', '## «Литнет платит»', '## События и заметки', '## Доход по дням', '## Что я прошу']) assert.ok(md.includes(h), 'нет раздела ' + h);
  assert.ok(md.includes('| Роялти (доход до вычетов) | 4 732 ₽ |'), 'итог роялти'); // 10×118,3 + 10×354,9
  assert.ok(md.includes('| 11.09.2026 – 17.09.2026 | 1 400,00 ₽ | 10 000 | 150 | 1,50 % | 9,33 ₽ |'), 'строка отчёта таргетологов');
  assert.ok(md.includes('11.09.2026: выкладка главы: глава 5'));
  assert.ok(md.includes('| 11.09.2026 | пт | 354,90 |'), 'день с днём недели');
  assert.ok(!md.includes(' '), 'без неразрывных пробелов');
});
