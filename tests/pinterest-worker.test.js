import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{pinPayload,analyticsQuery} from '../proxy/pinterest-worker.js';
const p={approved:true,requestId:'test-123456789012',boardId:'12345',title:'Книга',description:'Описание',alt:'Изображение',link:'https://lanafreitag.ru/kniga/test/',contentType:'image/png',image:'iVBORw0KGgoAAAAB'};
test('only explicit confirmed pins with book page and proper image',()=>{
 assert.equal(pinPayload(p).board_id,'12345');
 for(const patch of [{approved:false},{link:'https://example.com/a'},{link:'https://lanafreitag.ru/'},{contentType:'image/jpeg'},{boardId:'../bad'}])assert.throws(()=>pinPayload({...p,...patch}));
});
test('analytics bounded dates',()=>{
 assert.match(analyticsQuery('2026-11-01','2026-11-20',Date.parse('2026-11-26')),/OUTBOUND_CLICK/);
 assert.throws(()=>analyticsQuery('2026-02-30','2026-11-20'));
 assert.throws(()=>analyticsQuery('2025-01-01','2026-11-20'));
});
test('untrusted origins and missing config fail closed',async()=>{
 assert.equal((await worker.fetch(new Request('https://worker.example/status',{headers:{Origin:'https://evil.example'}}),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://worker.example/status',{headers:{Origin:'https://erichthoxx-sketch.github.io'}}),{})).status,503);
});
