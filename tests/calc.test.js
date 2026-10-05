import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, countDays, weekStart, monthKey, addMonths, incomeSeries, sumSeries, movingAverage, byWeek, byMonth,
  dashboardStats, campaignMetrics, campaignSpendByMonth, spendByMonthChannel, litnetDiscounts, litnetPace,
  monthFinance, buildPlan, goalRows, rollingAverage, inferPriceChanges, priceAt, ctr, cpc, bookIdFor, saleId,
} from '../js/calc.js';

const mk = (date, price, qty, roy, book = 'А', kind = 'sale') => ({ date, book, bookId: bookIdFor(book), kind, price, qty, royalty: roy, id: '' });

test('даты', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(countDays('2026-09-14', '2026-09-20'), 7);
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // воскресенье → понедельник
  assert.equal(addMonths('2026-11', 3), '2027-02');
});

test('ключ строки: одна и та же строка → один id, другая цена → другой', () => {
  assert.equal(saleId(mk('2026-09-01', 169, 1, 118.3)), saleId(mk('2026-09-01', 169, 5, 1)));
  assert.notEqual(saleId(mk('2026-09-01', 169, 1, 1)), saleId(mk('2026-09-01', 118.3, 1, 1)));
  assert.notEqual(saleId(mk('2026-09-01', 169, 1, 1)), saleId(mk('2026-09-01', 169, 1, 1, 'А', 'sub')));
});

test('доход по дням: нули в днях без продаж, продажи/подписки раздельно, брутто = цена × кол-во', () => {
  const s = [mk('2026-09-01', 100, 2, 140), mk('2026-09-01', 50, 1, 35, 'А', 'sub'), mk('2026-09-03', 100, 1, 70)];
  const ser = incomeSeries(s, [], '2026-09-01', '2026-09-03');
  assert.deepEqual(ser.map((x) => x.royalty), [175, 0, 70]);
  assert.equal(ser[0].gross, 250);
  assert.equal(ser[0].subQty, 1);
  assert.equal(ser[0].saleRoyalty, 140);
  assert.equal(sumSeries(ser, 'gross'), 350);
});

test('старый трекер подставляется только до начала выгрузки', () => {
  const s = [mk('2026-09-05', 100, 1, 70)];
  const legacy = [{ date: '2026-09-03', income: 500 }, { date: '2026-09-05', income: 999 }];
  const ser = incomeSeries(s, legacy, '2026-09-02', '2026-09-06');
  assert.deepEqual(ser.map((x) => x.royalty), [0, 500, 0, 70, 0]);
  assert.deepEqual(ser.map((x) => x.known), [false, true, true, true, true]); // до 03.09 данных нет
});

test('скользящее среднее 7 дней', () => {
  const ma = movingAverage([7, 7, 7, 7, 7, 7, 7, 14], 7);
  assert.equal(ma[6], 7);
  assert.equal(ma[7], 8); // (7*6+14)/7
});

test('недели (с понедельника) и месяцы', () => {
  const ser = incomeSeries([mk('2026-09-27', 100, 1, 70), mk('2026-09-28', 100, 2, 140)], [], '2026-09-21', '2026-10-04');
  const w = byWeek(ser);
  assert.equal(w.length, 2);
  assert.equal(w[0].royalty, 70);
  assert.equal(w[1].royalty, 140);
  assert.equal(byMonth(ser).length, 2);
});

test('главный экран: прирост к прошлому месяцу за тот же срок', () => {
  const s = [mk('2026-08-01', 100, 1, 100), mk('2026-08-20', 100, 1, 900), mk('2026-09-01', 100, 1, 100), mk('2026-09-02', 100, 1, 100)];
  const st = dashboardStats(s, [], '2026-09-02');
  assert.equal(st.mtd, 200);
  assert.equal(st.prevSame, 100);
  assert.equal(st.vsPrev, 1);
  assert.equal(st.prevTotal, 1000);
  // «сегодня» позже последних данных
  const st2 = dashboardStats(s, [], '2026-09-10');
  assert.equal(st2.dataEnd, '2026-09-02');
  assert.equal(st2.todayHasData, false);
});

test('скидка «Литнет платит»: (расход − скидка прошлого месяца) × 20 %, только от 10 000', () => {
  const d = litnetDiscounts({ '2026-08': 12000, '2026-09': 15000, '2026-10': 9000, '2026-11': 10000 });
  assert.equal(d['2026-08'].discount, 2400);
  assert.equal(d['2026-09'].discount, 2520); // (15000 − 2400) × 0.2
  assert.equal(d['2026-10'].discount, 0); // ниже порога
  assert.equal(d['2026-10'].qualified, false);
  assert.equal(d['2026-11'].discount, 2000); // прошлой скидки не было
  assert.equal(d['2026-09'].effective, 12480);
});

test('предупреждение о пороге', () => {
  const w = litnetPace(2000, '2026-10-10');
  assert.equal(w.onTrack, false);
  assert.equal(w.projected, 6200);
  assert.equal(w.daysLeft, 21);
  assert.equal(w.perDayNeeded, 380.95);
  assert.equal(litnetPace(10000, '2026-10-10').onTrack, true);
  assert.equal(litnetPace(5000, '2026-10-10').onTrack, true); // идёт темпом 15 500
});

test('расход по месяцам: недельный отчёт делится по дням; будущие дни отчёта не считаются', () => {
  const c = { id: 'c1', channel: 'litnet' };
  const rep = [{ campaignId: 'c1', start: '2026-09-28', end: '2026-10-04', spend: 1835.25 }];
  const full = campaignSpendByMonth(c, rep);
  assert.equal(full['2026-09'], 786.54); // 3/7
  assert.equal(full['2026-10'], 1048.71);
  const capped = campaignSpendByMonth(c, rep, '2026-10-02'); // выгрузка до 02.10: 5 дней
  assert.equal(capped['2026-09'], 1101.15);
  assert.equal(capped['2026-10'], 734.1);
  assert.equal(Math.round((capped['2026-09'] + capped['2026-10']) * 100) / 100, 1835.25);
});

test('расход без отчётов — бюджет на период; ручной ввод месяца перекрывает отчёты', () => {
  const c = { id: 'c2', channel: 'own', budget: 3000, start: '2026-09-29', end: '2026-10-08' };
  const sp = spendByMonthChannel([c], [], {});
  assert.equal(sp['2026-09'].own, 600);
  assert.equal(sp['2026-10'].own, 2400);
  const c1 = { id: 'c1', channel: 'litnet' };
  const sp2 = spendByMonthChannel([c1], [{ campaignId: 'c1', start: '2026-09-01', end: '2026-09-07', spend: 700 }], { '2026-09': { litnetSpend: 10500 } });
  assert.equal(sp2['2026-09'].litnet, 10500);
});

function adCtx() {
  const sales = [];
  for (let i = 1; i <= 14; i++) sales.push(mk(addDays('2026-09-01', i - 1), 100, 1, 100)); // база: 100 ₽/день
  for (let i = 15; i <= 24; i++) sales.push(mk(addDays('2026-09-01', i - 1), 100, 3, 300)); // кампания: 300 ₽/день
  return { sales, legacyDays: [], reports: [], dataEnd: '2026-09-24', baseDays: 14 };
}
test('окупаемость кампании: база 14 дней до старта, прирост, порог, цена продажи', () => {
  const ctx = adCtx();
  const c = { id: 'k', start: '2026-09-15', end: '2026-09-24', budget: 1000, scope: 'all' };
  const m = campaignMetrics(c, ctx);
  assert.equal(m.days, 10);
  assert.equal(m.avgDuring, 300);
  assert.equal(m.baseline, 100);
  assert.equal(m.uplift, 200);
  assert.equal(m.spendPerDay, 100);
  assert.equal(m.payback, 100); // 200 − 100
  assert.equal(m.threshold, 200); // 100 база + 100 расход
  assert.equal(m.costPerSale, 33.33); // 1000 / 30 продаж
  assert.equal(m.costPerExtraSale, 50); // 100 ₽/день на 2 лишние продажи/день
  assert.equal(m.paysOff, true);
});
test('кампания: ручная база, база-диапазон, расход по отчётам', () => {
  const ctx = adCtx();
  const base = { id: 'k', start: '2026-09-15', end: '2026-09-24', budget: 1000, scope: 'all' };
  assert.equal(campaignMetrics({ ...base, baseMode: 'value', baseValue: 250 }, ctx).payback, -50); // 50 − 100
  assert.equal(campaignMetrics({ ...base, baseMode: 'range', baseFrom: '2026-09-01', baseTo: '2026-09-07' }, ctx).baseline, 100);
  const withRep = { ...ctx, reports: [{ campaignId: 'k', start: '2026-09-15', end: '2026-09-21', spend: 1400 }, { campaignId: 'k', start: '2026-09-22', end: '2026-09-28', spend: 700 }] };
  const m = campaignMetrics(base, withRep);
  assert.equal(m.spendSource, 'reports');
  assert.equal(m.spendPerDay, 170); // 1400 за 7 дней + 3/7 от 700 (=300) → 1700 / 10 дней
});
test('кампания: без данных до старта база не выдумывается', () => {
  const ctx = { sales: [mk('2026-09-10', 100, 1, 70)], legacyDays: [], reports: [], dataEnd: '2026-09-20', baseDays: 14 };
  const m = campaignMetrics({ id: 'k', start: '2026-09-01', end: '2026-09-20', budget: 100 }, ctx);
  assert.equal(m.baseline, null);
  assert.equal(m.payback, null);
});
test('кампания по одной книге считает только её продажи', () => {
  const sales = [mk('2026-09-01', 100, 1, 100, 'А'), mk('2026-09-02', 100, 1, 100, 'А'), mk('2026-09-02', 100, 5, 500, 'Б')];
  const m = campaignMetrics({ id: 'k', start: '2026-09-02', end: '2026-09-02', bookId: bookIdFor('А'), scope: 'book', budget: 10, baseDays: 1 }, { sales, legacyDays: [], reports: [], dataEnd: '2026-09-02', baseDays: 1 });
  assert.equal(m.avgDuring, 100);
});

test('CTR и CPC', () => {
  const r = { spend: 2718.72, impressions: 16815, clicks: 327 };
  assert.equal(Math.round(cpc(r) * 100) / 100, 8.31);
  assert.equal(Math.round(ctr(r) * 10000) / 100, 1.94);
});

test('чистый доход: роялти − Rocket − реклама (с учётом скидки) − налог от полной цены', () => {
  const sales = [mk('2026-09-10', 1000, 1, 700), mk('2026-09-11', 1000, 1, 700)]; // роялти 1400, полная цена 2000
  const spend = { '2026-09': { litnet: 10000, own: 200, other: 0 } };
  const discounts = litnetDiscounts({ '2026-09': 10000 }); // скидка 2000
  const f = monthFinance('2026-09', { sales, legacyDays: [], spend, discounts, months: { '2026-09': { rocketIndex: 34.9, rocketFee: 100 } }, settings: { taxRate: 6 } });
  assert.equal(f.royalty, 1400);
  assert.equal(f.gross, 2000);
  assert.equal(f.tax, 120); // 6 % от 2000
  assert.equal(f.adCost, 8200); // 10000 − 2000 + 200
  assert.equal(f.net, 1400 - 100 - 8200 - 120);
  const g = monthFinance('2026-09', { sales, legacyDays: [], spend: {}, discounts: {}, months: {}, settings: { taxRate: 6, taxBase: 'royalty' } });
  assert.equal(g.tax, 84);
});

test('план: рост 12 % в месяц, окт 2026 = 50 000 → окт 2027 ≈ 195 000', () => {
  const p = buildPlan({});
  assert.equal(p.length, 13);
  assert.equal(p[0].month, '2026-10');
  assert.equal(p[0].plan, 50000);
  assert.equal(p[1].plan, 56000);
  assert.equal(p[12].month, '2027-10');
  assert.ok(p[12].plan > 190000 && p[12].plan < 200000);
  assert.equal(buildPlan({ overrides: { '2026-11': 60000 } })[1].plan, 60000);
});
test('план/факт и среднее за 3 месяца', () => {
  assert.deepEqual(rollingAverage([10, 20, 30, 40], 3), [null, null, 20, 30]);
  const rows = goalRows(buildPlan({ count: 4 }), { '2026-10': 40000, '2026-11': 50000, '2026-12': 60000 }, '2026-12');
  assert.equal(rows[0].diff, -10000);
  assert.equal(rows[2].ma3, 50000);
  assert.equal(rows[3].fact, null);
  assert.equal(rows[2].partial, true);
});

test('история цен: предложение из продаж и цена на дату', () => {
  const s = [];
  for (const d of ['01', '02', '03']) s.push(mk(`2026-09-${d}`, 169, 1, 118.3));
  for (const d of ['04', '05', '06']) s.push(mk(`2026-09-${d}`, 109.85, 1, 76.9));
  s.push(mk('2026-09-05', 76.9, 1, 53.8)); // скидка в тот же день не должна «сбить» цену
  s.push(mk('2026-09-07', 169, 1, 118.3));
  s.push(mk('2026-09-08', 169, 1, 118.3));
  const ch = inferPriceChanges(s, bookIdFor('А'));
  assert.deepEqual(ch, [{ from: '2026-09-01', price: 169 }, { from: '2026-09-04', price: 109.85 }, { from: '2026-09-07', price: 169 }]);
  assert.equal(priceAt({ priceHistory: ch }, '2026-09-05'), 109.85);
  assert.equal(priceAt({ priceHistory: ch }, '2026-08-01'), null);
});

test('база пропускает дни другой рекламы этой книги', () => {
  const sales = [];
  // 01–14.09 без рекламы: 100 ₽/день; 15–30.09 шла прошлая реклама: 500 ₽/день; с 01.10 новая кампания: 400 ₽/день
  for (let i = 0; i < 14; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 100));
  for (let i = 0; i < 16; i++) sales.push(mk(addDays('2026-09-15', i), 100, 5, 500));
  for (let i = 0; i < 5; i++) sales.push(mk(addDays('2026-10-01', i), 100, 4, 400));
  const prev = { id: 'old', start: '2026-09-15', end: '2026-09-30', bookId: bookIdFor('А'), scope: 'book' };
  const cur = { id: 'new', start: '2026-10-01', end: '2026-10-05', bookId: bookIdFor('А'), scope: 'book', budget: 500 };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [prev, cur], dataEnd: '2026-10-05', baseDays: 14 };
  const m = campaignMetrics(cur, ctx);
  assert.equal(m.baseline, 100); // а не 500 из дней прошлой рекламы
  assert.equal(m.baseFrom, '2026-09-01');
  assert.equal(m.baseTo, '2026-09-14');
  assert.equal(m.payback, 400 - 100 - 100);
  assert.deepEqual(m.baseNotes, []);
  // без списка других кампаний — старое поведение (база = дни прошлой рекламы)
  assert.equal(campaignMetrics(cur, { ...ctx, campaigns: [] }).baseline, 500);
  // реклама другой книги базу не трогает
  const other = { ...prev, bookId: bookIdFor('Б') };
  assert.equal(campaignMetrics(cur, { ...ctx, campaigns: [other, cur] }).baseFrom, '2026-09-17');
});

test('база: мало данных и вынужденное пересечение помечаются', () => {
  const sales = [];
  for (let i = 0; i < 4; i++) sales.push(mk(addDays('2026-10-01', i), 100, 5, 500));
  for (let i = 0; i < 3; i++) sales.push(mk(addDays('2026-10-05', i), 100, 4, 400));
  const prev = { id: 'old', start: '2026-09-14', end: '2026-10-04', bookId: bookIdFor('А'), scope: 'book' };
  const cur = { id: 'new', start: '2026-10-05', end: '2026-11-07', bookId: bookIdFor('А'), scope: 'book', budget: 1000 };
  const m = campaignMetrics(cur, { sales, legacyDays: [], reports: [], campaigns: [prev, cur], dataEnd: '2026-10-07', baseDays: 14 });
  assert.equal(m.baseline, 500);
  assert.ok(m.baseNotes.includes('overlap'));
  assert.ok(m.baseNotes.includes('few'));
});

test('ручной результат дня: строка с полной ценой из роялти и ключом без дублей', async () => {
  const { manualSaleRow } = await import('../js/calc.js');
  const r = manualSaleRow({ date: '2026-10-06', book: 'А', kind: 'sale', qty: 3, royalty: 354.9 });
  assert.equal(r.price, 169);
  assert.equal(r.id, manualSaleRow({ date: '2026-10-06', book: 'А', kind: 'sale', qty: 5, royalty: 1 }).id);
  assert.notEqual(r.id, manualSaleRow({ date: '2026-10-06', book: 'А', kind: 'sub', qty: 3, royalty: 1 }).id);
  assert.equal(incomeSeries([r], [], '2026-10-06', '2026-10-06')[0].royalty, 354.9);
});

test('цель месяца: прогноз и сколько нужно в день', async () => {
  const { monthGoalStatus } = await import('../js/calc.js');
  const g = monthGoalStatus(50000, 10000, '2026-10-10');
  assert.equal(g.forecast, 31000);
  assert.equal(g.onTrack, false);
  assert.equal(g.daysLeft, 21);
  assert.equal(g.needPerDay, 1904.76);
  assert.equal(monthGoalStatus(50000, 52000, '2026-10-20').reached, true);
});

test('налог к уплате по месяцам и неоплаченный остаток', async () => {
  const { taxRows } = await import('../js/calc.js');
  const fin = { '2026-08': { taxBase: 10000, tax: 600 }, '2026-09': { taxBase: 36340.25, tax: 2180.42 }, '2026-10': { taxBase: 5000, tax: 300 } };
  const t = taxRows(['2026-08', '2026-09', '2026-10'], (k) => fin[k], { '2026-08': { taxPaid: true, taxPaidAt: '2026-09-20' } }, '2026-10-05');
  assert.equal(t.unpaid, 2180.42); // октябрь ещё идёт, август оплачен
  assert.deepEqual(t.unpaidMonths, ['2026-09']);
  assert.equal(t.rows[0].paidAt, '2026-09-20');
  assert.equal(t.rows[2].closed, false);
});

test('Rocket: не внесённые закончившиеся месяцы, продажи через Rocket и доля комиссии', async () => {
  const { rocketRows } = await import('../js/calc.js');
  const fin = { '2026-08': { royalty: 0 }, '2026-09': { royalty: 25438.4 }, '2026-10': { royalty: 5000 } };
  const r = rocketRows(['2026-08', '2026-09', '2026-10'], (k) => fin[k], { '2026-09': { rocketIndex: 34.9, rocketFee: 3730 } }, '2026-10-05');
  const sep = r.rows[1];
  assert.equal(sep.sales, 107); // 3730 / 34,9
  assert.equal(Math.round(sep.share * 1000) / 10, 14.7);
  assert.equal(sep.chargeBy, '2026-10-20');
  assert.deepEqual(r.missing, []); // август без продаж, сентябрь внесён, октябрь идёт
  assert.deepEqual(rocketRows(['2026-09'], (k) => fin[k], {}, '2026-10-05').missing, ['2026-09']);
});

test('сигнал по таргету: падение продаж и доход ниже порога, отложен после отчёта', async () => {
  const { targetAlert } = await import('../js/calc.js');
  const sales = [];
  for (let i = 0; i < 14; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 100)); // до рекламы 100 ₽/день
  for (let i = 0; i < 7; i++) sales.push(mk(addDays('2026-09-15', i), 100, 6, 600)); // первая неделя рекламы
  for (let i = 0; i < 7; i++) sales.push(mk(addDays('2026-09-22', i), 100, 3, 300)); // вторая — упало вдвое
  const c = { id: 'k', start: '2026-09-15', end: '2026-10-15', budget: 6200, bookId: bookIdFor('А'), scope: 'book' };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [c], dataEnd: '2026-09-28', baseDays: 14 };
  const a = targetAlert(c, ctx);
  assert.equal(a.last7, 300);
  assert.equal(a.prev, 600);
  assert.equal(a.drop, 0.5);
  assert.ok(a.reasons.includes('drop'));
  assert.ok(!a.reasons.includes('below')); // порог: 100 база + 200 расход/день = 300, не ниже
  assert.equal(a.snoozed, false);
  assert.equal(targetAlert(c, ctx, [{ campaignId: 'k', date: '2026-09-27' }]).snoozed, true);
  // всё хорошо — сигнала нет
  assert.equal(targetAlert(c, { ...ctx, dataEnd: '2026-09-21' }), null);
  // меньше 10 дней кампании — рано судить
  assert.equal(targetAlert(c, { ...ctx, dataEnd: '2026-09-20' }), null);
});
