import test from 'node:test';
import assert from 'node:assert/strict';
import {
  r2, addDays, countDays, weekStart, monthKey, addMonths, incomeSeries, sumSeries, movingAverage, byWeek, byMonth,
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
  const discounts = litnetDiscounts({ '2026-09': 10000 }, {}, { '2026-09': {} }); // скидка 2000, подтверждена
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

test('база: 14 последних чистых дней до старта (без любой другой рекламы, ищем раньше); своя — для примерки', () => {
  const sales = [];
  for (let i = 0; i < 30; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, i >= 14 && i <= 17 ? 900 : 100)); // 15–18.09 — 900 ₽ (шла другая реклама)
  const other = { id: 'old', start: '2026-09-15', end: '2026-09-18', bookId: bookIdFor('Б'), scope: 'book' }; // даже по другой книге
  const cur = { id: 'new', start: '2026-09-20', end: '2026-09-30', bookId: bookIdFor('А'), scope: 'book', budget: 1100 };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [other, cur], dataEnd: '2026-09-30', baseDays: 14 };
  const m = campaignMetrics(cur, ctx);
  // 19.09 и 14…02.09 — 14 чистых дней по 100 ₽; 15–18.09 пропущены
  assert.equal(m.baseline, 100);
  assert.equal(m.baseDaysUsed, 14);
  assert.equal(m.baseFrom, '2026-09-02');
  assert.equal(m.baseTo, '2026-09-19');
  assert.deepEqual(m.baseNotes, []);
  // своя база (примерка) — считается как задано, с пометкой о рекламе в периоде
  const r = campaignMetrics({ ...cur, baseMode: 'range', baseFrom: '2026-09-15', baseTo: '2026-09-18' }, ctx);
  assert.equal(r.baseline, 900);
  assert.ok(r.baseNotes.includes('overlap'));
});

test('база: кампания сразу после другой — база сама уходит раньше её', () => {
  const sales = [];
  for (let i = 0; i < 13; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 216)); // 01–13.09 без рекламы
  for (let i = 0; i < 21; i++) sales.push(mk(addDays('2026-09-14', i), 100, 9, 1000)); // 14.09–04.10 «тестовый»
  const test = { id: 't', start: '2026-09-14', end: '2026-10-04', scope: 'all', budget: 10000 };
  const alp = { id: 'a', start: '2026-10-05', end: '2026-11-07', scope: 'all', budget: 20000 };
  const m = campaignMetrics(alp, { sales, legacyDays: [], reports: [], campaigns: [test, alp], dataEnd: '2026-10-05', baseDays: 14 });
  assert.equal(m.baseFrom, '2026-09-01');
  assert.equal(m.baseTo, '2026-09-13');
  assert.equal(m.baseline, 216);
});

test('база: меньше 5 чистых дней — предупреждение, нет чистых дней — базы нет', () => {
  const sales = [];
  for (let i = 0; i < 20; i++) sales.push(mk(addDays('2026-09-11', i), 100, 1, 100)); // данные с 11.09
  const other = { id: 'old', start: '2026-09-14', end: '2026-09-16', scope: 'all' };
  const cur = { id: 'new', start: '2026-09-20', end: '2026-09-30', scope: 'all', budget: 1100 };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [other, cur], dataEnd: '2026-09-30', baseDays: 14 };
  const m = campaignMetrics(cur, ctx); // чистые: 11–13 и 17–19 = 6 → без предупреждения
  assert.equal(m.baseDaysUsed, 6);
  assert.deepEqual(m.baseNotes, []);
  const few = campaignMetrics(cur, { ...ctx, campaigns: [{ ...other, start: '2026-09-12' }, cur] }); // чистые: 11, 17–19 = 4
  assert.equal(few.baseDaysUsed, 4);
  assert.ok(few.baseNotes.includes('few'));
  const none = campaignMetrics(cur, { ...ctx, campaigns: [{ ...other, start: '2026-09-01', end: '2026-09-19' }, cur] });
  assert.equal(none.baseline, null);
});

test('пересечение кампаний: предупреждение и прирост делится по расходу в день', async () => {
  const { campaignOverlaps } = await import('../js/calc.js');
  const sales = [];
  for (let i = 0; i < 14; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 100)); // база 100
  for (let i = 0; i < 10; i++) sales.push(mk(addDays('2026-09-15', i), 100, 5, 500)); // 15–24.09: 500
  const a = { id: 'a', name: 'А', start: '2026-09-15', end: '2026-09-24', budget: 3000, scope: 'all' }; // 300/день
  const b = { id: 'b', name: 'Б', start: '2026-09-20', end: '2026-09-24', budget: 500, scope: 'all' }; // 100/день
  assert.deepEqual(campaignOverlaps(a, [a, b]), [{ id: 'b', name: 'Б', from: '2026-09-20', to: '2026-09-24' }]);
  assert.deepEqual(campaignOverlaps(b, [a, b]), [{ id: 'a', name: 'А', from: '2026-09-20', to: '2026-09-24' }]);
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [a, b], dataEnd: '2026-09-24', baseDays: 14 };
  const ma = campaignMetrics(a, ctx), mb = campaignMetrics(b, ctx);
  // прирост дня 400: в 15–19.09 весь А; в 20–24.09 делится 3:1 → А 300, Б 100
  assert.equal(ma.uplift, (5 * 400 + 5 * 300) / 10);
  assert.equal(mb.uplift, 100);
  assert.equal(ma.overlapDays, 5);
  // сумма приписанного прироста = реальному приросту, ничего не задвоено
  assert.equal(ma.uplift * 10 + mb.uplift * 5, 10 * 400);
});

test('расход по месяцам: бюджет ÷ дни кампании, только прошедшие дни; прогноз на месяц', async () => {
  const { monthSpendForecast, campaignDailySpend } = await import('../js/calc.js');
  const alp = { id: 'alp', channel: 'litnet', start: '2026-10-05', end: '2026-11-07', budget: 20000 }; // 34 дня
  const sp = spendByMonthChannel([alp], [], {}, '2026-10-05');
  assert.equal(sp['2026-10'].litnet, 588.24); // 20 000 ÷ 34 × 1 день
  assert.equal(sp['2026-11'], undefined); // будущие дни не тратятся
  const f = monthSpendForecast([alp], [], '2026-10-05');
  assert.ok(Math.abs(f.litnet - 15882.35) < 0.02); // 05–31.10 = 27 дней × 588,24
  // фактический расход из отчёта заменяет бюджет в своих днях
  const d = campaignDailySpend(alp, [{ campaignId: 'alp', start: '2026-10-05', end: '2026-10-11', spend: 7000 }], '2026-10-12');
  assert.equal(r2(d['2026-10-05']), 1000);
  assert.equal(r2(d['2026-10-12']), 588.24);
});

test('скидка «Литнет платит» идёт в чистый автоматически; сумма из отчёта, если есть, заменяет расчёт', () => {
  const d = litnetDiscounts({ '2026-09': 12000, '2026-10': 15000 }, {}, { '2026-09': { amount: 2300 } });
  assert.equal(d['2026-09'].status, 'confirmed');
  assert.equal(d['2026-09'].expected, 2400);
  assert.equal(d['2026-09'].discount, 2300); // фактическая сумма
  assert.equal(d['2026-09'].applied, 2300);
  assert.equal(d['2026-10'].status, 'expected');
  assert.equal(d['2026-10'].expected, 2540); // (15000 − 2300) × 20 %
  assert.equal(d['2026-10'].applied, 2540);
  const f = monthFinance('2026-10', { sales: [], legacyDays: [], spend: { '2026-10': { litnet: 15000, own: 0, other: 0 } }, discounts: d, months: {}, settings: { taxRate: 4 } });
  assert.equal(f.adSpend, 15000);
  assert.equal(f.litnetDiscount, 2540);
  assert.equal(f.net, -12460); // 0 + 2540 − 15000
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

test('выкладка глав: подписки в дни выкладки и без', async () => {
  const { chapterEffect } = await import('../js/calc.js');
  const b = { id: bookIdFor('А'), title: 'А' };
  const sales = [mk('2026-09-01', 50, 6, 210, 'А', 'sub'), mk('2026-09-02', 50, 2, 70, 'А', 'sub'), mk('2026-09-03', 50, 4, 140, 'А', 'sub')];
  const days = [{ date: '2026-09-01', events: [{ type: 'chapter', bookId: b.id }] }, { date: '2026-09-03', events: [{ type: 'chapter', bookId: 'другая' }] }];
  const [r] = chapterEffect(sales, days, [b], '2026-09-01', '2026-09-03');
  assert.equal(r.chapterDays, 1);
  assert.equal(r.subsOn, 6);
  assert.equal(r.subsOff, 3); // (2 + 4) / 2
});

test('«Литнет платит» по оферте: порог и скидка от использованного бюджета, предел — комиссия Литнета', async () => {
  const { litnetPaymentsByMonth, litnetDiscountBase, litnetMoneyByMonth, monthSpendForecast } = await import('../js/calc.js');
  const camps = [
    { id: 'a', channel: 'litnet', budget: 20000, start: '2026-10-05', end: '2026-11-07' },
    { id: 't', channel: 'litnet', budget: 10000, start: '2026-09-14', end: '2026-10-04', paidAt: '2026-09-12' },
    { id: 'o', channel: 'own', budget: 5000, start: '2026-10-01', end: '2026-10-10' },
  ];
  const today = '2026-10-05';
  const pay = litnetPaymentsByMonth(camps); // оплаты — только для справки
  assert.deepEqual(pay, { '2026-10': 20000, '2026-09': 10000 });
  const spend = spendByMonthChannel(camps, [], {}, today);
  const used = litnetDiscountBase(spend, monthSpendForecast(camps, [], today), today);
  assert.ok(Math.abs(used['2026-09'] - 8095.24) < 0.01); // 10000 / 21 × 17
  assert.ok(Math.abs(used['2026-10'] - 17787.11) < 0.01); // прогноз: 10000/21 × 4 + 20000/34 × 27
  assert.equal(used['2026-11'], undefined);
  const money = litnetMoneyByMonth([{ date: '2026-09-02', price: 3634.025, qty: 10, royalty: 25438.4 }, { date: '2026-09-03', price: 1000, qty: 1, royalty: 700, platform: 'Литмаркет' }]);
  assert.deepEqual(money, { '2026-09': { gross: 36340.25, royalty: 25438.4, fee: 10901.85 } });
  const d = litnetDiscounts(used, { forecastMonth: '2026-10', payments: pay, caps: { '2026-09': money['2026-09'].fee } });
  const sep = d['2026-09'], oct = d['2026-10'];
  assert.equal(sep.qualified, false); assert.equal(sep.discount, 0); assert.equal(sep.status, 'expected');
  assert.equal(sep.paid, 10000); assert.equal(sep.fee, 10901.85); assert.equal(sep.payoutMonth, '2026-10');
  assert.equal(oct.forecast, true); assert.equal(oct.payoutMonth, '2026-11');
  assert.ok(Math.abs(oct.expected - 3557.42) < 0.01); // (17 787,11 − 0) × 20 %
  // текущий месяц: в чистый — скидка на сегодня от уже открутившегося бюджета, прогноз — отдельно
  const t = litnetDiscounts(used, { forecastMonth: '2026-10', toDate: { used: 3081.19, fee: 5000 } })['2026-10'];
  assert.equal(t.forecastDiscount, 3557.42); assert.equal(t.usedToDate, 3081.19);
  assert.equal(t.discount, 616.24); assert.equal(t.applied, 616.24); // 3 081,19 × 20 %
  assert.equal(litnetDiscounts(used, { forecastMonth: '2026-10', toDate: { used: 3081.19, fee: 300 } })['2026-10'].discount, 299); // не больше комиссии на сегодня − 1 ₽
  // предел: комиссия минус 1 ₽
  const capped = litnetDiscounts({ '2026-09': 20000 }, { caps: { '2026-09': 1500 } });
  assert.equal(capped['2026-09'].expected, 1499); assert.equal(capped['2026-09'].capped, true);
  // скидка прошлого месяца: подтверждённая сумма вместо расчётной
  const c2 = litnetDiscounts({ '2026-09': 15000, '2026-10': 20000 }, {}, { '2026-09': { amount: 2500 } });
  assert.equal(c2['2026-09'].discount, 2500); assert.equal(c2['2026-09'].confirmedAmount, 2500); assert.equal(c2['2026-09'].applied, 2500);
  assert.equal(c2['2026-10'].expected, 3500); // (20000 − 2500) × 20 %
  assert.equal(c2['2026-10'].applied, 3500);
});

test('финансы месяца: чистый, ожидаемая выплата, сверка и деньги на руках', async () => {
  const { monthCash } = await import('../js/calc.js');
  const sales = [{ date: '2026-09-10', book: 'К', bookId: 'k', kind: 'sale', qty: 10, price: 3634.025, royalty: 25438.4 }];
  const spend = { '2026-09': { litnet: 8095.24, own: 0, other: 0 }, '2026-10': { litnet: 3081, own: 500, other: 0 } };
  const discounts = litnetDiscounts({ '2026-09': 12000 }, {}, {}); // ожидается 2400
  const months = { '2026-09': { rocketFee: 940, payoutActual: 26800 } };
  const settings = { taxRate: 4, taxBase: 'gross' };
  const f = monthFinance('2026-09', { sales, legacyDays: [], spend, discounts, months, settings });
  assert.equal(f.litnetFee, 10901.85);
  assert.equal(f.adSpend, 8095.24); // использованный бюджет, не оплата
  assert.equal(f.tax, 1453.61);
  assert.equal(f.net, 17349.55); // 25438,40 + 2400 − 940 − 8095,24 − 1453,61 — скидка учтена автоматически
  assert.equal(f.payoutExpected, 26898.4); // 25438,40 − 940 + 2400
  assert.equal(f.payoutDiscountExpected, true);
  assert.equal(f.payoutDiff, -98.4);
  const finOf = (k) => monthFinance(k, { sales, legacyDays: [], spend, discounts, months, settings });
  const cash = monthCash('2026-10', finOf, { payments: { '2026-10': 20000 }, spend, months });
  assert.equal(cash.received, 26800); assert.equal(cash.receivedEstimated, false);
  assert.equal(cash.paidAds, 20500); assert.equal(cash.taxPaid, 1453.61);
  assert.equal(cash.cash, 4846.39);
  // до начала данных выплата неизвестна
  const early = monthCash('2026-09', finOf, { payments: { '2026-09': 10000 }, spend, months, firstMonth: '2026-09' });
  assert.equal(early.received, null); assert.equal(early.cash, null);
});

test('метрики кампании за календарный месяц (period)', () => {
  const sales = [];
  for (const dt of ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-10-01', '2026-10-02'])
    sales.push({ date: dt, book: 'К', bookId: 'k', kind: 'sale', qty: 1, royalty: 100 });
  const c = { id: 't', channel: 'litnet', budget: 2100, start: '2026-09-14', end: '2026-10-04' };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [c], dataEnd: '2026-10-02', today: '2026-10-02' };
  const sep = campaignMetrics(c, { ...ctx, period: { from: '2026-09-01', to: '2026-09-30' } });
  assert.equal(sep.days, 17); assert.equal(sep.spendTotal, 1700);
  const oct = campaignMetrics(c, { ...ctx, period: { from: '2026-10-01', to: '2026-10-31' } });
  assert.equal(oct.days, 2); assert.equal(oct.spendTotal, 200);
  assert.equal(campaignMetrics(c, { ...ctx, period: { from: '2026-11-01', to: '2026-11-30' } }).status, 'planned');
});

test('сводка кампании: бюджет израсходован и сколько реклама вернула', async () => {
  const { campaignProgress } = await import('../js/calc.js');
  const c = { start: '2026-10-05', end: '2026-11-07', budget: 20000 };
  const p = campaignProgress(c, { uplift: 400, days: 2, spendTotal: 1176.47 }, '2026-10-06');
  assert.equal(p.day, 2); assert.equal(p.total, 34); assert.equal(p.daysLeft, 32);
  assert.equal(p.spentToDate, 1176.47);
  assert.equal(p.returned, 800);
  assert.equal(Math.round(p.returnShare * 100), 68);
});

test('ручные продажи с других площадок не стираются выгрузкой Литнета', async () => {
  const { manualSaleRow, diffSales } = await import('../js/calc.js');
  const lm = manualSaleRow({ date: '2026-10-02', book: 'А', kind: 'sale', qty: 2, royalty: 150, gross: 300, platform: 'Литмаркет' });
  assert.equal(lm.price, 150); // 300 ÷ 2
  assert.equal(lm.platform, 'Литмаркет');
  const lnManual = manualSaleRow({ date: '2026-10-02', book: 'А', kind: 'sale', qty: 1, royalty: 70 });
  assert.notEqual(lm.id, lnManual.id);
  const fromFile = [{ id: 'x', date: '2026-10-02', qty: 1, royalty: 70 }];
  const d = diffSales([lm, lnManual], fromFile, true);
  assert.deepEqual(d.removeIds, [lnManual.id]); // ручная строка Литнета заменяется точной, Литмаркет остаётся
});

test('сводка по рекламе: окупаемость в день, сколько вернула, бюджет по плану', async () => {
  const { adGroupSummary } = await import('../js/calc.js');
  const sales = [];
  for (let i = 0; i < 14; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 100));
  for (let i = 0; i < 10; i++) sales.push(mk(addDays('2026-09-15', i), 100, 5, 500));
  const a = { id: 'a', start: '2026-09-15', end: '2026-10-14', budget: 9000, scope: 'all', channel: 'litnet' }; // 300/день
  const extra = { id: 'x', start: '2026-09-20', end: '2026-09-20', budget: 700, channel: 'other', oneOff: true };
  const ctx = { sales, legacyDays: [], reports: [], campaigns: [a, extra], dataEnd: '2026-09-24', baseDays: 14, today: '2026-09-24' };
  const s = adGroupSummary([a, extra], ctx);
  assert.equal(s.live, 1);
  assert.equal(s.perDaySpend, 300);
  assert.equal(s.perDayUplift, 400);
  assert.equal(s.perDayPayback, 100);
  assert.equal(s.returned, 4000); // 10 дней × 400
  assert.equal(s.spent, 3000 + 700);
  assert.equal(Math.round(s.returnShare * 100), 133); // 4000 / 3000 (разовый расход без данных о доходе)
  assert.equal(s.paid, 9000);
  assert.equal(s.plannedSpent, 3000);
});

test('аналитика дня: против среднего за 7 дней и против прошлой недели', async () => {
  const { dayStats } = await import('../js/calc.js');
  const sales = [];
  for (let i = 0; i < 7; i++) sales.push(mk(addDays('2026-09-01', i), 100, 1, 100));
  sales.push(mk('2026-09-08', 100, 2, 150));
  const d = dayStats(sales, [], '2026-09-08');
  assert.equal(d.royalty, 150);
  assert.equal(d.avg7, 100);
  assert.equal(d.vsAvg, 0.5);
  assert.equal(d.weekAgo, 100);
});

test('сводка: кампания уже идёт по датам, но выгрузки за её дни ещё нет', async () => {
  const { adGroupSummary } = await import('../js/calc.js');
  const sales = [mk('2026-09-30', 100, 1, 100)];
  const k = { id: 'a', start: '2026-10-05', end: '2026-11-07', budget: 20000, scope: 'all', channel: 'litnet' };
  const s = adGroupSummary([k], { sales, legacyDays: [], reports: [], campaigns: [k], dataEnd: '2026-09-30', baseDays: 14, today: '2026-10-06' });
  assert.equal(s.live, 1);
  assert.equal(s.perDaySpend, 588.24);
  assert.equal(s.perDayPayback, null);
  assert.equal(s.paid, 20000);
  assert.equal(s.plannedSpent, 1176.47); // 2 дня по плану
});
