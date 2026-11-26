import test from 'node:test';
import assert from 'node:assert/strict';
import { localRequest, localIdeas } from '../writer/js/pinterest-local-ai.js';
const b={id:'b',title:'Книга',genres:[],tags:[]};
const row={bookId:'b',kind:'формат',reason:'гипотеза',title:'название',description:'описание',board:'доска',keywords:'роман',prompt:'визуал'};
test('only local models and grounded book IDs',()=>{assert.throws(()=>localRequest([b],[],'Автор','','model-cloud'));assert.deepEqual(localRequest([b],[],'Автор','','qwen3:4b').format.properties.ideas.items.properties.bookId.enum,['b']);});
test('local AI sends no credentials or remote requests',async()=>{const result=await localIdeas({books:[b],pins:[],author:'Автор',model:'qwen3:4b',fetcher:async(url,opts)=>{assert.equal(url,'http://localhost:11434/api/chat');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');return {ok:true,json:async()=>({message:{content:JSON.stringify({ideas:[row]})}})};}});assert.equal(result[0].status,'draft');});
test('local AI rejects hallucinated book ID',async()=>{await assert.rejects(localIdeas({books:[b],pins:[],author:'Автор',model:'qwen3:4b',fetcher:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({ideas:[{...row,bookId:'wrong'}]})}})})}));});
