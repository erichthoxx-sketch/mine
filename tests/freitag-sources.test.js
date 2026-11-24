import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {sourcePlan,sourcePeriod} from "../ai/source-plan.js";
import {collectSources} from "../proxy/freitag-sources.js";
import {projectPacket,packetMarkdown} from "../ai/handoff.js";
import {projectAccess} from "../proxy/freitag-project-access.js";
import {mergeExpenses,expenseReport,usageEstimate} from "../ai/expenses.js";

const now=new Date("2026-11-24T22:00:00Z");
test("routing ignores financial words in fictional instructions and handles a follow-up with Moscow dates",()=>{
  assert.deepEqual(sourcePlan({task:"Напиши сцену. В диалоге звучат выручка и бюджет рекламы.",mode:"draft",bookId:"one"}).kinds,[]);
  assert.deepEqual(sourcePlan({task:"Спасибо!",bookId:"one"}).kinds,[]);
  assert.deepEqual(sourcePlan({task:"Сколько я потратила на рекламу за неделю?",mode:"draft"}).kinds,["direct"]);
  const follow=sourcePlan({task:"А за вчера?",previous:"Какие продажи за ноябрь?"});
  assert.deepEqual(follow.kinds,["income"]);
  assert.deepEqual(sourcePeriod(follow.question,now),{from:"2026-11-24",to:"2026-11-24"});
  assert.deepEqual(sourcePeriod("с 15 по 21 ноября 2026",now),{from:"2026-11-15",to:"2026-11-21"});
  assert.throws(()=>sourcePeriod("2026-02-30",now));
});
test("sales uses all matching rows before compacting, selecting project and period locally",async()=>{
  const env={BOOKS:{get:async key=>key==="book:one"?{title:"Тихий сад"}:{updatedAt:"2026-11-24",
    data:{lastSaleDate:"2026-11-24",sales:[
      ...Array.from({length:400},()=>({date:"2026-11-24",book:"Тихий сад",qty:2,royalty:1.05})),
      {date:"2026-11-23",book:"Тихий сад",qty:5,royalty:12},{date:"2026-11-24",book:"Другая книга",qty:14,royalty:400}]}}}};
  const result=await collectSources({env,now,input:{task:"Сколько продаж за вчера?",bookId:"one",mode:"draft"},read:()=>assert.fail()});
  const data=JSON.parse(result[0].text);
  assert.equal(data.matchedRows,400);assert.equal(data.royalty,420);assert.equal(data.quantity,800);
  assert.ok(!result[0].text.includes("Другая книга"));assert.ok(result[0].text.length<800);
});
test("campaign report selects the exact campaign and period without unrelated tools",async()=>{
  const calls=[];
  const sources=await collectSources({env:{},now,input:{task:"Расход Директа по кампании №452 за неделю"},
    read:async(name,args)=>{calls.push({name,args});return {fetchedAt:"2026-11-25",total:{cost:81},rows:Array(100).fill({cost:2})};}});
  assert.deepEqual(calls,[{name:"get_direct_report",args:{campaign_id:"452",from:"2026-11-19",to:"2026-11-25"}}]);
  assert.equal(JSON.parse(sources[0].text).total.cost,81);
  assert.match(sources[0].text,/remaining/);
});
test("a literary question can locate an earlier chapter without sending the full novel",async()=>{
  const chapters=[{title:"Отъезд",text:"Подсвечник стоял у окна. ".repeat(6)},{title:"Поздняя встреча",text:"Позже. ".repeat(2000)}];
  const result=await collectSources({env:{BOOKS:{get:async()=>({chapters,title:"Текст",context:"Канон",updatedAt:"2026-11-21"})}},
    input:{task:"Где находился подсвечник?",bookId:"one",mode:"canon"},words:()=>["подсвечник"]});
  assert.equal(JSON.parse(result[0].text).scenes[0].chapter,1);
  assert.ok(!result[0].text.includes("Позже"));
});
test("confirmed account receipts are deduplicated in either order without assigning unrelated charges",()=>{
  const r={provider:"apimira",id:"transaction:T",requestIds:["T","X"],at:now.toISOString(),charges:{USD:.609061},unlinked:true};
  const c={provider:"apimira",id:"chat:C:1",requestIds:["X"],projectId:"P",chatId:"C",at:now.toISOString(),charges:{}};
  const unrelated={...r,id:"transaction:Z",requestIds:["Z"]};
  for(const rows of [[r,c,r],[c,r,c],[r,r,c]]){
    const merged=mergeExpenses([],[...rows,unrelated]);
    const report=expenseReport(merged,{period:"all"},now);
    assert.equal(report.confirmed,1);assert.equal(report.rows[0].id,c.id);
    assert.equal(report.rows[0].chatId,"C");assert.equal(report.totals.USD,.609061);assert.equal(report.unmatched.length,1);
  }
  assert.deepEqual(usageEstimate({inputTokens:20,outputTokens:4,quote:{currency:"USD",inputRate:.02,outputRate:.05}}),
    {currency:"USD",amount:.6000000000000001});
});
function storage(){
  const db=new DatabaseSync(":memory:");
  return {sql:{exec(query,...args){const stmt=db.prepare(query);const data=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);
    return Object.assign(data,{toArray:()=>data});}},
    transactionSync(fn){db.exec("BEGIN");try{fn();db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}}};
}
test("read-only project grant binds one book, pages large text, detects conflicts and revokes immediately",async()=>{
  const store=storage(),bookKeys=[];
  const project={id:"a",name:"Книга",masterBookId:"one",instruction:"Голос автора"};
  const long="А".repeat(23998)+"💐Вопрос о прошлом."+"Б".repeat(7000);
  const packet=projectPacket({docs:[{id:"d",projectId:"a",name:"Главы",text:long},{id:"e",projectId:"a",includeInContext:false,name:"Личное",text:"скрыто"}],
    chats:[{id:"one",projectId:"b",title:"Чужой",messages:[{role:"user",content:"другой проект"}]}],settings:{workerUrl:"never-expose"}},project);
  assert.doesNotMatch(packetMarkdown(packet),/другой проект|never-expose|скрыто/);
  const env={BOOKS:{get:async key=>{bookKeys.push(key);return {updatedAt:"2026-11-21",context:"Легенда",chapters:[{title:"Начало",text:"Текст"}]};}}};
  const owner=(body)=>projectAccess(new Request("https://internal/owner",body?{method:"POST",body:JSON.stringify(body)}:{}),store,env);
  const mcp=(key,method,params={})=>projectAccess(new Request("https://internal/mcp",{method:"POST",headers:{Authorization:"Bearer "+key},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),store,env);
  const grant=await (await owner({action:"grant",packet})).json();
  assert.ok(grant.token);assert.equal((await (await owner()).json()).token,undefined);
  assert.equal((await mcp("bad","tools/list")).status,401);
  const call=async(name,args={})=>(await (await mcp(grant.token,"tools/call",{name,arguments:args})).json()).result;
  assert.match((await call("list_documents")).content[0].text,/material-d/);
  assert.ok((await call("search_project",{query:"💐Вопрос"})).content[0].text.includes("о прошлом"));
  const slice=JSON.parse((await call("read_document",{id:"material-d",offset:23997})).content[0].text);
  assert.equal(slice.text,long.slice(23997,29997));assert.equal(slice.nextOffset,29997);
  await call("read_chapter",{chapter:1,book_id:"other"});
  assert.deepEqual(bookKeys,["book:one"]);
  assert.equal((await owner({action:"update",version:"old",packet})).status,409);
  assert.equal((await owner({action:"update",version:grant.version,packet})).status,200);
  assert.equal((await owner({action:"revoke"})).status,200);assert.equal((await mcp(grant.token,"tools/list")).status,401);
  assert.equal(store.sql.exec("SELECT * FROM chunks").length,0);
});
