import test from "node:test";
import assert from "node:assert/strict";
import {findStoryPassages, storyMap} from "../proxy/freitag-story-map.js";
import {chapterJobsClass} from "../proxy/freitag-chapter-jobs.js";
import {projectMemoryContext} from "../ai/project-context.js";

test("story lookup finds later scenes in early chapters and keeps their provenance", () => {
  const chapters = [
    {title:"Пролог",text:"Марта ушла. ".repeat(250)+"\n***\nСиняя папка у Марты. Глеб не знает, кто её забрал."},
    {title:"Глава 2",text:"Глеб проверил ворота."},
    {title:"Глава 3",text:"Марта взяла сумку."}
  ];
  const wholeBook=storyMap({chapters},{query:"синяя папка"});
  assert.equal(wholeBook.chapters.length,3);
  assert.deepEqual(wholeBook.matches.map(x=>[x.chapter,x.scene]),[[1,2]]);
  assert.match(wholeBook.matches[0].snippet,/Глеб не знает/);
  const auto=findStoryPassages(chapters,{terms:["папка","март"],skip:new Set([2,3])});
  assert.deepEqual(auto.map(x=>[x.chapter,x.scene]),[[1,2]]);
  const used=[];
  const memory=projectMemoryContext({project:{id:"book",memoryNotes:[{title:"Папка",text:"Глеб ещё не знает о папке.",anchor:{chapter:1,scene:2}}]},
    docs:[{projectId:"book",name:"Список",text:"Папка была синей."},{projectId:"book",name:"Спрятан",text:"Папка была тёмной.",includeInContext:false}],
    task:"Что с папкой?",terms:["папк"],budget:4000,onUse:x=>used.push(x.material||x.decision)});
  assert.match(memory,/Источник решения: глава 1, сцена 2/);
  assert.deepEqual(used,["Папка","Список"]);
});

function memoryStorage(){
  const data=new Map();
  return {data,alarm:null,async get(key){return structuredClone(data.get(key));},
    async put(key,value){for(const [name,item] of typeof key==="string"?[[key,value]]:Object.entries(key))data.set(name,structuredClone(item));},
    async list({prefix}){return new Map([...data].filter(([key])=>key.startsWith(prefix)));},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])data.delete(key);},
    async setAlarm(time){this.alarm=time;},async deleteAlarm(){this.alarm=null;}};
}
const request=(id,job,prepared)=>new Request("https://job.test/"+(id?"?id="+id:""),job?{
  method:"POST",body:JSON.stringify({job,prepared})
}:{});

test("a queued chapter survives a new instance, stores the answer and refuses duplicate generation", async () => {
  const store=memoryStorage();
  let paid=0;
  const Jobs=chapterJobsClass(async prepared=>{
    assert.equal(prepared.body,"private input");paid++;
    return new Response('data: {"choices":[{"delta":{"content":"Начало. "}}]}\n\n'+
      'data: {"choices":[{"delta":{"content":"Конец."},"finish_reason":"stop"}]}\n\n'+
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":5,"cost_rub":0.10}}\n\ndata: [DONE]\n\n',
      {headers:{"X-Freitag-Request-Id":"receipt"}});
  });
  const state={storage:store,blockConcurrencyWhile:callback=>callback()};
  const job={id:"test1",fingerprint:"fixed",prompt:"Напиши главу",provider:"aitunnel",chatId:"test-chat",projectName:"Тестовая книга"};
  const prepared={body:"private input"};
  assert.equal((await new Jobs(state,{}).fetch(request(null,job,prepared))).status,202);
  assert.equal(paid,0);
  assert.equal((await new Jobs(state,{}).fetch(request(null,{...job,fingerprint:"changed"},prepared))).status,409);
  await new Jobs(state,{}).alarm();
  const opened=await (await new Jobs(state,{}).fetch(request(job.id))).json();
  assert.equal(opened.job.text,"Начало. Конец.");
  assert.equal(opened.job.prompt,job.prompt);
  assert.equal(opened.job.status,"completed");
  assert.equal(opened.job.requestId,"receipt");
  assert.equal(opened.job.usage.cost_rub,.10);
  assert.equal(store.data.has("request:test1"),false);
  assert.ok(store.alarm>Date.now());
  assert.equal((await new Jobs(state,{}).fetch(request(null,job,prepared))).status,202);
  await new Jobs(state,{}).alarm();
  assert.equal(paid,1);
});

test("an interrupted job keeps the paid fragment without rerunning", async () => {
  const store=memoryStorage();
  const state={storage:store,blockConcurrencyWhile:callback=>callback()};
  let attempts=0;
  const Jobs=chapterJobsClass(async()=>{
    attempts++;
    return new Response('data: {"choices":[{"delta":{"content":"Сохранившийся фрагмент."}}]}\n\n');
  });
  const job={id:"partial",fingerprint:"fixed",prompt:"Напиши главу"};
  await new Jobs(state,{}).fetch(request(null,job,{body:"request"}));
  await new Jobs(state,{}).alarm();
  await new Jobs(state,{}).alarm();
  const {job:result}=await (await new Jobs(state,{}).fetch(request(job.id))).json();
  assert.equal(result.text,"Сохранившийся фрагмент.");
  assert.equal(result.status,"incomplete");
  assert.equal(attempts,1);
});
