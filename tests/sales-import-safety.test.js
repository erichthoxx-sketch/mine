import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffSales } from '../js/calc.js';

test('Неполный Statistic.csv не может инициировать удаление продаж остальных книг',()=>{
 const old=[
  {id:'a',date:'2026-10-25',book:'Альпийский развод',qty:6,royalty:736,platform:'Литнет'},
  {id:'b',date:'2026-10-25',book:'Звериная тропа',qty:12,royalty:1400,platform:'Литнет'}
 ];
 const uploaded=[old[0]];
 const safe=diffSales(old,uploaded,false);
 assert.deepEqual(safe.removeIds,[]);
 const view=readFileSync(new URL('../js/views/data.js',import.meta.url),'utf8');
 assert.match(view,/diffSales\(c\.sales, r\.rows, false\)/);
 assert.doesNotMatch(view,/removeMany\('sales', d\.removeIds\)/);
 assert.doesNotMatch(view,/name="rm" checked/);
});

test('Сокращение количества или гонорара требует явного подтверждения',()=>{
 const view=readFileSync(new URL('../js/views/data.js',import.meta.url),'utf8');
 assert.match(view,/const reductions = r\.rows\.filter/);
 assert.match(view,/name="allowLower"/);
 assert.match(view,/const allowLower = !!fd\.get\('allowLower'\)/);
 assert.match(view,/!allowLower && \(s\.qty < e\.qty \|\| s\.royalty \+ 0\.004 < e\.royalty\)/);
});

test('Файл, в котором осталась одна книга, не может понизить доход за день за счет удаления других книг',()=>{
 const old=[
  {id:'a',date:'2026-10-25',book:'Альпийский развод',qty:6,royalty:736,platform:'Литнет'},
  {id:'b',date:'2026-10-25',book:'Звериная тропа',qty:12,royalty:1400,platform:'Литнет'}
 ];
 const incoming=[{...old[0],qty:4,royalty:480}];
 const d=diffSales(old,incoming,false);
 assert.deepEqual(d.removeIds,[]);
 const lower=incoming.filter(s=>{
   const ex=old.find(e=>e.id===s.id);
   return ex && (s.qty<ex.qty||s.royalty+0.004<ex.royalty);
 });
 assert.equal(lower.length,1);
 assert.equal(old.reduce((s,x)=>s+x.royalty,0),2136);
});
