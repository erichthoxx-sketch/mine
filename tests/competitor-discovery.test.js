import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverySources,rankPublicBooks,publicBundleCards} from '../direct/js/competitor-discovery.js';
import {competitorsView} from '../direct/js/views/competitors.js';

test('Предлагаем тематические источники по книге, без закрытого поиска',()=>{
  const sources=discoverySources({title:'Развод для черной вдовы'},[], 'дарк роман, похищение, одержимость');
  assert.equal(sources[0].name,'Дарк романс');
  assert.ok(sources.every(x=>x.url.startsWith('https://litnet.com/ru/bundle/')));
});
test('Кандидатов ранжируем по пересечению темы, не объявляя продажи или успешность',()=>{
  const selected={title:'Развод для черной вдовы',description:'герой похищает, его одержимость и криминал'};
  const rows=[
    {url:'https://litnet.com/ru/book/1',title:'Нежная весна',description:'цветы и природа'},
    {url:'https://litnet.com/ru/book/2',title:'Его одержимость',description:'похищение, криминал и одержимость'}
  ];
  const out=rankPublicBooks(rows,selected,[],'');
  assert.equal(out[0].title,'Его одержимость');
  assert.ok(out[0].overlap>out[1].overlap);
  assert.ok(!Object.hasOwn(out[0],'sales'));
});
test('Без DOMParser нет ложных книг или догадок на основе непарсенной страницы',()=>{
  if(typeof DOMParser==='undefined')assert.deepEqual(publicBundleCards('<a href="/ru/book/a-b111">A</a>'),[]);
});
test('В анализе конкурентов есть кнопка автоматического подбора с проверкой перед сохранением',()=>{
  const a={ctx:()=>({data:{d_competitors:[],d_keywords:[],w_books:[{id:'book1',title:'Развод для черной вдовы'}]}}),ui:{kwBook:'book1'}};
  const html=competitorsView(a).html;
  assert.match(html,/data-act="cmp.find"/);
  assert.match(html,/Бесплатный подбор/);
  assert.doesNotMatch(html,/data-act="cmp.addsuggest"/);
});
