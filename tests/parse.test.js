import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodeBuffer, parseStatistic, parseTargetReport, parseLegacy, makeBackup, readBackup, toCsv } from '../js/parse.js';
import { incomeSeries, sumSeries, diffSales } from '../js/calc.js';
import { rub, fmtDate, parseDateRu, parseNum } from '../js/format.js';

const sample = decodeBuffer(readFileSync(new URL('./fixtures/sample-statistic.csv', import.meta.url)));

test('Statistic: UTF-16, пропуск «Итого», склейка по ключу', () => {
  const r = parseStatistic(sample);
  assert.equal(r.rows.length, 4);
  assert.equal(r.total, 399);
  const a100 = r.rows.filter((x) => x.price === 100);
  assert.equal(a100.length, 2); // два дня
  assert.equal(r.rows.find((x) => x.kind === 'sub').book, 'Книга Б');
});

test('повторный импорт не задваивает', () => {
  const a = parseStatistic(sample).rows;
  const d = diffSales(a, parseStatistic(sample).rows);
  assert.deepEqual([d.added, d.changed, d.same, d.removeIds.length], [0, 0, 4, 0]);
});

test('импорт пересекающегося периода: новые добавляются, исчезнувшие в периоде удаляются', () => {
  const a = parseStatistic(sample).rows;
  const fewer = a.filter((x) => x.date === '2026-09-02' && x.price !== 70);
  const d = diffSales(a, fewer, true);
  assert.equal(d.removeIds.length, 0 + a.filter((x) => x.date === '2026-09-02' && x.price === 70).length);
  assert.equal(diffSales(a, fewer, false).removeIds.length, 0);
});

test('отчёт таргетологов: строки недель, «Итого» пропущено', () => {
  const t = [
    'Название кампании\tНеделя\tРасход\tПоказы\tКлики\tCPC\tCTR',
    'Итого\t\t7 536,99 ₽\t61 876\t920\t8,19 ₽\t1,49 %',
    'Ip – Yandex – Лана – Альпийский\t14.09.2026 – 20.09.2026\t2 718,72 ₽\t16 815\t327\t8,31 ₽\t1,94 %',
    'Ip – Yandex – Лана – Альпийский\t28.09.2026 – 04.10.2026\t1 835,25 ₽\t19 269\t221\t8,30 ₽\t1,15 %',
  ].join('\n');
  const r = parseTargetReport(t);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { name: 'Ip – Yandex – Лана – Альпийский', start: '2026-09-14', end: '2026-09-20', spend: 2718.72, impressions: 16815, clicks: 327 });
  assert.equal(r.rows[1].end, '2026-10-04');
});

test('старый трекер dohody.csv', () => {
  const r = parseLegacy('дата;доход;события;заметка\n01.08.2026;1 200,50;выложила главу | скидка;хороший день\n02.08.2026;800;;');
  assert.equal(r.days.length, 2);
  assert.equal(r.days[0].income, 1200.5);
  assert.deepEqual(r.days[0].events.map((e) => e.type), ['chapter', 'discount']);
});

test('резервная копия: туда и обратно', () => {
  const rows = parseStatistic(sample).rows;
  const back = readBackup(makeBackup({ settings: { taxRate: 6 }, sales: rows }));
  assert.equal(back.sales.length, 4);
  assert.equal(back.settings.taxRate, 6);
  assert.throws(() => readBackup('не json'));
  assert.throws(() => readBackup('{"a":1}'));
});

test('экспорт CSV экранирует', () => {
  const c = toCsv([{ a: 'x;y', b: 'он сказал "да"' }], [{ title: 'А', get: (r) => r.a }, { title: 'Б', get: (r) => r.b }]);
  assert.ok(c.includes('"x;y";"он сказал ""да"""'));
});

test('форматирование', () => {
  assert.equal(rub(25438.4), '25 438,40 ₽');
  assert.equal(rub(-1234.5, 0), '−1 235 ₽');
  assert.equal(fmtDate('2026-09-30'), '30.09.2026');
  assert.equal(parseDateRu('31.02.2026'), null);
  assert.equal(parseNum('2 718,72 ₽'), 2718.72);
  assert.equal(parseNum('1,49 %'), 1.49);
});

// Настоящая выгрузка (приватная, в репозиторий не кладётся): STAT_CSV=/путь/к/Statistic.csv npm test
const real = process.env.STAT_CSV;
test('КОНТРОЛЬ: сентябрь 2026 по настоящему Statistic.csv = 25 438,40 ₽', { skip: !(real && existsSync(real)) }, () => {
  const r = parseStatistic(decodeBuffer(readFileSync(real)));
  assert.equal(r.total, 25438.4);
  const sept = incomeSeries(r.rows, [], '2026-09-01', '2026-09-30');
  assert.equal(sumSeries(sept), 25438.4);
  assert.equal(r.rows.reduce((a, s) => a + s.qty, 0), 252);
  assert.equal(sept.find((d) => d.date === '2026-09-25').royalty, 2089.43);
});

test('скриншот продаж: строки таблицы «цена · кол-во · доход» по книге', async () => {
  const { parseSalesText } = await import('../js/parse.js');
  const text = `Статистика продаж
Альпийский развод. Он оставил меня умирать Продажа 169,00 7 828,10
Альпийский развод. Он оставил меня умирать Подписка 30,00 2 42,00
Звериная тропа для двоих Подписка 39,00 5 136,50
Итого 1 006,60`;
  const r = parseSalesText(text, 'Альпийский развод. Он оставил меня умирать');
  assert.deepEqual([r.sale.qty, r.sale.royalty, r.sale.gross], [7, 828.1, 1183]);
  assert.deepEqual([r.sub.qty, r.sub.royalty], [2, 42]);
  const all = parseSalesText(text);
  assert.equal(all.sub.qty, 7);
  const short = parseSalesText('Продажи: 12 шт\nНачислено 1 420,50 ₽');
  assert.equal(short.sale.qty, 12); assert.equal(short.royalty, 1420.5);
});

test('отчёт таргетолога сообщением: даты, расход, показы и клики', async () => {
  const { parseReportMessage: p } = await import('../js/parse.js');
  const T = { today: '2026-11-10' };
  assert.deepEqual(p('Отчет за 3–9 ноября: потрачено 5 230 ₽, показов 34 000, кликов 412', T), { start: '2026-11-03', end: '2026-11-09', spend: 5230, impressions: 34000, clicks: 412 });
  assert.equal(p('Добрый день! 03.11-09.11 расход 4870 руб, показы 21500, клики 298', T).spend, 4870);
  const x = p('с 28 октября по 3 ноября израсходовано 6 100,50 р. Переходов 350', T);
  assert.equal(x.start, '2026-10-28'); assert.equal(x.spend, 6100.5); assert.equal(x.clicks, 350);
  assert.equal(p('Неделя 27.10.2026 - 02.11.2026\nПотрачено: 5 000\nПоказы: 30 000\nКлики: 400', T).impressions, 30000);
  assert.equal(p('За 30.12–05.01 списано 3 000 ₽', T).start, '2025-12-30');
  assert.equal(p('привет как дела', T), null);
});
