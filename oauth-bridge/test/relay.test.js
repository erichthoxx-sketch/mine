import test from "node:test";
import assert from "node:assert/strict";
import { checkRpc, filterRpcResponse, proxyMcp, ALLOWED_TOOLS } from "../src/relay.js";

const req = body => new Request("https://masterskaya-chatgpt-oauth.example/mcp", {
  method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
});
const env = { OWNER_GITHUB_ID:"112233", MCP_READ_KEY:"a".repeat(64) };
const props = { githubId:"112233" };
const rpc = (method, params) => ({jsonrpc:"2.0",id:1,method,params});

test("only manuscript tools are exposed", () => {
  assert.deepEqual(ALLOWED_TOOLS,[
    "list_books","get_book_context","list_chapters","read_chapter","search_book"
  ]);
  const response=filterRpcResponse(rpc("tools/list"), {
    jsonrpc:"2.0",id:1,result:{tools:[
      {name:"list_books"},{name:"get_income_overview"},{name:"read_chapter"},
      {name:"get_direct_campaign"},{name:"delete_book"},{name:"search_book"}
    ]}
  });
  assert.deepEqual(response.result.tools.map(x=>x.name),
    ["list_books","read_chapter","search_book"]);
});
test("reject marketing and write calls even for authenticated owner",()=>{
  for (const name of ["get_income_overview","get_direct_campaign","delete_book","sync/all","__proto__"]){
    assert.equal(checkRpc(JSON.stringify(rpc("tools/call",{name,arguments:{}}))).error.error.code,-32601);
  }
  for (const method of ["resources/list","prompts/list","shutdown","POST /sync/all"])
    assert.equal(checkRpc(JSON.stringify(rpc(method))).error.error.code,-32601);
});
test("valid book tools and MCP initialize are accepted",()=>{
  assert.ok(checkRpc(JSON.stringify(rpc("initialize",{protocolVersion:"2025-03-26"}))).message);
  assert.ok(checkRpc(JSON.stringify(rpc("tools/call",{name:"read_chapter",arguments:{book_id:"b",chapter:1}}))).message);
  assert.equal(checkRpc("{").error.error.code,-32700);
  assert.equal(checkRpc("[]").error.error.code,-32600);
  assert.equal(checkRpc("x".repeat(140000)).error.error.code,-32600);
});
test("anonymous or another Github user cannot reach old MCP Worker",async()=>{
  let upstreamCalls=0;
  const fetcher=async()=>{upstreamCalls++;throw Error("must not call upstream")};
  for (const identity of [null,{githubId:"another"},{githubId:"999"}]){
    const response=await proxyMcp(req(rpc("tools/list")),env,identity,fetcher);
    assert.equal(response.status,403);
  }
  assert.equal(upstreamCalls,0);
});
test("owner gets only filtered tool catalog; MCP_READ_KEY never in response",async()=>{
  let calls=0;
  const response=await proxyMcp(req(rpc("tools/list")),env,props,async(input,init)=>{
    calls++;
    assert.equal(String(input),"https://masterskaya-ai.erichtho-xx.workers.dev/mcp");
    assert.equal(init.headers.Authorization,"Bearer "+"a".repeat(64));
    return Response.json({jsonrpc:"2.0",id:1,result:{tools:[
      {name:"list_books"},{name:"get_income_overview"},{name:"read_chapter"}
    ]}});
  });
  assert.equal(calls,1);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.result.tools.map(x=>x.name),["list_books","read_chapter"]);
  assert.doesNotMatch(JSON.stringify(body),/"a"{32,}/);
});
test("never forwards unknown tool, even with owner's credentials",async()=>{
  let calls=0;
  const response=await proxyMcp(req(rpc("tools/call",{
    name:"get_income_overview",arguments:{}
  })),env,props,async()=>{calls++;throw Error("bad")});
  assert.equal(response.status,400);
  assert.equal(calls,0);
});
test("no MCP_read_key or allowed GitHub id means no access",async()=>{
  for(const badEnv of [
    {...env,MCP_READ_KEY:"short"}, {...env,OWNER_GITHUB_ID:""},
    {...env,MCP_READ_KEY:""}
  ]){
    const response=await proxyMcp(req(rpc("tools/list")),badEnv,props);
    assert.equal(response.status,403);
  }
});
