import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketingReport, buildReportModel, toHtml, toJson, cellText, RUB, PCT } from '../js/report.js';
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
  assert.ok(md.includes('| 11.09.2026 | пт | 354,90 ₽ | 3 |'), 'день с днём недели');
  assert.ok(!md.includes(' '), 'без неразрывных пробелов');

  const m = buildReportModel(d, '2026-09-01', '2026-09-20');
  const html = toHtml(m);
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<h2>Рекламные кампании</h2>') && html.includes('<td class="n">1,50 %</td>'));
  const j = JSON.parse(toJson(m));
  const itog = j.sections.find((x) => x.name === 'Итоги');
  assert.equal(itog.rows[0][1], 4732); // в JSON — настоящие числа
  assert.equal(j.sections.find((x) => x.name === 'Таргет 1').rows[0][4], 0.015);
});

test('ячейки отчёта: форматирование', () => {
  assert.equal(cellText(RUB(25438.4)), '25 438 ₽');
  assert.equal(cellText(PCT(0.0194, 2)), '1,94 %');
  assert.equal(cellText(null), '—');
});

test('запрос по таргету: что насторожило, примечания, вопросы', async () => {
  const { buildTargetPrompt } = await import('../js/report.js');
  const { targetAlert, addDays } = await import('../js/calc.js');
  const b = bookIdFor('Альпийский развод');
  const sales = [];
  for (let i = 0; i < 14; i++) sales.push({ date: addDays('2026-09-01', i), book: 'Альпийский развод', bookId: b, kind: 'sale', price: 100, qty: 1, royalty: 100 });
  for (let i = 0; i < 7; i++) sales.push({ date: addDays('2026-09-15', i), book: 'Альпийский развод', bookId: b, kind: 'sale', price: 100, qty: 6, royalty: 600 });
  for (let i = 0; i < 7; i++) sales.push({ date: addDays('2026-09-22', i), book: 'Альпийский развод', bookId: b, kind: 'sale', price: 100, qty: 3, royalty: 300 });
  const k = { id: 'k', name: 'Таргет Альпийский', channel: 'litnet', start: '2026-09-15', end: '2026-10-15', budget: 6200, bookId: b, scope: 'book' };
  const d = { sales, legacyDays: [], books: [{ id: b, title: 'Альпийский развод' }], campaigns: [k], reports: [], settings: DEFAULT_SETTINGS, dataEnd: '2026-09-28' };
  const alert = targetAlert(k, { ...d, baseDays: 14 });
  const t = buildTargetPrompt(d, k, alert, [{ campaignId: 'k', date: '2026-09-28', note: 'CTR упал, сменили креатив', images: ['data:x'] }]);
  assert.ok(t.includes('## Что насторожило'));
  assert.ok(t.includes('на 50 % меньше'));
  assert.ok(t.includes('28.09.2026: CTR упал, сменили креатив — скриншот отчёта прикладываю'));
  assert.ok(t.includes('Что конкретно спросить'));
  assert.ok(t.includes('(К сообщению приложено скриншотов: 1.)'));
});
