import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeSalesImport, incomeSeries, dayStats, booksBreakdown, sumSeries, monthFinance } from '../js/calc.js';
import { parseStatistic } from '../js/parse.js';
import { financialLedger, financialReconcile } from '../js/sales-integrity.js';

const sample = (id,royalty,qty,book='Альпийский развод',date='2026-10-25') =>
  ({ id,date,book,bookId:'b_'+book,platform:'Литнет',kind:'sale',price:169,qty,royalty });
const earlier = [sample('a',736,6),sample('b',1400,12,'Звериная тропа')];

test('Неполная выгрузка одной книги не удаляет продажи остальных',()=>{
  const r=safeSalesImport(earlier,[sample('a',736,6)]);
  assert.equal(r.rows.length,0);
  assert.equal(r.retained,1);
  assert.equal(earlier.reduce((s,x)=>s+x.royalty,0),2136);
});
test('Загрузка старой выгрузки не может уменьшить уже сохраненную строку',()=>{
  const r=safeSalesImport(earlier,[sample('a',400,3)]);
  assert.equal(r.held,1);
  assert.deepEqual(r.rows,[]);
});
test('Новая выгрузка увеличивает строку, оставляя остальные продажи',()=>{
  const r=safeSalesImport(earlier,[sample('a',850,7)]);
  assert.equal(r.increased,1);
  const updated=earlier.map(x=>r.rows.find(s=>s.id===x.id)||x);
  assert.equal(updated.reduce((s,x)=>s+x.royalty,0),2250);
});
test('Ручные продажи не удваиваются при импорте точных строк',()=>{
  const manual={...sample('manual',2100,18),manual:true};
  const imported=[sample('csv',2200,20)];
  const out=financialLedger([manual,...imported]);
  assert.equal(out.sales.length,1);
  assert.equal(out.sales[0].id,'csv');
  assert.equal(out.warnings.length,0);
});
test('Ручная оценка не заменяется неполной выгрузкой молча',()=>{
  const manual={...sample('manual',2100,18),manual:true};
  const out=financialLedger([manual,sample('csv',736,6)]);
  assert.equal(out.sales.length,1);
  assert.equal(out.sales[0].royalty,2100);
  assert.equal(out.warnings[0].type,'manual-conflict');
});
test('Несколько цен и книг корректно складываются по дням, книгам и месяцам',()=>{
  const data=[sample('a',736,6),sample('b',1400,12,'Звериная тропа'),sample('c',200,2,'Звериная тропа','2026-10-24')];
  const ledger=financialLedger(data).sales;
  const expected=2336;
  const raw=financialReconcile(ledger,'2026-10-01','2026-10-31');
  assert.equal(raw.total,expected);
  assert.equal(raw.booksTotal,expected);
  assert.equal(raw.daysTotal,expected);
  assert.equal(sumSeries(incomeSeries(ledger,[],'2026-10-01','2026-10-31')),expected);
  assert.equal(booksBreakdown(ledger,'2026-10-01','2026-10-31').reduce((s,x)=>s+x.royalty,0),expected);
  assert.equal(dayStats(ledger,[],'2026-10-25').royalty,2136);
});
test('Некорректная денежная строка не портит сумму всей аналитики',()=>{
  const out=financialLedger([sample('a',736,6),{...sample('bad',Infinity,8)}]);
  assert.equal(out.sales.length,1);
  assert.equal(out.warnings[0].type,'invalid-rows');
});
test('Парсер сообщает о поврежденных строках и указанном в CSV итоговом гонораре',()=>{
  const text=[
    'Статистика продаж',
    'Дата/месяц\tКнига\tПодписка/продажа\tЦена\tКол-во\tГонорар',
    '25.10.2026\tАльпийский развод\tПродажа\t169.00\t6\t736.00',
    '25.10.2026\tЗвериная тропа\tПродажа\t169.00\tошибка\t1400.00',
    '\t\t\tИтого: 18\t2136,00 RUB',
  ].join('\n');
  const result=parseStatistic(text);
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.invalidRows,[4]);
  assert.equal(result.totalReported,2136);
  assert.equal(result.total,736);
});
test('Повторный импорт не требует галочек и ведет историю перед записью',()=>{
  const source=readFileSync(new URL('../js/views/data.js',import.meta.url),'utf8');
  assert.match(source,/safeSalesImport\(old,r\.rows\)/);
  assert.match(source,/await saveImportHistory\(plan\.rows, old, 'Statistic\.csv'\)/);
  assert.match(source,/r\.invalidRows\.length/);
  assert.match(source,/r\.totalReported != null/);
  assert.doesNotMatch(source,/name="rm"/);
  assert.doesNotMatch(source,/name="allowLower"/);
  assert.doesNotMatch(source,/removeMany\('sales'/);
});

test('Новая цена без старой строки в файле не приводит к двойному начислению',()=>{
  const previous=[sample('price169',736,6)];
  const partial=[{...sample('price169',736,6),id:'price199',price:199}];
  const plan=safeSalesImport(previous,partial);
  assert.equal(plan.ambiguous,1);
  assert.equal(plan.rows.length,0);
  const full=safeSalesImport(previous,[previous[0],partial[0]]);
  assert.equal(full.added,1);
});
test('Первичная загрузка и повторный импорт одинакового файла идемпотентны',()=>{
  const first=safeSalesImport([],earlier);
  assert.equal(first.added,2);
  const second=safeSalesImport(earlier,earlier);
  assert.equal(second.rows.length,0);
  assert.equal(second.same,2);
});
test('До подтверждения загрузки всех финансовых коллекций суммы скрыты',()=>{
  const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.match(app,/COLLECTIONS\.every\(name => store\.loaded\?\.\[name\]\)/);
  assert.match(app,/store\.settingsServerLoaded/);
  assert.match(app,/До сверки суммы скрыты/);
});
