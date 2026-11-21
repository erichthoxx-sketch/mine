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
  const env = {OWNER_UID:"owner",MODELPROXY_API_KEY:"mp-test",BOOKS:{get:async()=>book}};
  const headers = {Origin:ORIGIN,Authorization:"Bearer "+token};
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({input,init});
    if (String(input).includes("googleapis.com"))
      return Response.json({keys:[jwk]});
    if (String(input)==="https://api.modelproxy.org/v1/chat/completions")
      return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\\n\\n', {
        headers:{"Content-Type":"text/event-stream"}});
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
  } finally {globalThis.fetch=original;}
});

test("browser and Pages bridge must reject an old Polza gateway", async () => {
  const app = await readFile(new URL("../ai/app.js",import.meta.url),"utf8");
  const pages = await readFile(new URL("../functions/api/freitag/[route].js",import.meta.url),"utf8");
  assert.match(app,/health\\.provider!=="ModelProxy"/);
  assert.match(app,/modelproxyMessages/);
  assert.match(app,/gateway\\+"\\/snapshot\\?bookId="/);
  assert.match(pages,/route === "snapshot"/);
});
