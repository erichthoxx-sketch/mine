import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { taxonomyPanel } from '../direct/js/views/book-taxonomy.js';
import { competitorsView } from '../direct/js/views/competitors.js';
import { keywordsView } from '../direct/js/views/keywords.js';
import { rankPublicBooks } from '../direct/js/competitor-discovery.js';

const book = { id:'own1',title:'Развод для черной вдовы',genres:['Криминальный любовный роман'],tags:['похищение','одержимый герой'] };
const app = {
  ctx:()=>({data:{w_books:[book],d_keywords:[],d_kw_bindings:[],d_competitors:[]},settings:{}}),
  ui:{kwBook:'own1',kwFilter:'all'},snap:()=>({campaigns:[],keywords:[],queries:[]})
};

test('Редактор в Директе разделяет жанры и теги и сохраняет их в общую книгу',()=>{
 const h=taxonomyPanel(book);
 assert.match(h,/data-form="dbook.genres"/);
 assert.match(h,/data-form="dbook.tags"/);
 assert.match(h,/name="genre1"/);
 assert.match(h,/name="genre2"/);
 assert.match(h,/name="tags"/);
 assert.match(h,/value="похищение, одержимый герой"/);
 assert.match(h,/Общие с «Мастерской»/);
 assert.doesNotMatch(h,/Легенда/);
});

test('Ключевые слова отображают отдельный редактор тегов и кнопку импорта',()=>{
 const h=keywordsView(app).html;
 assert.match(h,/Семантика книги/);
 assert.match(h,/data-form="dbook.tags"/);
 assert.match(h,/data-act="kw.seed"/);
 assert.match(h,/d-actions/);
});

test('Конкурентный поиск отображает отдельные теги и кнопку поиска',()=>{
 const h=competitorsView(app).html;
 assert.match(h,/data-form="dbook.tags"/);
 assert.match(h,/data-act="cmp.find"/);
 assert.match(h,/Бесплатный подбор/);
 assert.doesNotMatch(h,/«Легенда»/);
});

test('Ранжирование конкурентов выполняется без отсутствующей функции',()=>{
 const candidates=[
  {title:'Чудесная весна',description:'море и цветы',url:'https://litnet.com/ru/book/one'},
  {title:'Одержимый герой',description:'похищение и криминал',url:'https://litnet.com/ru/book/two'}
 ];
 const found=rankPublicBooks(candidates,book,[]);
 assert.equal(found.length,2);
 assert.equal(found[0].title,'Одержимый герой');
});

test('У кнопок семантики и конкурентов есть отдельные отступы',()=>{
 const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
 assert.match(css,/\.app-direct main \.d-actions/);
 assert.match(css,/gap:\s*10px 14px/);
});
