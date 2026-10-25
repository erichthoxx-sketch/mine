import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvRows, normKey, keywordId, plainPhrases, preparedKeywords, interestHint, exportList } from '../direct/js/keywordcalc.js';
import { keywordsView } from '../direct/js/views/keywords.js';

test('A Wordstat export can be safely read: quoted CSV, Cyrillic, duplicates and no invented counts',()=>{
  const csv='\ufeff"Запрос";"Количество запросов"\r\n"дарк роман";"1 250"\r\n"купить роман";"75"\r\n"ДАРК РОМАН";"1250"\r\n"любовный роман";""\r\n';
  const rows=csvRows(csv);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(x=>x.count),[1250,75,null]);
  assert.equal(rows[0].phrase,'дарк роман');
  assert.equal(csvRows('phrase\tcount\nNew adult romance\t10\n'),[{phrase:'New adult romance',count:10}]);
});
test('Phrases are normalized, namespaced per book, and user decisions survive reimports',()=>{
  assert.equal(normKey('  ЧЁРНАЯ  вдова '),'черная вдова');
  assert.equal(keywordId('b1','чёрная вдова'),keywordId('b1','ЧЕРНАЯ ВДОВА'));
  assert.notEqual(keywordId('b1','черная вдова'),keywordId('b2','черная вдова'));
  const old=[{id:keywordId('b1','черная вдова'),bookId:'b1',phrase:'черная вдова',status:'keep',count:12}];
  const rows=preparedKeywords([{phrase:'Чёрная вдова',count:99}], 'b1','wordstat-import',old,'2026-10-25');
  assert.equal(rows[0].status,'keep');
  assert.equal(rows[0].count,99);
  assert.equal(rows[0].source,'wordstat-import');
  assert.equal(rows[0].measuredAt,'2026-10-25');
  assert.equal(preparedKeywords([{phrase:'новый роман',count:null}],'b2','manual')[0].count,null);
  assert.equal(plainPhrases('книга\nКНИГА\nanother book\n').length,2);
});
test('Bad matches are hints for human review only; export is normal CSV',()=>{
  assert.equal(interestHint('скачать книгу fb2').kind,'check');
  assert.equal(interestHint('купить любовный роман').kind,'potential');
  const csv=exportList([{phrase:'новый роман',count:10,status:'keep',source:'wordstat-import'}]);
  assert.match(csv,/Частотность из файла/);
  assert.match(csv,/новый роман/);
  assert.match(csv,/10/);
});
test('Book-specific keyword screen is visible without Wordstat credentials, no fake metrics or campaign changes',()=>{
  const a={ctx:()=>({data:{
    w_books:[{id:'b1',title:'Развод для черной вдовы'}],
    d_keywords:[{id:'x',bookId:'b1',phrase:'остросюжетный любовный роман',count:null,status:'review'}],
  },settings:{}}),ui:{kwBook:'b1',kwFilter:'all'}};
  const html=keywordsView(a).html;
  assert.match(html,/Подбор ключевых слов/);
  assert.match(html,/Импорт CSV \/ TSV/);
  assert.match(html,/wordstat\.yandex\.ru/);
  assert.match(html,/Частотность неизвестна/);
  assert.match(html,/Проверить наличие спроса/);
  assert.match(html,/не добавляются в рекламу автоматически/);
});
