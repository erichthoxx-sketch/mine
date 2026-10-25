import test from 'node:test';
import assert from 'node:assert/strict';
import {newObservedKeywords, autoSyncKeywordLibrary} from '../direct/js/key-sync.js';
import {keywordId} from '../direct/js/keywordcalc.js';

const main={campaigns:[{id:17,name:'Черная вдова'},{id:18,name:'Альпийский'}],
  keywords:[{cid:17,phrase:'любовный роман'},{cid:17,phrase:'роман с тайной'},{cid:18,phrase:'приключенческий роман'}]};
const stats={queries:[{cid:17,query:'криминальный любовный роман',clicks:2},{cid:17,query:'вкусный пирог',clicks:0},{cid:18,query:'путешествие',clicks:12}]};
test('Автосинхронизация касается только выбранной собственной кампании и не дает доступ к чужой',()=>{
 const rows=newObservedKeywords([{bookId:'black',campaignId:17}],main,stats,[]);
 assert.deepEqual(rows.map(x=>x.phrase),['любовный роман','роман с тайной','криминальный любовный роман']);
 assert.ok(rows.every(x=>x.status==='review'&&x.count===null));
 assert.ok(rows.every(x=>x.bookId==='black'));
 assert.ok(!rows.some(x=>x.phrase==='путешествие'));
});
test('Повторное обновление не дублирует уже существующие ключи и не перезаписывает решения',()=>{
 const prior=[{id:keywordId('black','любовный роман'),bookId:'black',phrase:'любовный роман',status:'reject'}];
 const rows=newObservedKeywords([{bookId:'black',campaignId:17}],main,stats,prior);
 assert.equal(rows.length,2);
 assert.ok(!rows.some(x=>x.phrase==='любовный роман'));
 assert.equal(newObservedKeywords([{bookId:'black',campaignId:17,autoImport:false}],main,stats,[]).length,0);
});
test('Обновление библиотеки после загрузки снимков только читает кампании, пишет лишь в d_keywords',async()=>{
 const written=[];
 const a={ctx:()=>({data:{d_kw_bindings:[{bookId:'black',campaignId:'17'}],d_keywords:[]}}),
   snap:(key)=>key==='main'?main:key==='stats'?stats:null,
   store:{putMany:async(kind,rows)=>written.push({kind,rows})}};
 assert.equal(await autoSyncKeywordLibrary(a),3);
 assert.deepEqual(written.map(x=>x.kind),['d_keywords']);
 assert.equal(written[0].rows.length,3);
});
