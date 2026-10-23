import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linksView} from '../writer/js/views/links.js';

const ctx = (n=0) => ({
  data:{
    w_links:[{id:'litnet',name:'Литнет',kind:'platform',net:'Литнет'}],
    w_waiting:[],
    w_promolinks:Array.from({length:n},(_,i)=>({id:String(i),channel:'social',campaign:'Threads',status:'active'})),
  },
});
const render = (n=0,q='')=>linksView({ctx:()=>ctx(n),ui:{linkQ:q}}).html;
test('Соцсети в Связях — такая же группа, как Площадки, без отдельно стоящей круглой кнопки',()=>{
  const html=render(2);
  assert.match(html, /<h2>Соцсети<\/h2>/);
  assert.match(html, /<div class="card list"><a class="item row between" href="#" data-act="go" data-to="\/social">/);
  assert.match(html, /<b>Мой Литнет<\/b><span class="sub">Персональные ссылки · 2 ссылки<\/span>/);
  assert.match(html, /<h2>Площадки <span class="muted">1<\/span><\/h2>/);
  assert.doesNotMatch(html, /<button[^>]+data-to="\/social"/);
  assert.ok(html.indexOf('<h2>Соцсети</h2>') > html.indexOf('Запросы без ответа'));
  assert.ok(html.indexOf('<h2>Площадки') > html.indexOf('<h2>Соцсети</h2>'));
});
test('Общие шрифты и размеры из дизайн-системы, без отдельного стиля для соцсетей',()=>{
  const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
  assert.match(css,/\.list \.item, \.list a\.item \{ font-size: 15px; \}/);
  assert.match(css,/\.psec-h h2 \{ margin: 0; font-size: 18px; \}/);
  assert.doesNotMatch(render(3),/Соцсети · ссылки «Мой Литнет» →/);
});
test('Поиск по связям: блок соцсетей не перебивает нерелевантные результаты',()=>{
  assert.doesNotMatch(render(3,'несуществующий'),/data-to="\/social"/);
  assert.match(render(3,'threads'),/data-to="\/social"/);
});
