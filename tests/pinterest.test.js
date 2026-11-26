import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogOf, boardOf, suggestions, trackedLink, issues, nextIdeas } from '../writer/js/pinterest.js';
const book={id:'1',title:'Роман',status:'progress',genres:['Остросюжетный любовный роман'],tags:['тайна'],promo:{quotes:'Подлинная строка'},manuscript:'НЕ ЭКСПОРТИРОВАТЬ'};
test('catalog excludes ideas and private fields',()=>{
 const list=catalogOf([book,{...book,id:'2',status:'idea'}]);
 assert.equal(list.length,1);assert.equal(list[0].quote,'Подлинная строка');assert.equal(list[0].manuscript,undefined);
});
test('genre suggestions and real quote, not invented',()=>{
 const b=catalogOf([book])[0];assert.equal(boardOf(b),'Романтический саспенс');
 assert.equal(suggestions(b).length,4);assert.match(suggestions(b)[3].prompt,/Подлинная строка/);
 assert.equal(suggestions({...b,quote:''}).length,3);assert.equal(suggestions(b)[0].alt,'');
});
test('UTM preserves existing URL query, rejects unsafe scheme',()=>{
 const u=new URL(trackedLink('https://lanafreitag.ru/?kniga=book','pin-1'));
 assert.equal(u.searchParams.get('kniga'),'book');assert.equal(u.searchParams.get('utm_content'),'pin-1');
 assert.equal(trackedLink('javascript:alert(1)','x'),'');assert.equal(trackedLink('https://a:b@example.com','x'),'');
});
test('ready requires actual visual, review and target link',()=>{
 const p=suggestions(catalogOf([book])[0])[0];assert.ok(issues(p).length);
 assert.deepEqual(issues({...p,alt:'Изображение',imageNote:'pin.png',reviewed:true,link:'https://lanafreitag.ru/?kniga=book'}),[]);
});
test('do not repeat prepared book-format pair',()=>{
 const b=catalogOf([book]);const first=nextIdeas(b,[])[0];
 assert.ok(!nextIdeas(b,[first]).some(p=>p.kind===first.kind));
});
