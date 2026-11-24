import {before, test} from "node:test";
import assert from "node:assert/strict";
import gateway from "../proxy/freitag-modelproxy-worker.js";
import booksMcp from "../proxy/books-mcp-worker.js";
import {draftDelivery,draftDeliveryLabel} from "../ai/draft-delivery.js";
import {onRequest} from "../functions/api/freitag/[route].js";

const env = {OWNER_UID:"fixture", BOTHUB_API_KEY:"fixture-b", APIMIRA_API_KEY:"fixture-a", AITUNNEL_API_KEY:"fixture-t",
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
function request(route,body,signal,bindings={}) {
  const req=new Request("https://preview.example/api/freitag/"+route,{signal,
    headers:{Authorization:"Bearer "+token},...(body?{method:"POST",body:JSON.stringify(body)}:{})});
  return onRequest({request:req,params:{route:route.split("?")[0]},
    env:{FREITAG_GATEWAY:{fetch:r=>gateway.fetch(r,{...env,...bindings})}}});
}

test("chapter delivery distinguishes character shortfalls and the provider token limit",()=>{
  const finished=draftDelivery("Объём главы — 18к символов.", "а".repeat(13000),"stop",14000);
  assert.equal(finished.characters,13000);
  assert.equal(finished.target,18000);
  assert.match(draftDeliveryLabel(finished),/Не хватает 5\s000 · Модель завершила ответ/);
  const truncated=draftDelivery("Не менее 18\u00a0000 знаков без пробелов.","а б\n в","length",9000);
  assert.equal(truncated.characters,3);
  assert.equal(truncated.target,18000);
  assert.match(draftDeliveryLabel(truncated),/Достигнут лимит 9\s000 токенов/);
  assert.equal(draftDelivery("Напиши до 18000 знаков.","Роман.","stop",14000).target,null);
  assert.equal(draftDelivery("Варианты 12000 и 18000 знаков. В прошлый раз было 13000 знаков.","Роман.","stop",14000).target,null);
});

test("AITUNNEL connection check authorizes the key and never calls generation", async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(init.headers.Authorization,"Bearer fixture-t");
    if(path==="/v1/models")return Response.json({data:[{id:"claude-opus-5.5"}]});
    if(path==="/v1/aitunnel/balance")return Response.json({balance:200,budget:175});
    assert.fail(path);
  });
  const response=await request("preflight?provider=aitunnel");
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,model:"claude-opus-5.5",balanceRub:200,budgetRub:175});
  assert.deepEqual(calls.sort(),["/v1/aitunnel/balance","/v1/models"]);
});

test("AITUNNEL quotes the exact payload and produces one private stream only after confirmation", async t=>{
  const input={...chapter,provider:"aitunnel",messages:[{role:"system",content:"  Инструкция\n"},...chapter.messages]};
  let paid=0,budget=200;
  const routes=mockNetwork(t,(path,init)=>{
    if(path==="/v1/aitunnel/balance")return Response.json({balance:225,budget});
    if(path.endsWith("/providers")){
      assert.equal(init.headers.Authorization,undefined);
      return Response.json({token_prices:true,providers:[{slug:"amazon-bedrock",service_tier:null,prompt_cost:800,completion_cost:4000}]});
    }
    if(path==="/v1/messages/count_tokens"){
      assert.equal(init.headers["X-AITunnel-Log"],"off");
      assert.deepEqual(JSON.parse(init.body),{model:"claude-opus-5.5",system:input.messages[0].content,messages:chapter.messages});
      return Response.json({input_tokens:100000});
    }
    assert.equal(path,"/v1/chat/completions");
    paid++;
    assert.equal(init.redirect,"manual");
    assert.equal(init.headers["X-AITunnel-Log"],"off");
    const body=JSON.parse(init.body);
    assert.deepEqual(body.messages,input.messages);
    assert.deepEqual(body.provider,{only:["amazon-bedrock"],data_collection:"deny",zdr:true,allow_fallbacks:false});
    assert.equal(body.tools,undefined);
    assert.equal(body.max_tokens,14000);
    assert.equal(body.stream_options.include_usage,true);
    return new Response('data: {"choices":[],"usage":{"cost_rub":123.45}}\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
  });
  assert.equal((await request("chat",input)).status,409);
  assert.deepEqual(routes,[]);
  const estimate=await (await request("quote",input)).json();
  assert.equal(estimate.estimateRub,136);
  assert.equal(estimate.ready,true);
  const confirmed={...input,aitunnelQuote:{fingerprint:estimate.fingerprint,estimateRub:estimate.estimateRub}};
  assert.equal((await request("chat",{...confirmed,outputTokenLimit:9000})).status,409);
  budget=100;
  assert.equal((await request("chat",confirmed)).status,402);
  assert.equal(paid,0);
  budget=200;
  const stream=await request("chat",confirmed);
  assert.equal(stream.status,200);
  assert.match(await stream.text(),/123\.45/);
  assert.equal(paid,1);
});

test("a 403 creating a Batch is separate from its catalog and file upload",async t=>{
  const calls=mockNetwork(t,async(path,init)=>{
    if(path.endsWith("/models"))return Response.json({data:[{id:"claude-opus-5.5"}]});
    if(path.endsWith("/files")){
      const file=await init.body.get("file").text();
      assert.equal(JSON.parse(file).body.max_tokens,32000);
      return Response.json({id:"fixture-file"});
    }
    return Response.json({error:{code:"FORBIDDEN",message:"private prompt and credential"}},
      {status:403,headers:{"cf-ray":"9012345678abcdef-FRA"}});
  });
  const r=await request("batch-start",{...chapter,outputTokenLimit:32000});
  assert.equal(r.status,403);
  const detail=await r.json();
  assert.equal(detail.upstreamStatus,403);
  assert.equal(detail.trace_id,"9012345678abcdef-FRA");
  assert.match(detail.error,/создание Batch.+FORBIDDEN/);
  assert.doesNotMatch(JSON.stringify(detail),/private prompt|credential/);
  assert.deepEqual(calls,["/v1/batches/models","/v1/files","/v1/batches"]);
});

test("the common chapter ceiling reaches the provider while arbitrary lengths are rejected",async t=>{
  const sent=[];
  mockNetwork(t,(path,init)=>{
    assert.ok(["/api/v2/anthropic/v1/messages","/v1/chat/completions"].includes(path));
    const {model,max_tokens}=JSON.parse(init.body);
    sent.push([model,max_tokens]);
    return new Response("data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
  });
  const cases=[["claude-opus-5.5",20000],["claude-opus-5.5",32000],["claude-sonnet-5.5",32000]];
  for(const [model,outputTokenLimit] of cases){
    const reply=await request("chat",{...chapter,model,outputTokenLimit});
    assert.equal(reply.status,200);
    await reply.text();
  }
  assert.equal((await request("chat",{...chapter,outputTokenLimit:64000})).status,400);
  const alternative=await request("chat",{...chapter,provider:"apimira",outputTokenLimit:32000});
  assert.equal(alternative.status,200);
  await alternative.text();
  assert.deepEqual(sent,[...cases,["anthropic/claude-opus-5.5",32000]]);
});

test("ApiMira quotes the current book and authentic price before one bounded chapter",async t=>{
  const snapshot={title:"Тестовая книга",context:"Утверждённый канон.",updatedAt:"2026-11-24T12:00:00Z",
    chapters:[{title:"Глава 1",text:"Текст первой главы."},{title:"Глава 2",text:"Вторая глава."}]};
  const bindings={FREITAG_PROVIDER_GATEWAY:"1",BOOKS:{async get(key){
    assert.equal(key,"book:fixture");return structuredClone(snapshot);
  }}};
  const input={...chapter,provider:"apimira",bookId:"fixture",outputTokenLimit:32000};
  let price=5;
  const sent=[];
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(init.headers.Authorization,"Bearer fixture-a");
    assert.equal(init.redirect,"manual");
    if(path==="/v1/account/pricing")return Response.json({data:[{id:"anthropic/claude-opus-5.5",
      input_usd_per_1m_tokens:1.25,output_usd_per_1m_tokens:price,context_window:266000}]});
    if(path==="/v1/account/balance")return Response.json({balance_usd:1.20});
    if(path==="/v1/messages/count_tokens"){
      const body=JSON.parse(init.body);
      assert.match(body.system,/Утверждённый канон/);
      assert.match(body.system,/Вторая глава/);
      assert.deepEqual(body.messages,input.messages);
      return Response.json({input_tokens:32000});
    }
    assert.equal(path,"/v1/chat/completions");
    sent.push(JSON.parse(init.body));
    return new Response("data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream","X-Request-Id":"fixture-charge"}});
  });
  const preflight=await request("preflight?provider=apimira",undefined,undefined,bindings);
  assert.equal(preflight.status,200);
  assert.equal((await preflight.json()).balanceUsd,1.20);
  const quote=(await (await request("quote",input,undefined,bindings)).json());
  assert.equal(quote.ready,true);
  assert.equal(quote.estimateUsd,.20);
  assert.equal(quote.budgetUsd,.50);
  assert.deepEqual(quote.source.chapters,[1,2]);
  assert.doesNotMatch(JSON.stringify(quote),/Вторая глава|Утверждённый канон/);
  assert.equal((await request("chat",input,undefined,bindings)).status,409);
  const confirmed={...input,apimiraQuote:{fingerprint:quote.fingerprint,estimateUsd:quote.estimateUsd}};
  const revision=snapshot.updatedAt;
  snapshot.updatedAt="2026-11-24T12:01:00Z";
  assert.equal((await request("chat",confirmed,undefined,bindings)).status,409);
  snapshot.updatedAt=revision;
  price=30;
  assert.equal((await request("chat",confirmed,undefined,bindings)).status,402);
  assert.deepEqual(sent,[]);
  price=5;
  const reply=await request("chat",confirmed,undefined,bindings);
  assert.equal(reply.status,200);
  await reply.text();
  assert.equal(sent.length,1);
  assert.equal(sent[0].max_tokens,32000);
  assert.equal(sent[0].tools,undefined);
  assert.ok(calls.filter(path=>path==="/v1/chat/completions").length===1);
});

test("ApiMira rejects upstream redirects without forwarding its key",async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(init.redirect,"manual");
    if(path==="/v1/account/balance")return Response.json({balance_usd:1.20});
    assert.equal(path,"/v1/account/pricing");
    return new Response(null,{status:307,headers:{Location:"https://elsewhere.example/"}});
  });
  const response=await request("preflight?provider=apimira",undefined,undefined,{FREITAG_PROVIDER_GATEWAY:"1"});
  assert.equal(response.status,502);
  assert.equal((await response.json()).upstreamStatus,307);
  assert.deepEqual(calls,["/v1/account/pricing","/v1/account/balance"]);
});

test("chapter previews are free and the confirmed request is handed to the private queue once",async t=>{
  const calls=mockNetwork(t,()=>{throw Error("The model must not start in the browser request");});
  const accepted=[];
  const bindings={CHAPTER_JOBS:{idFromName:uid=>uid,get:uid=>({async fetch(target,opt){
    assert.equal(uid,"fixture");assert.equal(target,"https://freitag-jobs.internal/");
    accepted.push(JSON.parse(opt.body));
    return Response.json({ok:true},{status:202});
  }})}};
  const quote=await request("quote",chapter,undefined,bindings);
  assert.equal(quote.status,200);
  const estimate=await quote.json();
  assert.equal(estimate.approximate,true);
  assert.ok(estimate.estimateRub>0);
  assert.equal(estimate.outputTokenLimit,14000);
  const job={id:"a-job",chatId:"a-chat",projectId:"a-book",projectName:"Тест"};
  assert.equal((await request("chapter-jobs",{...chapter,job,apimiraQuote:{}},undefined,bindings)).status,409);
  assert.equal((await request("chapter-jobs",{...chapter,job,contextQuote:"stale"},undefined,bindings)).status,409);
  assert.equal((await request("chapter-jobs",{...chapter,job,contextQuote:estimate.fingerprint},undefined,bindings)).status,202);
  assert.equal(accepted.length,1);
  assert.equal(accepted[0].prepared.body.messages.at(-1).content,chapter.messages.at(-1).content);
  assert.doesNotMatch(JSON.stringify(accepted[0]),/Bearer|fixture-b/);
  assert.deepEqual(calls,[]);
});

test("a BotHub receipt reports charges only for an exact transaction identifier",async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(path,"/api/v2/transaction/list");
    assert.equal(init.headers.Authorization,"Bearer fixture-b");
    return Response.json({data:[
      {id:"same-id",type:"REPLINSH",status:"SUCCEDED",actual:300,currency:"RUB"},
      {id:"old-id",externalId:"other-message",type:"WRITE_OFF",status:"SUCCEDED",amount:-8000,currency:"BOTHUB_TOKEN"},
      {id:"billing-id",externalId:"message-id",type:"WRITE_OFF",status:"SUCCEDED",amount:-4212,rubAmount:2.31,currency:"BOTHUB_TOKEN"}
    ]});
  });
  assert.deepEqual(await (await request("receipt?id=unknown&also=message-id")).json(),{ok:true,costRub:2.31,costCaps:4212});
  assert.deepEqual(await (await request("receipt?id=same-id")).json(),{ok:true,pending:true});
  assert.equal(calls.length,2);
});

test("a 524 before any chapter bytes reports the upstream and never resubmits",async t=>{
  const calls=mockNetwork(t,()=>new Response("private error page",{status:524}));
  const r=await request("chat",chapter);
  assert.equal(r.status,502);
  const detail=await r.json();
  assert.equal(detail.upstreamStatus,524);
  assert.match(detail.error,/BotHub.*524/);
  assert.doesNotMatch(JSON.stringify(detail),/private/);
  assert.deepEqual(calls,["/api/v2/anthropic/v1/messages"]);
});

test("BotHub Chapters ignore reasoning and keep a truncated Anthropic stream incomplete", async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(path,"/api/v2/anthropic/v1/messages");
    assert.equal(init.headers.Authorization,"Bearer fixture-b");
    assert.equal(init.headers["anthropic-version"],"2023-06-01");
    assert.equal(init.redirect,"manual");
    const raw=[{type:"ping"},{type:"content_block_delta",delta:{type:"thinking_delta",thinking:"внутренний текст"}},
      {type:"content_block_delta",delta:{type:"text_delta",text:"Начало главы"}},
      {type:"message_delta",delta:{stop_reason:"end_turn"}}];
    return new Response(raw.map(data=>`event: ${data.type}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`).join(""),
      {headers:{"Content-Type":"text/event-stream"}});
  });
  const res=await request("chat",chapter);
  assert.equal(res.status,200);
  const out=await res.text();
  assert.match(out,/keep-alive/);
  assert.match(out,/Начало главы/);
  assert.doesNotMatch(out,/внутренний текст|finish_reason":"stop|\[DONE\]/);
  assert.deepEqual(calls,["/api/v2/anthropic/v1/messages"]);
});

test("BotHub preflight checks only the Anthropic model catalog with the saved key", async t=>{
  const calls=mockNetwork(t,(path,init)=>{
    assert.equal(path,"/api/v2/anthropic/v1/models");
    assert.equal(init.headers.Authorization,"Bearer fixture-b");
    assert.equal(init.method,undefined);
    assert.equal(init.redirect,"manual");
    return Response.json({data:[{id:"claude-opus-5.5"}]});
  });
  const answer=await request("preflight?provider=bothub&model=claude-opus-5.5");
  assert.equal(answer.status,200);
  assert.equal((await answer.json()).chapterApi,"anthropic-messages");
  assert.deepEqual(calls,["/api/v2/anthropic/v1/models"]);
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
    assert.equal(body.messages.length,2,"only the preloaded book and original prompt");
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

test("BotHub can include whole early chapters and bounded excerpts from the rest of the same book",async t=>{
  const early="Первая строка ранней главы. "+"Абзац ранней главы. ".repeat(1600)+" Последняя строка ранней главы.";
  const book={title:"Тестовый роман",updatedAt:"2026-11-22T12:00:00Z",context:"Тестовый канон",chapters:[
    {title:"Первая",text:early},
    {title:"Вторая",text:"Далекий пролог главы. "+"Переходный абзац. ".repeat(80)+" В синей папке лежало письмо о ключе. "+"Не относящийся к запросу конец. ".repeat(80)},
    {title:"Третья",text:"Текст третьей главы."},
    {title:"Четвертая",text:"Текст четвертой главы."}
  ]};
  let paid=0;
  const tools=[];
  mockNetwork(t,async(path,init)=>{
    if(path==="/mcp"){
      const rpc=JSON.parse(init.body);
      assert.equal(rpc.params.arguments.book_id,"fixture");
      tools.push(rpc.params.name);
      return booksMcp.fetch(new Request(env.BOOKS_MCP_URL,init),{
        MCP_READ_KEY:env.MCP_READ_KEY,BOOKS:{get:async key=>{
          assert.equal(key,"book:fixture");
          return book;
        }}
      });
    }
    paid++;
    assert.equal(path,"/api/v2/anthropic/v1/messages");
    const body=JSON.parse(init.body);
    const sources=body.system[0].text;
    assert.ok(sources.includes(early),"both pages of the explicitly chosen chapter must arrive");
    assert.match(sources,/Выписки из других глав[\s\S]*В синей папке лежало письмо о ключе/);
    assert.doesNotMatch(sources,/Текст третьей главы|Текст четвертой главы|Далекий пролог главы/);
    assert.equal(body.tools,undefined);
    return new Response("data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
  });
  const send=text=>request("chat",{...chapter,bookId:"fixture",messages:[{role:"user",content:text}]});
  const response=await send("Продолжи сцену\n\nГлавы для контекста: 1\nПоиск по книге: письмо о ключе");
  assert.equal(response.status,200);
  await response.text();
  assert.equal(paid,1);
  assert.deepEqual(tools,["list_chapters","get_book_context","read_chapter","read_chapter","search_book","list_chapters"]);
  assert.equal((await send("Новая сцена\nГлавы для контекста: 99")).status,424);
  assert.equal((await send("Новая сцена\nПоиск по книге: точного совпадения нет")).status,424);
  assert.equal((await send("Новая сцена\nГлавы для контекста: 1, 2, 3")).status,424);
  assert.equal(paid,1,"source errors must not start a second paid request");
});

test("a plain chapter request automatically retrieves early passages without another paid call",async t=>{
  const book={title:"Тестовый роман",updatedAt:"2026-11-22T12:00:00Z",context:"Синопсис всего романа",chapters:[
    {title:"Первая",text:"Усадьба стояла пустой. ".repeat(90)+"В мастерской Марта спрятала фамильный медальон в синюю папку. "+"Другие события. ".repeat(90)},
    {title:"Вторая",text:"Незнакомый двор и посторонний разговор. ".repeat(90)},
    {title:"Третья",text:"Вся предпоследняя глава."},
    {title:"Четвертая",text:"Вся последняя глава. Глеб вернулся за медальоном."}
  ]};
  const task="Продолжи сцену. Вспомни, где Марта спрятала медальон.";
  let actualSnapshot=book, modelRequests=0;
  const calls=mockNetwork(t,async(path,init)=>{
    if(path==="/mcp"){
      return booksMcp.fetch(new Request(env.BOOKS_MCP_URL,init),{
        MCP_READ_KEY:env.MCP_READ_KEY,BOOKS:{get:async key=>{
          assert.equal(key,"book:fixture");
          return book;
        }}
      });
    }
    modelRequests++;
    assert.equal(path,"/api/v2/anthropic/v1/messages");
    const body=JSON.parse(init.body), sources=body.system[0].text;
    assert.equal(body.messages.at(-1).content,task);
    assert.match(sources,/Синопсис всего романа/);
    assert.match(sources,/Вся предпоследняя глава/);
    assert.match(sources,/Вся последняя глава/);
    assert.ok(!sources.includes(book.chapters[0].text));
    if(actualSnapshot===book){
      assert.match(sources,/Связанные фрагменты из ранних глав[\s\S]*Марта спрятала фамильный медальон/);
      assert.ok(sources.split("Связанные фрагменты из ранних глав")[1].length<3000);
    }else assert.doesNotMatch(sources,/Марта спрятала фамильный медальон/);
    return new Response("data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
  });
  const makeRequest=()=>request("chat",{...chapter,bookId:"fixture",messages:[{role:"user",content:task}]},
    undefined,{BOOKS:{get:async key=>{assert.equal(key,"book:fixture");return actualSnapshot;}}});
  assert.equal((await makeRequest()).status,200);
  assert.equal(modelRequests,1);
  actualSnapshot={...book,updatedAt:"2026-11-21T12:00:00Z"};
  assert.equal((await makeRequest()).status,200);
  assert.equal(modelRequests,2);
  assert.equal(calls.filter(path=>path!=="/mcp").length,2);
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
