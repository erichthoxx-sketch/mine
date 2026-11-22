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
  const env = {OWNER_UID:"owner",MODELPROXY_API_KEY:"mp-test",BOTHUB_API_KEY:"bh-test",APIMIRA_API_KEY:"am-test",BOOKS:{
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
    if (["https://api.modelproxy.org/v1/chat/completions",
      "https://openai.bothub.chat/v1/chat/completions",
      "https://apimira.com/v1/chat/completions"].includes(String(input))){
      const body=JSON.parse(init.body);
      if(body.stream===false){
        const called=body.messages.some(m=>m.role==="tool");
        const wantsChapter=body.messages.some(m=>m.role==="user"&&m.content.includes("Проверить Марту"));
        if(wantsChapter&&!called)return Response.json({choices:[{message:{role:"assistant",content:null,
          tool_calls:[{id:"call-1",type:"function",function:{name:"read_chapter",arguments:'{"chapter":2}'}}]}}]});
        return Response.json({choices:[{message:{role:"assistant",content:called?"События главы подтверждены.":"OK"}}]});
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
      body:JSON.stringify({bookId:"test",mode:"canon",messages:[{role:"user",content:"Последние события?"}]})
    }),env);
    assert.equal(res.status,200);
    assert.match(await res.text(),/OK/);
    const modelCall=calls.find(c=>String(c.input).includes("modelproxy.org"));
    assert.ok(modelCall);
    assert.equal(modelCall.init.headers.Authorization,"Bearer mp-test");
    const payload=JSON.parse(modelCall.init.body);
    assert.equal(payload.model,"claude-opus-5-5");
    assert.equal(payload.max_tokens,750);
    assert.equal(payload.stream,true);
    assert.match(payload.messages[0].content,/Глава 15/);
    assert.match(payload.messages[0].content,/события 15/);
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
    assert.equal(calls.length,beforeFresh+1);
    const lastBookCall=JSON.parse(calls.at(-1).init.body);
    assert.match(lastBookCall.messages[1].content,/новая глава/);
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
    assert.equal(calls.length,beforeToolCalls+2);
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
    assert.equal(calls.length,beforeBotHubCalls+1);
    const botCall=calls.at(-1);
    assert.equal(String(botCall.input),"https://openai.bothub.chat/v1/chat/completions");
    assert.equal(botCall.init.headers.Authorization,"Bearer bh-test");
    const bothubPayload=JSON.parse(botCall.init.body);
    assert.equal(bothubPayload.model,"claude-sonnet-5.5");
    assert.equal(bothubPayload.stream,true);
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
  assert.ok(app.includes("f-bothub-model"));
  assert.ok(app.includes("activeBotHubModel"));
});
