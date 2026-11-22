import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import gateway from "../proxy/freitag-modelproxy-worker.js";

const ORIGIN = "https://freitag-ai-test.pages.dev";
const url = path => "https://freitag-opus-gateway.example/" + path;

test("ModelProxy health is free and reflects new secret rather than Polza", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error("health must not call an upstream"); };
  try {
    const res = await gateway.fetch(new Request(url("health"), {headers: {Origin: ORIGIN}}),
      { OWNER_UID: "owner", BOOKS: {get: async () => null} });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(
      { provider: json.provider, model: json.model, configured: json.configured, booksConnected: json.booksConnected },
      { provider: "ModelProxy", model: "claude-opus-5-5", configured: false, booksConnected: true }
    );
  } finally { globalThis.fetch = original; }
});

test("unverified users cannot use paid API or access manuscript metadata", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error("No external request may be issued without Firebase authorization"); };
  try {
    const env = {OWNER_UID:"owner",MODELPROXY_API_KEY:"mp-test",BOOKS:{get:async()=>{throw Error("must not read a book");}}};
    const chat = await gateway.fetch(new Request(url("chat"),{method:"POST",headers:{Origin:ORIGIN},
      body: JSON.stringify({messages:[{role:"user",content:"test"}]})}),env);
    assert.equal(chat.status,401);
    const snapshot = await gateway.fetch(new Request(url("snapshot?bookId=test"),{headers:{Origin:ORIGIN}}),env);
    assert.equal(snapshot.status,401);
    const preflight = await gateway.fetch(new Request(url("preflight?model=claude-sonnet-5.5"),{headers:{Origin:ORIGIN}}),env);
    assert.equal(preflight.status,401);
    const mcp=await gateway.fetch(new Request(url("mcp-tools"),{headers:{Origin:ORIGIN}}),env);
    assert.equal(mcp.status,401);
    const refresh = await gateway.fetch(new Request(url("refresh-book"),{
      method:"POST",headers:{Origin:ORIGIN,"Content-Type":"application/json"},
      body:JSON.stringify({id:"test",context:"secret",chapters:[{title:"chapter",text:"secret"}]})
    }),env);
    assert.equal(refresh.status,401);
  } finally { globalThis.fetch = original; }
});

test("valid owner gets accurate snapshot and sends a streamed ModelProxy request", async () => {
  const crypto = webcrypto;
  const pair = await crypto.subtle.generateKey({
    name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
  },true,["sign","verify"]);
  const jwk = {...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"fixture-key"};
  const enc = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const now = Math.floor(Date.now()/1000);
  const base = enc({alg:"RS256",kid:"fixture-key"})+"."+
    enc({aud:"dohody-6d6dd",iss:"https://securetoken.google.com/dohody-6d6dd",
      sub:"owner",user_id:"owner",iat:now-30,exp:now+300});
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(base));
  const token = base+"."+Buffer.from(sig).toString("base64url");
  const nowIso = new Date().toISOString();
  const book = {title:"Тестовый роман",context:"Канон — только проверенные факты.",updatedAt:nowIso,
    chapters:[{title:"Пролог",text:"начало"},
      {title:"Глава 14",text:"события 14"},
      {title:"Глава 15",text:"события 15"}]};
  const written=[];
  const env = {OWNER_UID:"owner",MODELPROXY_API_KEY:"mp-test",BOTHUB_API_KEY:"bh-test",APIMIRA_API_KEY:"am-test",
    BOOKS_MCP_URL:"https://masterskaya-ai.erichtho-xx.workers.dev/mcp",MCP_READ_KEY:"read-key-".repeat(8),BOOKS:{
    get:async()=>book,
    put:async(key,raw,opts)=>{
      assert.equal(key,"book:test");
      const data=JSON.parse(raw);
      Object.assign(book,data);
      written.push({data,metadata:opts.metadata});
    }
  }};
  const headers = {Origin:ORIGIN,Authorization:"Bearer "+token};
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({input,init});
    if (String(input).includes("googleapis.com"))
      return Response.json({keys:[jwk]});
    if (String(input) === "https://openai.bothub.chat/v1/models")
      return Response.json({object:"list",data:[{id:"claude-sonnet-5.5",kind:"chat",endpoints:["/v1/chat/completions"]},{id:"claude-opus-5.5",kind:"chat"}]});
    if (String(input) === "https://apimira.com/v1/models")
      return Response.json({object:"list",data:[{id:"anthropic/claude-opus-5.5",object:"model"}]});
    if(String(input)==="https://masterskaya-ai.erichtho-xx.workers.dev/mcp"){
      assert.equal(init.headers.Authorization,"Bearer "+"read-key-".repeat(8));
      const rpc=JSON.parse(init.body);
      const payload=(result)=>Response.json({jsonrpc:"2.0",id:rpc.id,result});
      if(rpc.method==="initialize")return payload({protocolVersion:"2025-03-26",
        capabilities:{tools:{}},serverInfo:{name:"masterskaya-ai",version:"1.6.0"}});
      if(rpc.method==="tools/list")return payload({tools:[
        {name:"list_books",description:"Список книг",inputSchema:{type:"object",properties:{}}},
        {name:"read_chapter",description:"Прочитать главу",inputSchema:{
          type:"object",properties:{book_id:{type:"string"},chapter:{type:"integer"}}}},
        {name:"get_income_overview",description:"Доходы",inputSchema:{type:"object",properties:{}}},
        {name:"get_direct_live",description:"Директ",inputSchema:{type:"object",properties:{}}},
        {name:"delete_book",description:"НЕДОПУСТИМО",inputSchema:{type:"object",properties:{}}}
      ]});
      if(rpc.method==="tools/call"){
        if(rpc.params?.name==="read_chapter"){
          assert.equal(rpc.params.arguments.book_id,"test");
          return payload({content:[{type:"text",text:JSON.stringify({chapter:2,text:"новая глава"})}]});
        }
        if(rpc.params?.name==="get_income_overview")
          return payload({content:[{type:"text",text:"Доход 1200 рублей"}]});
        return payload({content:[{type:"text",text:"ok"}]});
      }
      throw Error("Unexpected MCP RPC "+rpc.method);
    }
    if (["https://api.modelproxy.org/v1/chat/completions",
      "https://openai.bothub.chat/v1/chat/completions",
      "https://apimira.com/v1/chat/completions"].includes(String(input))){
      const body=JSON.parse(init.body);
      if(body.stream===false){
        const called=body.messages.some(m=>m.role==="tool");
        const wantsChapter=body.messages.some(m=>m.role==="user"&&m.content.includes("Проверить Марту"));
        const wantsIncome=body.messages.some(m=>m.role==="user"&&m.content.includes("Проверить доходы"));
        const wantsDelete=body.messages.some(m=>m.role==="user"&&m.content.includes("Удалить книгу"));
        if(wantsDelete)return Response.json({choices:[{message:{role:"assistant",content:null,
          tool_calls:[{id:"evil-1",type:"function",function:{name:"delete_book",arguments:"{}"}}]}}]});
        if(wantsChapter&&!called)return Response.json({choices:[{message:{role:"assistant",content:null,
          tool_calls:[{id:"call-1",type:"function",function:{name:"read_chapter",arguments:'{"chapter":2}'}}]}}]});
        if(wantsIncome&&!called)return Response.json({choices:[{message:{role:"assistant",content:null,
          tool_calls:[{id:"income-1",type:"function",function:{name:"get_income_overview",arguments:"{}"}}]}}]});
        const lastTool=body.messages.filter(m=>m.role==="tool").at(-1)?.content||"";
        return Response.json({choices:[{message:{role:"assistant",
          content:lastTool.includes("Доход 1200")?"Проверено: доход 1200 рублей.":called?"События главы подтверждены.":"OK"}}]});
      }
      return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\\n\\n', {
        headers:{"Content-Type":"text/event-stream"}});
    }
    throw Error("Unexpected fetch "+input);
  };
  try {
    const snap = await gateway.fetch(new Request(url("snapshot?bookId=test"),{headers}),env);
    assert.equal(snap.status,200);
    const data = await snap.json();
    assert.equal(data.chapterCount,3);
    assert.deepEqual(data.lastChapters.map(x=>x.title),["Пролог","Глава 14","Глава 15"]);
    const res = await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({bookId:"test",sourceRevision:nowIso,mode:"canon",messages:[{role:"user",content:"Последние события?"}]})
    }),env);
    assert.equal(res.status,200);
    assert.match(await res.text(),/OK/);
    const modelCall=calls.find(c=>String(c.input).includes("modelproxy.org"));
    assert.ok(modelCall);
    assert.equal(modelCall.init.headers.Authorization,"Bearer mp-test");
    const payload=JSON.parse(modelCall.init.body);
    assert.equal(payload.model,"claude-opus-5-5");
    assert.equal(payload.max_tokens,750);
    assert.equal(payload.stream,false);
    assert.match(payload.messages[1].content,/Тестовый роман/);
    assert.ok(payload.tools.some(t=>t.function.name==="get_income_overview"));
    assert.ok(!payload.tools.some(t=>t.function.name==="delete_book"));
    // Paid call with a stale revision is stopped BEFORE the provider is called.
    const beforeStale=calls.length;
    const stale=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({bookId:"test",sourceRevision:"2000-01-01T00:00:00.000Z",
        provider:"bothub",messages:[{role:"user",content:"Пиши"}]})
    }),env);
    assert.equal(stale.status,424);
    assert.equal(calls.length,beforeStale);
    const freshDoc={id:"test",title:"Тестовый роман",
      context:"Новый подтвержденный канон",
      chapters:[{title:"Пролог",text:"обновленный пролог"},{title:"Глава 16",text:"новая глава"}],
      generatedAt:new Date().toISOString()};
    const fresh=await gateway.fetch(new Request(url("refresh-book"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify(freshDoc)
    }),env);
    assert.equal(fresh.status,200);
    const refreshed=await fresh.json();
    assert.equal(refreshed.chapterCount,2);
    assert.equal(written.length,1);
    assert.match(written[0].data.context,/Новый подтвержденный канон/);
    assert.equal(written[0].metadata.chapters,2);
    const beforeFresh=calls.length;
    const withRevision=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({bookId:"test",sourceRevision:refreshed.updatedAt,
        provider:"bothub",messages:[{role:"user",content:"Продолжай"}]})
    }),env);
    assert.equal(withRevision.status,200);
    assert.equal(calls.filter(c=>String(c.input).includes("bothub.chat/v1/chat/completions")).length,1);
    const lastBookCall=JSON.parse(calls.at(-1).init.body);
    assert.match(lastBookCall.messages[1].content,/Тестовый роман/);
    assert.equal(lastBookCall.stream,false);
    assert.equal(lastBookCall.tools.length,4);
    const beforeToolCalls=calls.length;
    const toolResponse=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({bookId:"test",sourceRevision:refreshed.updatedAt,mode:"canon",
        provider:"bothub",model:"claude-opus-5.5",messages:[{role:"user",content:"Проверить Марту в главе 2"}]})
    }),env);
    assert.equal(toolResponse.status,200);
    assert.match(await toolResponse.text(),/События главы подтверждены/);
    assert.equal(calls.filter(c=>String(c.input).includes("bothub.chat/v1/chat/completions")).length,3);
    const followup=JSON.parse(calls.at(-1).init.body);
    assert.equal(followup.messages.at(-1).role,"tool");
    assert.match(followup.messages.at(-1).content,/новая глава/);
    assert.equal(followup.messages.at(-1).tool_call_id,"call-1");
    const beforeBotHubCalls=calls.length;
    const botRes=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",messages:[{role:"user",content:"Только тест"}],mode:"dialog"})
    }),env);
    assert.equal(botRes.status,200);
    assert.match(await botRes.text(),/OK/);
    assert.equal(calls.filter(c=>String(c.input).includes("bothub.chat/v1/chat/completions")).length,4);
    const botCall=calls.at(-1);
    assert.equal(String(botCall.input),"https://openai.bothub.chat/v1/chat/completions");
    assert.equal(botCall.init.headers.Authorization,"Bearer bh-test");
    const bothubPayload=JSON.parse(botCall.init.body);
    assert.equal(bothubPayload.model,"claude-sonnet-5.5");
    assert.equal(bothubPayload.stream,false);
    const opus=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",model:"claude-opus-5.5",messages:[{role:"user",content:"Тест Opus"}]})
    }),env);
    assert.equal(opus.status,200);
    assert.equal(JSON.parse(calls.at(-1).init.body).model,"claude-opus-5.5");
    const beforeInvalid=calls.length;
    const invalidModel=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",model:"https://attacker.example",messages:[{role:"user",content:"Never forward"}]})
    }),env);
    assert.equal(invalidModel.status,400);
    assert.equal(calls.length,beforeInvalid);
    const preflight=await gateway.fetch(new Request(url("preflight?model=claude-sonnet-5.5"),{headers}),env);
    assert.equal(preflight.status,200);
    assert.equal((await preflight.json()).ok,true);
    assert.equal(calls.at(-1).init.headers.Authorization,"Bearer bh-test");
    const apiRes=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"apimira",messages:[{role:"user",content:"Только тест"}]})
    }),env);
    assert.equal(apiRes.status,200);
    assert.equal(String(calls.at(-1).input),"https://apimira.com/v1/chat/completions");
    assert.equal(calls.at(-1).init.headers.Authorization,"Bearer am-test");
    assert.equal(JSON.parse(calls.at(-1).init.body).model,"anthropic/claude-opus-5.5");
    const apiPreflight=await gateway.fetch(new Request(url("preflight?provider=apimira&model=anthropic%2Fclaude-opus-5.5"),{headers}),env);
    assert.equal(apiPreflight.status,200);
    assert.equal((await apiPreflight.json()).ok,true);
    const income=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",model:"claude-opus-5.5",
        messages:[{role:"user",content:"Проверить доходы"}]})
    }),env);
    assert.equal(income.status,200);
    assert.match(await income.text(),/Проверено: доход 1200 рублей/);
    const beforeWrite=calls.filter(c=>String(c.input)==="https://masterskaya-ai.erichtho-xx.workers.dev/mcp" &&
      JSON.parse(c.init.body).method==="tools/call").length;
    const rejected=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",model:"claude-opus-5.5",
        messages:[{role:"user",content:"Удалить книгу"}]})
    }),env);
    assert.equal(rejected.status,424);
    assert.equal(calls.filter(c=>String(c.input)==="https://masterskaya-ai.erichtho-xx.workers.dev/mcp" &&
      JSON.parse(c.init.body).method==="tools/call").length,beforeWrite);
    const mcpList=await gateway.fetch(new Request(url("mcp-tools"),{headers}),env);
    assert.equal(mcpList.status,200);
    const mcpData=await mcpList.json();
    assert.equal(mcpData.toolCount,4);
    assert.ok(mcpData.tools.includes("get_income_overview"));
    assert.ok(mcpData.tools.includes("get_direct_live"));
    assert.ok(!mcpData.tools.includes("delete_book"));
    const beforeProviderInvalid=calls.length;
    const invalid=await gateway.fetch(new Request(url("chat"),{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"https://attacker.example",messages:[{role:"user",content:"Never forward"}]})
    }),env);
    assert.equal(invalid.status,400);
    assert.equal(calls.length,beforeProviderInvalid);
  } finally {globalThis.fetch=original;}
});

test("health reports both API configurations separately, without paid requests",async()=>{
  const env={OWNER_UID:"owner",BOTHUB_API_KEY:"bh-test"};
  const res=await gateway.fetch(new Request(url("health"),{headers:{Origin:ORIGIN}}),env);
  const data=await res.json();
  assert.equal(data.configured,false);
  assert.equal(data.bothubConfigured,true);
  assert.deepEqual(data.availableProviders,{modelproxy:false,bothub:true,apimira:false});
});

test("browser and Pages bridge must reject an old Polza gateway", async () => {
  const app = await readFile(new URL("../ai/app.js",import.meta.url),"utf8");
  const pages = await readFile(new URL("../functions/api/freitag/[route].js",import.meta.url),"utf8");
  assert.ok(app.includes('health.provider!=="ModelProxy"'));
  assert.ok(app.includes("modelproxyMessages"));
  assert.ok(app.includes('refreshLinkedBook({'));
  assert.ok(app.includes('sourceRevision'));
  assert.ok(app.includes('health.autoSyncSupported'));
  assert.match(pages,/route === "snapshot"/);
  assert.match(pages,/route === "preflight"/);
  assert.match(pages,/route === "refresh-book"/);
  assert.match(pages,/route === "mcp-tools"/);
  assert.ok(app.includes("f-bothub-model"));
  assert.ok(app.includes("activeBotHubModel"));
});
