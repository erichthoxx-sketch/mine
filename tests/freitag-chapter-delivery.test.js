import {before, test} from "node:test";
import assert from "node:assert/strict";
import gateway from "../proxy/freitag-modelproxy-worker.js";
import {onRequest} from "../functions/api/freitag/[route].js";

const env = {OWNER_UID:"fixture", BOTHUB_API_KEY:"fixture-b", APIMIRA_API_KEY:"fixture-a",
  BOOKS_MCP_URL:"https://masterskaya-ai.erichtho-xx.workers.dev/mcp", MCP_READ_KEY:"x".repeat(32)};
let token, jwk;
before(async () => {
  const algorithm = {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256",modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1])};
  const keys = await crypto.subtle.generateKey(algorithm,true,["sign","verify"]);
  jwk = {...await crypto.subtle.exportKey("jwk",keys.publicKey),kid:"test"};
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now()/1000);
  const header = encode({kid:"test",alg:"RS256"});
  const payload = encode({aud:"dohody-6d6dd",iss:"https://securetoken.google.com/dohody-6d6dd",
    sub:"fixture",user_id:"fixture",iat:now,exp:now+300});
  const data = header+"."+payload;
  const sig = await crypto.subtle.sign(algorithm,keys.privateKey,Buffer.from(data));
  token = data+"."+Buffer.from(sig).toString("base64url");
});

function mockNetwork(t, respond) {
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url,init) => {
    if(String(url).startsWith("https://www.googleapis.com/"))return Response.json({keys:[jwk]});
    calls.push(new URL(url).pathname);
    return respond(new URL(url).pathname,init);
  });
  return calls;
}
const chapter = {provider:"bothub",model:"claude-opus-5.5",mode:"draft",
  outputTokenLimit:14000,messages:[{role:"user",content:"  Тестовое задание\n  "}]};
function request(route,body,signal) {
  const req=new Request("https://preview.example/api/freitag/"+route,{signal,
    headers:{Authorization:"Bearer "+token},...(body?{method:"POST",body:JSON.stringify(body)}:{})});
  return onRequest({request:req,params:{route:route.split("?")[0]},
    env:{FREITAG_GATEWAY:{fetch:r=>gateway.fetch(r,env)}}});
}

test("a 403 creating a Batch is separate from its catalog and file upload",async t=>{
  const calls=mockNetwork(t,path=>{
    if(path.endsWith("/models"))return Response.json({data:[{id:"claude-opus-5.5"}]});
    if(path.endsWith("/files"))return Response.json({id:"fixture-file"});
    return Response.json({error:{code:"FORBIDDEN",message:"private prompt and credential"}},
      {status:403,headers:{"cf-ray":"9012345678abcdef-FRA"}});
  });
  const r=await request("batch-start",chapter);
  assert.equal(r.status,403);
  const detail=await r.json();
  assert.equal(detail.upstreamStatus,403);
  assert.equal(detail.trace_id,"9012345678abcdef-FRA");
  assert.match(detail.error,/создание Batch.+FORBIDDEN/);
  assert.doesNotMatch(JSON.stringify(detail),/private prompt|credential/);
  assert.deepEqual(calls,["/v1/batches/models","/v1/files","/v1/batches"]);
});

test("a 524 before any chapter bytes reports the upstream and never resubmits",async t=>{
  const calls=mockNetwork(t,()=>new Response("private error page",{status:524}));
  const r=await request("chat",chapter);
  assert.equal(r.status,502);
  const detail=await r.json();
  assert.equal(detail.upstreamStatus,524);
  assert.match(detail.error,/BotHub.*524/);
  assert.doesNotMatch(JSON.stringify(detail),/private/);
  assert.deepEqual(calls,["/v1/chat/completions"]);
});

test("ApiMira public listing cannot validate a key rejected by the balance endpoint",async t=>{
  const calls=mockNetwork(t,path=>path.endsWith("/models")?
    Response.json({data:[{id:"anthropic/claude-opus-5.5"}]}):
    Response.json({error:{code:"PRIVATE_SECRET",message:"fixture-a",trace_id:"private-id"}},
      {status:401}));
  const r=await request("preflight?provider=apimira");
  assert.equal(r.status,401);
  const detail=await r.json();
  assert.match(detail.error,/проверка баланса/);
  assert.doesNotMatch(JSON.stringify(detail),/fixture-a|PRIVATE_|private-id/);
  assert.deepEqual(calls,["/v1/models","/v1/account/balance"]);
});

test("complete MCP pages arrive before one streaming request, which stays cancellable through Pages",async t=>{
  const canon="К".repeat(38000)+" конец канона";
  const last="начало главы "+"я".repeat(35000)+" конец главы";
  const embedded="предыдущая глава ".repeat(99);
  const prompt=chapter.messages[0].content+embedded+last.slice(34250,34601);
  const events=[], encoder=new TextEncoder(), controller=new AbortController();
  let stream, signal, paid=0;
  const calls=mockNetwork(t,(path,init)=>{
    if(path==="/mcp"){
      const rpc=JSON.parse(init.body),{name,arguments:args}=rpc.params;
      events.push(name);
      let value;
      if(name==="list_chapters")value={updatedAt:"2026-11-22T12:00:00Z",chapters:[
        {chapter:1,chars:embedded.length,title:"Первая"},{chapter:2,chars:last.length,title:"Вторая"}]};
      if(name==="get_book_context")value=canon;
      if(name==="read_chapter"){
        const source=args.chapter===1?embedded:last, end=args.offset+args.limit;
        value={chapter:args.chapter,offset:args.offset,totalChars:source.length,
          nextOffset:end<source.length?end:null,text:source.slice(args.offset,end)};
      }
      return Response.json({jsonrpc:"2.0",id:rpc.id,result:{content:[
        {type:"text",text:typeof value==="string"?value:JSON.stringify(value)}]}});
    }
    assert.equal(path,"/v1/chat/completions");
    paid++;signal=init.signal;
    assert.equal(init.headers.Accept,"text/event-stream");
    const body=JSON.parse(init.body);
    assert.equal(body.messages.at(-1).content,prompt);
    const sources=body.messages.find(m=>m.content.includes("Справочные материалы")).content;
    assert.ok(sources.includes(last) && sources.includes(canon));
    assert.ok(!sources.includes(embedded));
    assert.equal(body.max_tokens,14000);
    assert.equal(body.tools,undefined);
    assert.equal(body.stream,true);
    return new Response(new ReadableStream({start(c){stream=c;c.enqueue(encoder.encode("data: first\n\n"));}}),
      {headers:{"Content-Type":"text/event-stream"}});
  });
  const r=await request("chat",{...chapter,provider:"apimira",bookId:"fixture",messages:[{role:"user",content:prompt}]},controller.signal);
  assert.equal(r.status,200);
  const reader=r.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),"data: first\n\n");
  assert.deepEqual(events,["list_chapters","get_book_context","read_chapter","read_chapter","read_chapter","list_chapters"]);
  controller.abort();assert.ok(signal.aborted);
  stream.close();await reader.cancel();
  assert.equal(calls.at(-1),"/v1/chat/completions");
  assert.equal(paid,1);
});

test("an incomplete MCP page stops a chapter before either generation or upload",async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    if(path.endsWith("/models"))return Response.json({data:[chapter.model]});
    assert.equal(path,"/mcp");
    const rpc=JSON.parse(init.body);
    const content={list_chapters:JSON.stringify({updatedAt:"2026-11-22",chapters:[{chapter:1,chars:25}]}),
      get_book_context:"канон",read_chapter:'{"text":"private manuscript fragment"'}[rpc.params.name];
    return Response.json({jsonrpc:"2.0",id:rpc.id,result:{content:[{type:"text",text:content}]}});
  });
  for(const route of ["chat","batch-start"]){
    const r=await request(route,{...chapter,bookId:"fixture"});
    assert.equal(r.status,424);
    assert.doesNotMatch(await r.text(),/private manuscript/);
  }
  assert.ok(!calls.includes("/v1/chat/completions") && !calls.includes("/v1/files"));
});

test("a Batch greeting cannot start even the upload",async t=>{
  const calls=mockNetwork(t,()=>assert.fail("unexpected request"));
  assert.equal((await request("batch-start",{...chapter,messages:[{role:"user",content:"Привет!"}]})).status,400);
  assert.deepEqual(calls,[]);
});
