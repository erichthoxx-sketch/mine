import test from 'node:test';
import assert from 'node:assert/strict';
import {safePublicBookUrl, competitorInsights, tokens} from '../direct/js/competition.js';
import {competitorsView} from '../direct/js/views/competitors.js';
import {keywordsView} from '../direct/js/views/keywords.js';

test('No private URLs or unsafe schemes fetched for competitor intelligence',()=>{
  assert.equal(safePublicBookUrl('https://litnet.com/ru/book/a-12'),'https://litnet.com/ru/book/a-12');
  assert.equal(safePublicBookUrl('https://author.today/work/123'),'https://author.today/work/123');
  assert.equal(safePublicBookUrl('http://litnet.com/book/1'),'');
  assert.equal(safePublicBookUrl('https://evil.example/'),'');
  assert.equal(safePublicBookUrl('javascript:alert(1)'),'');
});
test('Competitor motif comparison only uses supplied publicly visible text',()=>{
  const out=competitorInsights('криминальная любовь похищение',[
    {description:'Мрачный герой, вынужденная близость и похищение'},
    {description:'Властный герой, ревность, вынужденная близость'}
  ]);
  assert.equal(out.analyzed,2);
  assert.ok(out.repeated.some(x=>x.term==='вынужденная'));
  assert.ok(out.repeated.some(x=>x.term==='близость'));
  assert.ok(out.gap.includes('вынужденная'));
  assert.ok(!tokens('КНИГА любовный роман').includes('роман'));
});
test('Competitor UI describes evidence limits and links to public books only',()=>{
  const a={ctx:()=>({data:{d_competitors:[],d_keywords:[]},settings:{}})};
  const html=competitorsView(a).html;
  assert.match(html,/Конкурентная разведка/);
  assert.match(html,/закрытой статистики|Данные о чужих расходах/);
  assert.match(html,/data-act="cmp.new"/);
});
test('Keywords UI links read-only campaign and competitor research without adding to ads',()=>{
  const a={ctx:()=>({data:{w_books:[{id:'b',title:'Книга'}],d_keywords:[],d_kw_bindings:[]},settings:{}}),
    ui:{kwBook:'b',kwFilter:'all'},snap:id=>id==='main'?{campaigns:[],keywords:[]}:{}};
  const h=keywordsView(a).html;
  assert.match(h,/Связь с моей кампанией/);
  assert.match(h,/data-chg="kw.campaign"/);
  assert.match(h,/data-to="\/competitors"/);
  assert.match(h,/Кампании таргетологов из другого кабинета недоступны/);
});
