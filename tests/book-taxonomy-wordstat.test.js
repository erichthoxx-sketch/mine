import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_GENRES,bookGenres,bookTags,uniqueWords,marketingTopics} from '../writer/js/bookmeta.js';
import {discoverySources,rankPublicBooks} from '../direct/js/competitor-discovery.js';
import {keywordsView} from '../direct/js/views/keywords.js';
import worker from '../proxy/direct-worker.js';

const book={
 id:'black',title:'Развод для черной вдовы',
 genres:['Остросюжетный любовный роман','Криминальный любовный роман'],
 tags:['одержимый герой','похищение','фиктивное вдовство'],
 legend:{idea:{genre:'дарк роман, криминал, запретное притяжение'}},
};
test('Категории названы как на Литнете, теги нормализованы и не дублируются',()=>{
 assert.ok(BOOK_GENRES.includes('Остросюжетный любовный роман'));
 assert.ok(BOOK_GENRES.includes('Криминальный любовный роман'));
 assert.deepEqual(bookGenres(book),book.genres);
 assert.deepEqual(bookTags(book),book.tags);
 assert.deepEqual(uniqueWords('Одержимый герой; одержимый герой, похищение'),['Одержимый герой','похищение']);
 assert.deepEqual(bookGenres({genres:['a','b','c']}),['a','b']);
});
test('Темы из книги и Легенды автоматически доступны подбору конкурентов',()=>{
 const topics=marketingTopics(book);
 assert.match(topics,/Криминальный любовный роман/);
 assert.match(topics,/похищение/);
 assert.match(topics,/дарк роман/);
 assert.equal(discoverySources(book,[],undefined)[0].name,'Дарк романс');
 const items=rankPublicBooks([{title:'Сюрприз',description:'Его одержимый герой похищает героиню'},
  {title:'Дождь',description:'Солнечные каникулы'}],book);
 assert.equal(items[0].title,'Сюрприз');
});
test('В карточке книги можно редактировать жанры и теги и видеть их в шапке',()=>{
 const s=readFileSync(new URL('../writer/js/views/books.js',import.meta.url),'utf8');
 assert.match(s,/name="genres"/);
 assert.match(s,/name="tags"/);
 assert.match(s,/bm-taxonomy/);
 assert.match(s,/uniqueWords\(fd\.get\('tags'\)/);
});
test('Ключи предлагают импорт жанров и отдельный подтверждаемый Wordstat',()=>{
 const a={ui:{kwBook:'black',kwFilter:'all'},ctx:()=>({data:{w_books:[book],d_keywords:[],d_kw_bindings:[]}}),snap:()=>({})};
 const html=keywordsView(a).html;
 assert.match(html,/Остросюжетный любовный роман/);
 assert.match(html,/одержимый герой/);
 assert.match(html,/data-act="kw.seed"/);
 assert.match(html,/data-act="kw.wordstat"/);
 assert.match(html,/Без ключа на Cloudflare/);
});
test('Worker без настройки Wordstat не вызывает платный Yandex API',async()=>{
 const req=new Request('https://direct.example.workers.dev/wordstat/top',{method:'POST',headers:{
  Origin:'https://erichthoxx-sketch.github.io','Content-Type':'application/json'},body:JSON.stringify({phrase:'любовный роман'})});
 const response=await worker.fetch(req,{});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/выключен/);
 const forbidden=await worker.fetch(new Request('https://direct.example.workers.dev/wordstat/top',{method:'POST',headers:{Origin:'https://evil.example'}}),{WORDSTAT_ENABLED:'true'});
 assert.equal(forbidden.status,403);
 const missing=await worker.fetch(req,{WORDSTAT_ENABLED:'true'});
 assert.equal(missing.status,503);
});
