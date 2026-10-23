import { test } from 'node:test';
import assert from 'node:assert/strict';
import { litnetView, litnetSummary } from '../direct/js/views/litnet.js';

const a=(rows=[])=>({
  ctx:()=>({today:'2026-10-23',data:{w_promolinks:rows,w_books:[{id:'b1',title:'Альпийский развод'}]}}),
  snap:()=>({campaigns:[]}),
});
test('Режим «Мой Литнет» аккуратно показывает пустое состояние и форму добавления',()=>{
  const html=litnetView(a()).html;
  assert.match(html,/Мой Литнет/);
  assert.match(html,/data-act="ln.new"/);
  assert.doesNotMatch(html,/data-act="ln.edit"/);
});
test('Привязанные ссылки и ручные читатели представлены в своей карточке',()=>{
  const html=litnetView(a([{id:'u1',bookId:'b1',campaign:'Альпийский развод · тест',url:'https://litnet.com/ref/abc-123',expires:'2026-11-18',readers:96,status:'active'}])).html;
  assert.match(html,/Альпийский развод/);
  assert.match(html,/utm_litref=abc-123/);
  assert.match(html,/Новые читатели · вручную/);
  assert.match(html,/96/);
  assert.match(html,/17\.11\.2026/);
  assert.match(litnetSummary(a([{id:'u1',bookId:'b1',campaign:'тест',url:'https://litnet.com/ref/abc-123',expires:'2026-11-18',status:'active'}])),/Мой Литнет/);
});
test('Просроченная ссылка не называется сломанной',()=>{
  const html=litnetView(a([{id:'u1',book:'Черная вдова',campaign:'Тест',url:'https://litnet.com/ref/abc',expires:'2026-10-21',status:'active'}])).html;
  assert.match(html,/Новые привязки не создаются/);
  assert.match(html,/Сама ссылка продолжает открываться/);
});
